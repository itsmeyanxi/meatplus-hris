<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Services\Biometric\BiometricDigestBuilder;
use Illuminate\Console\Command;

/**
 * Send the ONE daily biometric notice: offline terminals, PIN-reuse collisions, and
 * punches landing on nobody, merged into a single bell item per person.
 *
 * Replaces per-terminal and per-collision alerting, which produced far more
 * notifications than anyone read. Sends nothing at all when nothing is wrong.
 */
class SendBiometricDigest extends Command
{
    protected $signature = 'attendance:biometric-digest';

    protected $description = 'Send the daily biometric health digest to IT and HR';

    public function handle(BiometricDigestBuilder $digest): int
    {
        $r = $digest->sendDaily();

        if ($r['recipients'] === 0) {
            $this->info('Nothing to report — no digest sent.');

            return self::SUCCESS;
        }

        $this->info(
            "Digest sent to {$r['recipients']} recipient(s) — "
            ."{$r['offline']} terminal(s) offline, {$r['collisions']} ID collision(s), "
            .number_format($r['staged']).' staged punch(es).'
        );
        $this->line($r['emailed']
            ? 'Delivered by bell + email (Monday/Friday).'
            : 'Delivered by bell only; email goes out on Mondays and Fridays.');

        return self::SUCCESS;
    }
}
