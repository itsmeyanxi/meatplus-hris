<?php

namespace App\Support;

use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\CellAlignment;
use OpenSpout\Common\Entity\Style\CellVerticalAlignment;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Entity\SheetView;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Small helper that turns a header row + data rows into a styled .xlsx download:
 * a branded title band, a bold white-on-slate header that stays frozen and wraps
 * long labels, auto-fitted column widths, and light zebra striping so wide
 * reports stay readable. Replaces the plain-CSV report exports.
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
        // Materialize so we can measure column widths and still stream every row.
        $rows = is_array($rows) ? $rows : iterator_to_array($rows);
        $headers = array_values($headers);
        $colCount = max(1, count($headers));

        $path = tempnam(sys_get_temp_dir(), 'xlsxrep');

        $options = new Options();
        // Auto-fit each column to its content: the header (capped, since it wraps)
        // and the widest data cell — clamped so columns never get cramped or absurd.
        $widths = self::columnWidths($headers, $rows, $colCount);
        foreach ($widths as $col => $w) {
            $options->setColumnWidth($w, $col);
        }
        // Explicit caller overrides win.
        foreach ($opts['widths'] ?? [] as $col => $w) {
            $options->setColumnWidth($w, $col);
        }

        $writer = new Writer($options);
        $writer->openToFile($path);
        if (isset($opts['sheet'])) {
            $writer->getCurrentSheet()->setName(substr(preg_replace('/[\\\\\/\?\*\[\]:]/', '-', $opts['sheet']), 0, 31));
        }

        $headStyle = (new Style())
            ->withFontBold(true)
            ->withFontColor(Color::WHITE)
            ->withBackgroundColor('1E293B')
            ->withFontSize(11)
            ->withShouldWrapText(true)
            ->withCellAlignment(CellAlignment::CENTER)
            ->withCellVerticalAlignment(CellVerticalAlignment::CENTER);
        $zebra = (new Style())->withBackgroundColor('F1F5F9');

        // Row number the header lands on (title band takes 3 rows when present),
        // so we can freeze everything above the first data row.
        $headerRow = isset($opts['title']) ? 4 : 1;
        $writer->getCurrentSheet()->setSheetView((new SheetView())->withFreezeRow($headerRow + 1));

        if (isset($opts['title'])) {
            $writer->addRow(Row::fromValuesWithStyle([$opts['title']], (new Style())->withFontBold(true)->withFontSize(14)));
            $line = $opts['subtitle'] ?? ('Generated '.now()->format('M d, Y g:i A'));
            $writer->addRow(Row::fromValuesWithStyle([$line], (new Style())->withFontColor('64748B')));
            $writer->addRow(Row::fromValues(['']));
        }

        $writer->addRow(Row::fromValuesWithStyle($headers, $headStyle));

        $i = 0;
        foreach ($rows as $r) {
            $vals = array_values((array) $r);
            // Alternate a faint fill so the eye can track a row across wide reports.
            $writer->addRow($i % 2 === 1 ? Row::fromValuesWithStyle($vals, $zebra) : Row::fromValues($vals));
            $i++;
        }

        $writer->close();

        return response()->download($path, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Per-column width from content. Header contribution is capped (it wraps onto
     * a second line rather than forcing a very wide column); data cells drive the
     * width. Only the first rows are sampled so huge exports stay fast.
     *
     * @param  string[]  $headers
     * @param  array<int, mixed>  $rows
     * @return array<int, float>  1-indexed column => width
     */
    private static function columnWidths(array $headers, array $rows, int $colCount): array
    {
        $sample = array_slice($rows, 0, 400);
        $widths = [];
        for ($c = 0; $c < $colCount; $c++) {
            $max = min(20, mb_strlen((string) ($headers[$c] ?? '')));
            foreach ($sample as $r) {
                $r = array_values((array) $r);
                $len = mb_strlen((string) ($r[$c] ?? ''));
                if ($len > $max) {
                    $max = $len;
                }
            }
            $widths[$c + 1] = (float) min(50, max(10, $max + 2));
        }

        return $widths;
    }
}
