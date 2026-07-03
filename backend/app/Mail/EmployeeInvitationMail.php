<?php

namespace App\Mail;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmployeeInvitationMail extends Mailable
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
