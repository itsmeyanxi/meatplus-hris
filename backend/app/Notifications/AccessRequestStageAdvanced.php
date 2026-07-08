<?php

namespace App\Notifications;

use App\Domain\AccessControl\Models\AccessRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the requester each time their request advances to the next approval stage. */
class AccessRequestStageAdvanced extends Notification
{
    use Queueable;

    private const LABELS = [
        'supervisor' => 'Supervisor',
        'hr'         => 'HR',
        'it'         => 'IT',
    ];

    public function __construct(
        public readonly AccessRequest $accessRequest,
        public readonly string $fromStage,
        public readonly string $toStage,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        // Anonymous notifiables (on-demand mail to company_email) don't support 'database'.
        return method_exists($notifiable, 'getKey') ? ['mail', 'database'] : ['mail'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $r    = $this->accessRequest;
        $from = self::LABELS[$this->fromStage] ?? ucfirst($this->fromStage);
        $to   = self::LABELS[$this->toStage]   ?? ucfirst($this->toStage);

        return [
            'type'              => 'access_request.stage_advanced',
            'title'             => "Access request cleared {$from} review",
            'message'           => "Request for {$r->employee_name} ({$r->department}) passed {$from} and is now awaiting {$to} approval.",
            'url'               => "/access-requests/{$r->id}",
            'access_request_id' => $r->id,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r    = $this->accessRequest;
        $from = self::LABELS[$this->fromStage] ?? ucfirst($this->fromStage);
        $to   = self::LABELS[$this->toStage]   ?? ucfirst($this->toStage);
        $name = property_exists($notifiable, 'name') ? $notifiable->name : $r->employee_name;

        return (new MailMessage)
            ->subject("Access request update: {$from} stage approved")
            ->greeting("Hi {$name},")
            ->line("Your access request for **{$r->employee_name}** ({$r->department}) has cleared the **{$from}** review stage.")
            ->line("It is now pending approval from **{$to}**. You will be notified once that stage is complete.")
            ->action('Track your request', url('/access-requests/'.$r->id))
            ->line('Thank you for using Meatplus HRIS.');
    }
}
