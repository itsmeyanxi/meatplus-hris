<?php

namespace App\Mail\Transport;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\MessageConverter;

/**
 * Sends mail through the Microsoft Graph API using OAuth2 client-credentials —
 * the supported way to send from Microsoft 365 now that basic-auth SMTP is
 * retired. Needs an Azure app registration with the application permission
 * Mail.Send (admin-consented). Mail is sent as MS_GRAPH_FROM (a real mailbox).
 */
class MicrosoftGraphTransport extends AbstractTransport
{
    public function __construct(
        private readonly string $tenantId,
        private readonly string $clientId,
        private readonly string $clientSecret,
        private readonly string $from,
    ) {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        $email = MessageConverter::toEmail($message->getOriginalMessage());

        $addr = fn (Address $a) => ['emailAddress' => array_filter(['address' => $a->getAddress(), 'name' => $a->getName()])];
        $recips = fn (array $list) => array_map($addr, $list);

        $graphMessage = array_filter([
            'subject' => $email->getSubject(),
            'body' => [
                'contentType' => $email->getHtmlBody() !== null ? 'HTML' : 'Text',
                'content' => $email->getHtmlBody() ?? $email->getTextBody() ?? '',
            ],
            'toRecipients' => $recips($email->getTo()),
            'ccRecipients' => $recips($email->getCc()),
            'bccRecipients' => $recips($email->getBcc()),
            'replyTo' => $recips($email->getReplyTo()),
        ]);

        // Attachments (base64, as Graph fileAttachment resources).
        $attachments = [];
        foreach ($email->getAttachments() as $part) {
            $headers = $part->getPreparedHeaders();
            $attachments[] = [
                '@odata.type' => '#microsoft.graph.fileAttachment',
                'name' => $part->getFilename() ?? 'attachment',
                'contentType' => $headers->get('Content-Type')?->getBodyAsString() ?? 'application/octet-stream',
                'contentBytes' => base64_encode($part->getBody()),
            ];
        }
        if ($attachments) {
            $graphMessage['attachments'] = $attachments;
        }

        $response = Http::withToken($this->accessToken())
            ->acceptJson()
            ->post("https://graph.microsoft.com/v1.0/users/".rawurlencode($this->from)."/sendMail", [
                'message' => $graphMessage,
                'saveToSentItems' => false,
            ]);

        if ($response->failed()) {
            throw new \RuntimeException('Microsoft Graph sendMail failed ('.$response->status().'): '.$response->body());
        }
    }

    /** Client-credentials token, cached for just under its 1-hour lifetime. */
    private function accessToken(): string
    {
        return Cache::remember('ms_graph_mail_token', now()->addMinutes(55), function () {
            $response = Http::asForm()->post("https://login.microsoftonline.com/{$this->tenantId}/oauth2/v2.0/token", [
                'client_id' => $this->clientId,
                'client_secret' => $this->clientSecret,
                'scope' => 'https://graph.microsoft.com/.default',
                'grant_type' => 'client_credentials',
            ]);
            if ($response->failed() || ! $response->json('access_token')) {
                throw new \RuntimeException('Microsoft Graph token request failed: '.$response->body());
            }

            return $response->json('access_token');
        });
    }

    public function __toString(): string
    {
        return 'microsoft-graph';
    }
}
