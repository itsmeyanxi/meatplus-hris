<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\BiometricAnomaly;
use App\Domain\HRIS\Models\Employee;
use Illuminate\Support\Facades\DB;

/**
 * Finds "PIN reuse collisions" so the daily digest can report them.
 *
 * Symptom (real case: Saludaga/Robby): an employee was re-enrolled on the terminal
 * under a new PIN and their biometric_user_id was updated to it. Their OLD employee
 * number was then reused on the device for a DIFFERENT person. Because punch
 * matching falls back to employee_no when a PIN matches no biometric_user_id, that
 * new person's punches get credited to the original employee.
 *
 * We flag an (employee, pin) pair when ALL hold for recent punches:
 *  - the pin equals the employee's employee_no (so it matched via the fallback),
 *  - the pin is NOT that employee's biometric_user_id, and no employee owns the pin
 *    as a biometric_user_id (i.e. the fallback is genuinely what caught it),
 *  - the DEVICE has a name enrolled under that pin, and that name is not similar to
 *    the employee's name (a mere spelling variant is not a collision).
 */
class BiometricAnomalyDetector
{
    /** Only consider punches this recent — we alert on live, ongoing misattribution. */
    private const WINDOW_DAYS = 45;

    /** Below this name similarity (%), the device name is treated as a different person. */
    private const SIMILARITY_FLOOR = 55.0;

    /**
     * Detect current collisions.
     *
     * @return array<int, array{company_id:?int, employee_id:int, employee_name:string, pin:string, device_key:?string, device_name:string, punches:int}>
     */
    public function detect(): array
    {
        $pinNames = $this->deviceNames();
        if (! $pinNames) {
            return [];
        }

        $employees = Employee::withoutGlobalScopes()->get(['id', 'company_id', 'employee_no', 'biometric_user_id', 'first_name', 'middle_name', 'last_name']);
        $byId = $employees->keyBy('id');
        $ownedByBio = [];
        foreach ($employees as $e) {
            if ($e->biometric_user_id !== null && $e->biometric_user_id !== '') {
                $ownedByBio[(string) $e->biometric_user_id] = true;
            }
        }

        $since = now()->subDays(self::WINDOW_DAYS)->toDateTimeString();
        $rows = DB::table('time_logs')
            ->whereNotNull('metadata')
            ->where('logged_at', '>=', $since)
            ->select('employee_id', 'device_id', DB::raw("metadata->>'pin' as pin"), DB::raw('count(*) as c'))
            ->groupBy('employee_id', 'device_id', DB::raw("metadata->>'pin'"))
            ->get();

        $anomalies = [];
        foreach ($rows as $r) {
            $pin = (string) $r->pin;
            if ($pin === '') {
                continue;
            }
            $e = $byId->get($r->employee_id);
            if (! $e) {
                continue;
            }
            // Matched via employee_no fallback (not this employee's bio, and no bio owns it).
            if ($pin !== (string) $e->employee_no) {
                continue;
            }
            if ($pin === (string) $e->biometric_user_id) {
                continue;
            }
            if (isset($ownedByBio[$pin])) {
                continue;
            }
            $deviceNames = $pinNames[$pin] ?? [];
            if (! $deviceNames) {
                continue; // device never told us a name — cannot judge, don't cry wolf
            }
            if ($this->namesLookLikeSamePerson($deviceNames, $e)) {
                continue; // just a spelling variant of the same person
            }

            $anomalies[] = [
                'company_id' => $e->company_id,
                'employee_id' => (int) $e->id,
                'employee_name' => Employee::formatName($e->first_name, $e->last_name),
                'pin' => $pin,
                'device_key' => $r->device_id,
                'device_name' => $this->prettyDeviceName($deviceNames),
                'punches' => (int) $r->c,
            ];
        }

        // Aggregate to one row per (employee, pin) — a pin can appear on >1 device.
        $merged = [];
        foreach ($anomalies as $a) {
            $key = $a['employee_id'].'|'.$a['pin'];
            if (! isset($merged[$key])) {
                $merged[$key] = $a;
            } else {
                $merged[$key]['punches'] += $a['punches'];
            }
        }

        return array_values($merged);
    }

    /**
     * Detect, persist new/updated rows, and mark resolved the ones that no longer
     * appear. Deliberately does NOT notify: telling HR is the daily digest's job (see
     * BiometricDigestBuilder), which reads the open rows this leaves behind.
     *
     * Alerting from here produced one bell item per collision the moment it was found
     * — 131 of them at 12% read, while the two real problems stayed unfixed for twelve
     * days. Detection running hourly is right; announcing hourly was not.
     *
     * @return array{new:int, ongoing:int, resolved:int}
     */
    public function sync(): array
    {
        $current = $this->detect();
        $currentKeys = [];
        $new = 0;
        $ongoing = 0;

        foreach ($current as $a) {
            $key = $a['employee_id'].'|'.$a['pin'];
            $currentKeys[$key] = true;

            $row = BiometricAnomaly::firstOrNew([
                'employee_id' => $a['employee_id'],
                'pin' => $a['pin'],
                'kind' => 'pin_reuse_collision',
            ]);

            // A brand-new collision, or one that had been resolved and is back. Purely
            // a count for the command's output now — the digest decides what gets said.
            $isNew = ! $row->exists || $row->resolved_at !== null;
            $row->fill([
                'company_id' => $a['company_id'],
                'device_key' => $a['device_key'],
                'device_name' => $a['device_name'],
                'punches' => $a['punches'],
                'detail' => "PIN {$a['pin']} is enrolled on the device as \"{$a['device_name']}\" but matches {$a['employee_name']} by employee number.",
                'resolved_at' => null,
            ]);

            // Stamp detected_at ONLY when the collision first appears (or comes back
            // after being resolved). Refreshing it every hourly scan reset the clock,
            // so a problem open since 13 Aug kept reporting itself as found today —
            // which is exactly how two of these went twelve days without anyone
            // realising they were stale rather than new.
            if ($isNew || $row->detected_at === null) {
                $row->detected_at = now();
            }
            $row->save();

            $isNew ? $new++ : $ongoing++;
        }

        // Anything previously open but no longer detected is resolved.
        $resolved = 0;
        $open = BiometricAnomaly::whereNull('resolved_at')->get(['id', 'employee_id', 'pin']);
        foreach ($open as $row) {
            if (! isset($currentKeys[$row->employee_id.'|'.$row->pin])) {
                $row->forceFill(['resolved_at' => now()])->save();
                $resolved++;
            }
        }

        return ['new' => $new, 'ongoing' => $ongoing, 'resolved' => $resolved];
    }

    /**
     * Device PIN -> list of enrolled names. Primary source is the per-device JSON
     * captured from USERINFO pushes; the raw ADMS log is a best-effort fallback.
     *
     * @return array<string, array<int, string>>
     */
    private function deviceNames(): array
    {
        $out = [];

        $dir = storage_path('app/device_users');
        if (is_dir($dir)) {
            foreach (glob($dir.'/*.json') as $file) {
                $map = json_decode((string) file_get_contents($file), true) ?: [];
                foreach ($map as $pin => $name) {
                    $name = trim((string) $name);
                    if ($name !== '') {
                        $out[(string) $pin][$name] = true;
                    }
                }
            }
        }

        // Fallback: parse USER records from the ADMS log (best-effort; may be locked).
        // The log is size-rotated (see IclockController), so read the archives too —
        // a terminal announces its enrolled users only occasionally, and reading just
        // the active file would lose every name pushed before the last rotation.
        $logs = array_merge(
            glob(storage_path('logs/iclock-*.log')) ?: [],
            [storage_path('logs/iclock.log')],
        );
        foreach ($logs as $log) {
            if (! is_file($log) || ! ($fh = @fopen($log, 'r'))) {
                continue;
            }
            while (($line = @fgets($fh)) !== false) {
                if (strpos($line, 'USER PIN=') !== false
                    && preg_match('/USER PIN=([^\t]+)\tName=([^\t]*)\t/', $line, $m)) {
                    $pin = trim($m[1]);
                    $name = trim($m[2]);
                    if ($pin !== '' && $name !== '') {
                        $out[$pin][$name] = true;
                    }
                }
            }
            fclose($fh);
        }

        return array_map(fn ($set) => array_keys($set), $out);
    }

    /** True when the device's name(s) are just a spelling variant of the employee. */
    private function namesLookLikeSamePerson(array $deviceNames, Employee $e): bool
    {
        $sq = fn ($s) => preg_replace('/[^a-z]/', '', strtolower((string) $s));
        $empKeys = [$sq($e->first_name.$e->last_name), $sq($e->first_name.$e->middle_name.$e->last_name)];

        foreach ($deviceNames as $dn) {
            $d = $sq($dn);
            if ($d === '') {
                continue;
            }
            foreach ($empKeys as $ek) {
                if ($ek === '') {
                    continue;
                }
                if ($d === $ek || str_contains($d, $ek) || str_contains($ek, $d)) {
                    return true;
                }
                $pct = 0.0;
                similar_text($d, $ek, $pct);
                if ($pct >= self::SIMILARITY_FLOOR) {
                    return true;
                }
            }
        }

        return false;
    }

    private function prettyDeviceName(array $deviceNames): string
    {
        // Insert spaces into a squished device name ("Jeffreysaludaga") only for
        // display is overkill; just present the raw enrolled string(s).
        return implode(' / ', array_slice($deviceNames, 0, 3));
    }
}
