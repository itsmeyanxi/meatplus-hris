<?php

namespace App\Notifications;

use App\Domain\AccessControl\Models\AccessRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the requester when their access request reaches a terminal state. */
class AccessRequestDecided extends Notification
{
    use Queueable;

    public function __construct(
        public AccessRequest $accessRequest,
        public string $outcome, // approved | rejected | cancelled
        public ?string $remarks = null,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r = $this->accessRequest;

        $mail = (new MailMessage)
            ->subject("Your access request was {$this->outcome}")
            ->greeting("Hi {$notifiable->name},")
            ->line("Your access request for {$r->employee_name} ({$r->department}) was {$this->outcome}.");

        if ($this->remarks) {
            $mail->line("Remarks: {$this->remarks}");
        }

        return $mail
            ->action('View request', url("/access-requests/{$r->id}"))
            ->line('Thank you for using Meatplus HRIS.');
    }
}
