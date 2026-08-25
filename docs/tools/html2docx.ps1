param(
    [Parameter(Mandatory = $true)][string]$HtmlPath,
    [Parameter(Mandatory = $true)][string]$DocxPath
)

$ErrorActionPreference = 'Stop'

# Word insists on absolute paths through COM.
$HtmlPath = (Resolve-Path $HtmlPath).Path
$DocxPath = [System.IO.Path]::GetFullPath($DocxPath)
if (Test-Path $DocxPath) { Remove-Item $DocxPath -Force }

$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0          # wdAlertsNone - never prompt, this is unattended

    $doc = $word.Documents.Open($HtmlPath, $false, $true)   # confirmConversions, readOnly

    # A4 with sane margins for a printed handover document.
    $doc.PageSetup.PaperSize    = 7      # wdPaperA4
    $doc.PageSetup.TopMargin    = 56     # ~2cm in points
    $doc.PageSetup.BottomMargin = 56
    $doc.PageSetup.LeftMargin   = 62
    $doc.PageSetup.RightMargin  = 56

    foreach ($section in $doc.Sections) {
        # Header: what this document is, on every page.
        $hdr = $section.Headers.Item(1).Range
        $hdr.Text = "ALL COMPANY HRIS - System Turnover & Technical Documentation"
        $hdr.Font.Size = 8
        $hdr.Font.Color = 8421504        # grey
        $hdr.ParagraphFormat.Alignment = 2   # right

        # Footer: "Page X of Y" plus the version, so a printed copy is traceable.
        $ftr = $section.Footers.Item(1).Range
        $ftr.Text = "v1.0  -  25 August 2026  -  Page "
        $ftr.Font.Size = 8
        $ftr.Font.Color = 8421504
        $ftr.Collapse(0) | Out-Null                       # collapse to end
        $ftr.Fields.Add($ftr, 33) | Out-Null              # wdFieldPage
        $end = $section.Footers.Item(1).Range
        $end.InsertAfter(" of ")
        $end.Collapse(0) | Out-Null
        $end.Fields.Add($end, 26) | Out-Null              # wdFieldNumPages
        $section.Footers.Item(1).Range.ParagraphFormat.Alignment = 1  # centre
    }

    # Keep code/diagram blocks from wrapping into nonsense.
    foreach ($p in $doc.Paragraphs) {
        if ($p.Range.Font.Name -like 'Consolas*') { $p.Format.WidowControl = $false }
    }

    $doc.SaveAs2($DocxPath, 16)       # wdFormatXMLDocument (.docx)
    $pages = $doc.ComputeStatistics(2)   # wdStatisticPages
    $words = $doc.ComputeStatistics(0)   # wdStatisticWords
    $doc.Close($false)
    $doc = $null

    Write-Output "SAVED  $DocxPath"
    Write-Output "PAGES  $pages"
    Write-Output "WORDS  $words"
}
finally {
    if ($doc)  { try { $doc.Close($false) } catch {} }
    if ($word) { try { $word.Quit() } catch {} }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
}
