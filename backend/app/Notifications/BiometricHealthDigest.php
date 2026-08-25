<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The single daily biometric notice: offline terminals, PIN-reuse collisions, and
 * punches landing on nobody — one bell item instead of one per problem.
 *
 * Replaces the per-device offline alert and the per-collision mapping alert. Those
 * fanned out badly: 131 collision alerts, 12% ever opened, for two problems that then
 * sat unfixed for twelve days. The digest leads with the most consequential thing (a
 * dark terminal marks people ABSENT), then the collisions, then the backlog.
 *
 * Channels are decided by the builder, not here — the bell lands daily, email only on
 * Mondays and Fridays. Keeping that policy in one place makes it testable rather than
 * hidden behind a calendar check at send time.
 */
class BiometricHealthDigest extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array{offline:array,collisions:array,staged:int,weak_devices:array}  $payload
     * @param  array<int, string>  $channels
     */
    public function __construct(
        public array $payload,
        public array $channels = ['database'],
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** Headline: the worst problem, stated plainly, with its cost. */
    private function title(): string
    {
        $offline = count($this->payload['offline']);
        $collisions = count($this->payload['collisions']);

        if ($offline > 0) {
            return $offline === 1
                ? '1 biometric terminal is offline'
                : "{$offline} biometric terminals are offline";
        }
        if ($collisions > 0) {
            return $collisions === 1
                ? '1 biometric ID mismatch needs review'
                : "{$collisions} biometric ID mismatches need review";
        }

        return 'Biometric punches are not reaching employees';
    }

    /**
     * The digest as short lines, most consequential first. Shared by the bell (joined
     * into one message) and the email (rendered as separate lines).
     *
     * @return array<int, string>
     */
    private function lines(): array
    {
        $lines = [];

        foreach ($this->payload['offline'] as $d) {
            $where = $d['branch'] ? " ({$d['branch']})" : '';
            $span = $d['silent_hours'] === null
                ? 'has never contacted the server'
                : ($d['silent_hours'] >= 48
                    ? 'down for '.intdiv($d['silent_hours'], 24).' days'
                    : "down for {$d['silent_hours']} hours");
            $who = $d['employees'] > 0
                ? " — {$d['employees']} people there are being marked ABSENT"
                : '';
            $lines[] = "OFFLINE: {$d['name']}{$where} {$span}{$who}.";
        }

        foreach ($this->payload['collisions'] as $c) {
            $as = $c['device_name'] ? " (device shows it as \"{$c['device_name']}\")" : '';
            $age = $c['days_open'] > 0 ? ", open {$c['days_open']} days" : '';
            $lines[] = "WRONG PERSON: {$c['employee']} is receiving punches from PIN {$c['pin']}{$as} — {$c['punches']} punches{$age}.";
        }

        foreach ($this->payload['weak_devices'] as $w) {
            $lines[] = "UNMAPPED: {$w['name']} is only matching {$w['match_rate']}% of its punches to an employee ({$w['lost']} lost in 30 days).";
        }

        if ($this->payload['staged'] > 0) {
            $lines[] = number_format($this->payload['staged']).' punches are staged against PINs that match no employee. Mapping those IDs recovers the attendance.';
        }

        return $lines;
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $lines = $this->lines();

        return [
            'type' => 'biometric.digest',
            'title' => $this->title(),
            'message' => implode(' ', $lines),
            'url' => '/devices',
            'lines' => $lines,
            'offline' => count($this->payload['offline']),
            'collisions' => count($this->payload['collisions']),
            'staged' => $this->payload['staged'],
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('Biometric health — '.$this->title())
            ->greeting($this->title());

        foreach ($this->lines() as $line) {
            $mail->line($line);
        }

        return $mail
            ->action('Open the Biometric Connection Report', url('/devices'))
            ->line('Once a terminal reconnects, the punches it stored are uploaded and the affected days recompute on their own.')
            ->salutation('— ALL COMPANY HRIS');
    }
}
