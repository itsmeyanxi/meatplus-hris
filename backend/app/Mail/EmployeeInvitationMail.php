<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Queued so bulk invites return immediately and the worker sends them in the
// background (Gmail SMTP is slow — sending inline would time out the request).
class EmployeeInvitationMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public string $inviteUrl;
    public string $employeeName;

    public function __construct(public readonly Invitation $invitation)
    {
        $emp = $invitation->employee;
        $this->employeeName = trim("{$emp->first_name} {$emp->last_name}");
        $this->inviteUrl = rtrim(config('app.frontend_url', 'http://localhost:3001'), '/')
            . '/invite/' . $invitation->token;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            to: $this->invitation->email,
            subject: 'Set up your Meatplus HRIS account',
        );
    }

    public function content(): Content
    {
        return new Content(view: 'emails.invitation');
    }
}
