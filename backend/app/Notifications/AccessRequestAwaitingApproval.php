<?php

namespace App\Notifications;

use App\Domain\AccessControl\Models\AccessRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Sent to the approvers of the stage a request has just landed on. */
class AccessRequestAwaitingApproval extends Notification
{
    use Queueable;

    public function __construct(
        public AccessRequest $accessRequest,
        public string $stage,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $r = $this->accessRequest;

        return [
            'type' => 'access_request.awaiting',
            'title' => 'Access request awaiting your approval',
            'message' => "{$r->employee_name} ({$r->department}) · ".ucfirst($this->stage).' stage',
            'url' => "/access-requests/{$r->id}",
            'access_request_id' => $r->id,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r = $this->accessRequest;

        return (new MailMessage)
            ->subject("Access request awaiting your approval ({$this->stage})")
            ->greeting("Hi {$notifiable->name},")
            ->line("An access request for {$r->employee_name} ({$r->department}) is waiting at the ".ucfirst($this->stage).' stage.')
            ->line("Request type: {$r->request_type}")
            ->line("Justification: {$r->justification}")
            ->action('Review request', url("/access-requests/{$r->id}"))
            ->line('Please review and approve or reject it.');
    }
}
