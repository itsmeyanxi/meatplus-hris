<?php

namespace App\Notifications;

use App\Domain\AccessControl\Models\AccessRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the requester immediately after their access request is filed. */
class AccessRequestCreated extends Notification
{
    use Queueable;

    public function __construct(
        public readonly AccessRequest $accessRequest,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return method_exists($notifiable, 'getKey') ? ['mail', 'database'] : ['mail'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $r = $this->accessRequest;

        return [
            'type'              => 'access_request.created',
            'title'             => "Access request filed — {$r->ticket_number}",
            'message'           => "Request for {$r->employee_name} ({$r->department}) is now pending Supervisor review.",
            'url'               => "/request-access",
            'access_request_id' => $r->id,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r    = $this->accessRequest;
        $name = property_exists($notifiable, 'name') ? $notifiable->name : $r->employee_name;
        $type = ucwords(str_replace('_', ' ', $r->request_type));

        return (new MailMessage)
            ->subject("Access request received — {$r->ticket_number}")
            ->greeting("Hi {$name},")
            ->line("Your access request has been successfully submitted. Keep this ticket number for your records:")
            ->line("**Ticket: {$r->ticket_number}**")
            ->line("---")
            ->line("**Employee:** {$r->employee_name}")
            ->line("**Department:** {$r->department}")
            ->line("**Request type:** {$type}")
            ->line("**Effective date:** {$r->effective_date->toFormattedDateString()}")
            ->line("---")
            ->line("Your request will now pass through three approval stages:")
            ->line("**1. Supervisor → 2. HR → 3. IT**")
            ->line("You will receive an email update at each stage and when a final decision is made.")
            ->action('Track your request', url('/request-access'))
            ->line('Thank you for using Meatplus HRIS.');
    }
}
