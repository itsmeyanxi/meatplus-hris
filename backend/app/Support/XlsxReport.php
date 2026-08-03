<?php

namespace App\Support;

use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Small helper that turns a header row + data rows into a styled .xlsx download:
 * a branded title band, bold white-on-slate header, sensible column widths, and
 * a "Generated …" line. Replaces the plain-CSV report exports so downloads open
 * cleanly formatted in Excel.
 */
class XlsxReport
{
    /**
     * @param  string[]  $headers
     * @param  iterable<array<int, mixed>>  $rows  each row = array of cell values (order matches $headers)
     * @param  array{title?: string, subtitle?: string, sheet?: string, widths?: array<int, float>}  $opts
     */
    public static function download(string $filename, array $headers, iterable $rows, array $opts = []): BinaryFileResponse
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsxrep');

        $options = new Options();
        // Default width so text columns aren't cramped; caller may override per column.
        $colCount = max(1, count($headers));
        $options->setColumnWidth(18, ...range(1, $colCount));
        foreach ($opts['widths'] ?? [] as $col => $w) {
            $options->setColumnWidth($w, $col);
        }

        $writer = new Writer($options);
        $writer->openToFile($path);
        if (isset($opts['sheet'])) {
            $writer->getCurrentSheet()->setName(substr(preg_replace('/[\\\\\/\?\*\[\]:]/', '-', $opts['sheet']), 0, 31));
        }

        $headStyle = (new Style())->withFontBold(true)->withFontColor(Color::WHITE)->withBackgroundColor('1E293B')->withFontSize(11);

        if (isset($opts['title'])) {
            $writer->addRow(Row::fromValuesWithStyle([$opts['title']], (new Style())->withFontBold(true)->withFontSize(14)));
            $line = $opts['subtitle'] ?? ('Generated '.now()->format('M d, Y g:i A'));
            $writer->addRow(Row::fromValuesWithStyle([$line], (new Style())->withFontColor('64748B')));
            $writer->addRow(Row::fromValues(['']));
        }

        $writer->addRow(Row::fromValuesWithStyle(array_values($headers), $headStyle));
        foreach ($rows as $r) {
            $writer->addRow(Row::fromValues(array_values((array) $r)));
        }

        $writer->close();

        return response()->download($path, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }
}
