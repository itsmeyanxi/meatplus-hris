<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Alert that a biometric terminal has stopped contacting the server.
 *
 * This is the alert nobody had: a silent terminal is the most expensive biometric
 * failure there is, because absence is judged from MISSING punches — so every day a
 * unit stays dark, everyone who normally punches there is quietly marked absent and
 * loses a day's pay. It could previously only be discovered by opening the Biometric
 * Connection Report and reading it by hand.
 *
 * Channels are decided by the caller (see DeviceSilenceDetector), not here: the bell
 * fires the moment an outage is detected, while email is restricted to Mondays and
 * Fridays. Passing them in keeps that policy in one place and testable, instead of
 * the notification quietly consulting the calendar at send time.
 */
class BiometricDeviceOfflineAlert extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, string>  $channels  delivery channels chosen by the detector
     * @param  int|null  $silentHours  hours since last contact; null = never contacted
     */
    public function __construct(
        public string $deviceName,
        public ?string $serialNo,
        public ?string $companyCode,
        public ?string $branchName,
        public ?int $silentHours,
        public int $employeesAffected,
        public string $url,
        public int $deviceId,
        public array $channels = ['database'],
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** One sentence stating what happened and what it costs, used by both channels. */
    private function headline(): string
    {
        $where = $this->branchName ? " at {$this->branchName}" : '';

        if ($this->silentHours === null) {
            return "{$this->deviceName}{$where} has never contacted the server.";
        }

        $span = $this->silentHours >= 48
            ? intdiv($this->silentHours, 24).' days'
            : "{$this->silentHours} hours";

        return "{$this->deviceName}{$where} has not contacted the server in {$span}.";
    }

    /** Who is losing attendance while it stays dark. */
    private function consequence(): string
    {
        if ($this->employeesAffected < 1) {
            return 'Punches made there are not reaching the HRIS.';
        }

        $people = $this->employeesAffected === 1 ? '1 employee' : "{$this->employeesAffected} employees";

        return "{$people} normally punch here — while it stays down they are being marked ABSENT.";
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'biometric.device_offline',
            'title' => 'Biometric terminal is offline',
            'message' => $this->headline().' '.$this->consequence().' Check its power and network.',
            'url' => $this->url,
            'device_id' => $this->deviceId,
            'serial_no' => $this->serialNo,
            'silent_hours' => $this->silentHours,
            'employees_affected' => $this->employeesAffected,
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('Biometric terminal offline — '.$this->deviceName)
            ->greeting('Biometric terminal is offline')
            ->line($this->headline())
            ->line($this->consequence());

        $mail->line('Terminal: '.$this->deviceName
            .($this->serialNo ? ' (serial '.$this->serialNo.')' : '')
            .($this->companyCode ? ' · '.$this->companyCode : ''));

        return $mail
            ->action('Open the Biometric Connection Report', url($this->url))
            ->line('Check the terminal\'s power and network connection. Once it reconnects, any punches it stored are uploaded and the affected days recompute on their own.')
            ->salutation('— ALL COMPANY HRIS');
    }
}
