<?php

namespace App\Http\Controllers\Adms;

use App\Domain\Attendance\Services\Biometric\AdmsIngestionService;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * ZKTeco ADMS / "iclock" endpoints. The terminal calls these itself; all
 * responses are plain text. Every request is logged to storage/logs/iclock.log
 * so we can see exactly what a given device firmware sends.
 */
class IclockController extends Controller
{
    public function __construct(private readonly AdmsIngestionService $adms) {}

    /** GET = handshake (device asks for options); POST = data push (ATTLOG, …). */
    public function cdata(Request $request): Response
    {
        $this->logRequest($request);

        $sn = (string) $request->query('SN', '');

        if ($request->isMethod('get')) {
            return $this->text($this->adms->handshake($sn));
        }

        $table = (string) $request->query('table', '');
        $count = $this->adms->receive($sn, $table, $request->getContent());

        return $this->text("OK: {$count}");
    }

    /** Device polls here for queued commands; we have none for now. */
    public function getrequest(Request $request): Response
    {
        $this->logRequest($request);

        return $this->text('OK');
    }

    /** Device reports command execution results. */
    public function devicecmd(Request $request): Response
    {
        $this->logRequest($request);

        return $this->text('OK');
    }

    /** Any other iclock path (fdata, edata, ping, …). */
    public function fallback(Request $request): Response
    {
        $this->logRequest($request);

        return $this->text('OK');
    }

    private function text(string $body): Response
    {
        return response($body, 200)->header('Content-Type', 'text/plain');
    }

    private function logRequest(Request $request): void
    {
        $entry = sprintf(
            "[%s] %s %s\nBODY: %s\n%s\n",
            now()->toDateTimeString(),
            $request->method(),
            $request->fullUrl(),
            $request->getContent() !== '' ? $request->getContent() : '(empty)',
            str_repeat('-', 60),
        );

        $written = file_put_contents(storage_path('logs/iclock.log'), $entry, FILE_APPEND | LOCK_EX);
        if ($written === false) {
            \Illuminate\Support\Facades\Log::channel('single')->info('iclock request (file write failed): ' . $entry);
        }
    }
}
