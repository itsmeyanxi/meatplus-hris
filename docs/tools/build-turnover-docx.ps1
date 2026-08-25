<#
    Rebuild the Word version of the system turnover document.

    Run this whenever docs/10-system-turnover.md changes, so the .docx handed to
    management never drifts from the markdown that is kept up to date.

        .\tools\docx\build-turnover-docx.ps1

    Requires: Node (for the markdown -> HTML pass) and Microsoft Word (COM, for the
    HTML -> .docx pass). Both are present on the production PC. No pandoc, no
    LibreOffice, no npm install.

    What the conversion does beyond a plain export:
      - the seven mermaid diagrams become ASCII art, because mermaid SOURCE is
        meaningless in Word and a reader would just see code
      - each screenshot link becomes a labelled placeholder box naming the file and
        what belongs there, so screenshots can be pasted straight into the document
      - A4 page setup, running header, and "Page X of Y" footer for a printed copy
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'docs'))) { $root = Resolve-Path (Join-Path $PSScriptRoot '..\..') }

$md   = Join-Path $root 'docs\10-system-turnover.md'
$docx = Join-Path $root 'docs\ALL-COMPANY-HRIS-System-Turnover.docx'
$html = Join-Path $env:TEMP 'hris-turnover.html'

if (-not (Test-Path $md)) { throw "Source not found: $md" }

Write-Host "Source : $md"
Write-Host "Target : $docx"
Write-Host ''

Write-Host 'Markdown -> HTML ...'
node (Join-Path $PSScriptRoot 'md2html.js') $md $html
if ($LASTEXITCODE -ne 0) { throw 'Markdown conversion failed.' }

Write-Host 'HTML -> Word ...'
& powershell -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $PSScriptRoot 'html2docx.ps1') -HtmlPath $html -DocxPath $docx
if ($LASTEXITCODE -ne 0) { throw 'Word conversion failed.' }

Remove-Item $html -ErrorAction SilentlyContinue
Write-Host ''
Write-Host 'Done. Remember: the MARKDOWN is the source of truth - edit that, then re-run this.' -ForegroundColor Green
