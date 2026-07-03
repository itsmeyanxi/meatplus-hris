<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $resetUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Reset Your Password — ' . config('app.name'));
    }

    public function content(): Content
    {
        return new Content(view: 'emails.password-reset', with: [
            'name'     => $this->name,
            'resetUrl' => $this->resetUrl,
        ]);
    }

    public function attachments(): array
    {
        return [];
    }
}
