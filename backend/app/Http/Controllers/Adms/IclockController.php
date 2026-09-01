<?php

namespace App\Http\Controllers\Adms;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Services\Biometric\AdmsIngestionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * ZKTeco ADMS / "iclock" endpoints. The terminal calls these itself; all
 * responses are plain text. Every request is logged to storage/logs/iclock.log
 * so we can see exactly what a given device firmware sends.
 */
class IclockController extends Controller
{
    public function __construct(private readonly AdmsIngestionService $adms) {}

    /** GET = handshake (device asks for options); POST = data push (ATTLOG, …). */
    public function cdata(Request $request): Response
    {
        $this->recordRequest($request);

        $sn = (string) $request->query('SN', '');

        if ($request->isMethod('get')) {
            return $this->text($this->adms->handshake($sn));
        }

        $table = (string) $request->query('table', '');
        $count = $this->adms->receive($sn, $table, $request->getContent());

        return $this->text("OK: {$count}");
    }

    /**
     * Device polls here for queued commands. If an admin has queued a one-shot
     * command on the device (e.g. DATA QUERY ATTLOG to re-upload stored history),
     * we hand it over once and clear it; otherwise there is nothing to do.
     */
    public function getrequest(Request $request): Response
    {
        $this->recordRequest($request);

        $sn = (string) $request->query('SN', '');
        if ($sn !== '') {
            $device = AttendanceDevice::query()
                ->withoutGlobalScopes()
                ->where('serial_no', $sn)
                ->where('is_active', true)
                ->first();

            if ($device && $device->pending_command) {
                $command = $device->pending_command;
                $device->forceFill(['pending_command' => null])->save(); // one-shot
                \Illuminate\Support\Facades\Log::info("ADMS: dispatched command to {$sn}: {$command}");

                return $this->text($command);
            }
        }

        return $this->text('OK');
    }

    /** Device reports command execution results. */
    public function devicecmd(Request $request): Response
    {
        $this->recordRequest($request);

        return $this->text('OK');
    }

    /** Any other iclock path (fdata, edata, ping, …). */
    public function fallback(Request $request): Response
    {
        $this->recordRequest($request);

        return $this->text('OK');
    }

    private function text(string $body): Response
    {
        return response($body, 200)->header('Content-Type', 'text/plain');
    }

    /**
     * Log the raw request AND stamp the device's heartbeat.
     *
     * Every iclock call counts: the terminals poll getrequest every ~30 seconds
     * around the clock, so `last_seen_at` is what tells us a unit is still connected.
     * `last_event_at` only moves when punches arrive, which makes a quiet site look
     * identical to an unplugged terminal — the down alert reads last_seen_at exactly
     * so it never pages anyone over an idle Sunday.
     */
    private function recordRequest(Request $request): void
    {
        $this->stampHeartbeat((string) $request->query('SN', ''));

        $entry = sprintf(
            "[%s] %s %s\nBODY: %s\n%s\n",
            now()->toDateTimeString(),
            $request->method(),
            $request->fullUrl(),
            $request->getContent() !== '' ? $request->getContent() : '(empty)',
            str_repeat('-', 60),
        );

        $path = storage_path('logs/iclock.log');
        $this->rotateIfLarge($path);

        $written = file_put_contents($path, $entry, FILE_APPEND | LOCK_EX);
        if ($written === false) {
            \Illuminate\Support\Facades\Log::channel('single')->info('iclock request (file write failed): ' . $entry);
        }
    }

    /** Roll the log over once it passes this size. */
    private const MAX_LOG_BYTES = 64 * 1024 * 1024;

    /** How many rotated archives to keep. */
    private const KEEP_ARCHIVES = 4;

    /**
     * Size-rotate the ADMS log.
     *
     * Nine terminals poll every ~30 seconds and every request is logged in full, so
     * this file grew about 4.5 MB a day and had reached 137 MB unbounded — big enough
     * to be impractical to open, and eventually a disk problem.
     *
     * Rotation is by SIZE and keeps the active file at the same path on purpose: the
     * anomaly detector reads `iclock.log` for device USER records, and a dated
     * filename would have silently broken that fallback (it now reads the archives
     * too). Failures here must never interfere with accepting a punch.
     */
    private function rotateIfLarge(string $path): void
    {
        try {
            // filesize() reads PHP's stat cache, which still holds the pre-rotation size
            // right after a roll-over and would immediately rotate the fresh, empty file.
            clearstatcache(true, $path);

            if (! is_file($path) || filesize($path) < self::MAX_LOG_BYTES) {
                return;
            }

            $archive = storage_path('logs/iclock-'.now()->format('Ymd-His').'.log');
            if (! @rename($path, $archive)) {
                return; // locked by another worker - it will roll over on a later request
            }

            $existing = glob(storage_path('logs/iclock-*.log')) ?: [];
            if (count($existing) > self::KEEP_ARCHIVES) {
                sort($existing); // filenames are timestamped, so this is oldest-first
                foreach (array_slice($existing, 0, count($existing) - self::KEEP_ARCHIVES) as $old) {
                    @unlink($old);
                }
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Record that this serial just contacted us. A bare query-builder update on
     * purpose: it runs on every poll from every terminal (~18 a minute), so it must
     * not fire model events or the company scope — and must never break ingestion.
     */
    private function stampHeartbeat(string $sn): void
    {
        if ($sn === '') {
            return;
        }

        try {
            \Illuminate\Support\Facades\DB::table('attendance_devices')
                ->where('serial_no', $sn)
                ->update(['last_seen_at' => now()]);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
