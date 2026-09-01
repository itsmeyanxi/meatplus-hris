<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * A named list of things a specific team needs to do.
 *
 * Distinct from the daily health digests, which report what the system FOUND. This
 * one says who is expected to act, so work stops bouncing back to IT by default. It
 * is sent deliberately by a person, never on a schedule.
 */
class ActionAssignment extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, string>  $items  one line per task, most consequential first
     * @param  array<int, string>  $channels
     */
    public function __construct(
        public string $heading,
        public array $items,
        public string $url = '/dashboard',
        public array $channels = ['database'],
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'action.assignment',
            'title' => $this->heading,
            'message' => implode(' ', $this->items),
            'url' => $this->url,
            'lines' => $this->items,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->heading)->greeting($this->heading);

        foreach ($this->items as $line) {
            $mail->line($line);
        }

        return $mail
            ->action('Open the HRIS', url($this->url))
            ->salutation('— ALL COMPANY HRIS');
    }
}
