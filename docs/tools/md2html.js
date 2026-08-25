// Markdown -> Word-friendly HTML for the turnover document.
// Word opens HTML faithfully (headings, tables, lists), so this is the shortest
// reliable path to .docx without pandoc. Mermaid source is meaningless in Word,
// so each diagram is swapped for an ASCII equivalent; missing screenshots become
// labelled placeholder boxes the user can paste into.

const fs = require('fs');

const [, , inPath, outPath] = process.argv;
let md = fs.readFileSync(inPath, 'utf8');

// ---- 1. Mermaid -> ASCII, in document order -------------------------------
const ASCII = [
`   BIOMETRIC TERMINALS (9 units, any branch / any network)
   BROWSERS (HR, payroll, managers, employees)
        |
        |  HTTP  (devices POST /iclock/cdata ; users use a session cookie)
        v
 +=========================== OFFICE PC : DESKTOP-9BKU33K ===========================+
 |                                                                                   |
 |   Next.js  :80   <-- PUBLIC ENTRY POINT (serves the UI, proxies the API)          |
 |      |                                                                            |
 |      +-- /api  /sanctum  /up  ------------> Laravel :8000   (user traffic)        |
 |      +-- /iclock/*  ----------------------> Laravel :8001   (device traffic only) |
 |      +-- everything else -----------------> the Next.js app itself                |
 |                                                                                   |
 |          Laravel :8002 / :8003  ... started, but receive no traffic               |
 |                                                                                   |
 |   Queue worker  (queue:work)        <-- sends queued mail                         |
 |   Scheduler     (schedule:run, every minute)                                      |
 |                          |                                                        |
 |                          v                                                        |
 |            PostgreSQL 17  :5433   database "meatplus_hris"                        |
 +===================================================================================+`,

`  COMPANIES ---< BRANCHES ---< EMPLOYEES >--- DEPARTMENTS
      |                            |     \\---- POSITIONS
      |                            |
      |                            +---< TIME_LOGS            (raw punches)
      |                            +---< DAILY_TIME_RECORDS   (the computed DTR)
      |                            +---< EMPLOYEE_SCHEDULES >--- WORK_SCHEDULES
      |                            |                                 |
      |                            |                                 +---< WORK_SCHEDULE_DAYS
      |                            +---< LEAVE_APPLICATIONS
      |                            +---< OVERTIME_REQUESTS
      |                            +---< PAYSLIPS >--- PAYROLL_RUNS
      |                            |
      |                            +--o USERS                 (optional login)
      |
      +---< ATTENDANCE_DEVICES ---< TIME_LOGS

  Legend:   ---<  one-to-many        >---  many-to-one        --o  optional one-to-one`,

`  Employee scans          Device POSTs
  at the terminal  ----->  /iclock/cdata  ----->  [ Is the serial activated? ]
                                                        |            |
                                                     NO |            | YES
                                                        v            v
                                       REJECTED + logged      [ Does the PIN map
                                    (device stays inactive)     to an employee? ]
                                                                |          |
                                                             NO |          | YES
                                                                v          v
                                            staged in unmatched_punches   time_logs row
                                                    |                (dedupe on device
                                                    |                 + event id)
                                    reclaimer, every 15 min,               |
                                    once the PIN maps  -------------------->|
                                                                           v
                                                        DtrComputer recomputes the
                                                            affected days
                                                                           |
                                                                           v
                                                              daily_time_records
                                                                           |
                                                                           v
                                                    Payroll  .  Reports  .  DTR matrix`,

`  Employee files                                     Notify:
  (or HR files      ---->  status = pending  ---->   direct manager
   on their behalf)                                  + department head
                                                     + global approvers
                                                              |
                                                              v
                                                       [ D E C I S I O N ]
                                                        |       |       |
                                                Approve |Reject |Cancel |
                                                        v       v       v
                                                   approved  rejected  cancelled
                                                        \\       |       /
                                                         \\      |      /
                                                          v     v     v
                                              DTR recomputed for the covered days`,

`  05:30 daily            attendance:sync-dtr --days=3
  Windows task   ----->   (only fully elapsed days are judged)
                                        |
                                        v
                     [ A scheduled workday with no punch at all? ]
                                        |
                     +------------------+------------------+
                     |                                     |
        YES, and no leave / holiday /             otherwise
        COA / OB / punch exemption
                     |                                     |
                     v                                     v
              Marked ABSENT                        Left as computed`,

`  Create payroll run          Read DTR rows            Compute:
  (period start / end) ----->  for the cutoff  ----->   basic pay by DAYS worked,
                                                        OT, night differential,
                                                        holiday / rest-day premiums
                                                                |
                                                                v
                                                        Statutory deductions:
                                                        SSS . PhilHealth
                                                        Pag-IBIG . withholding tax
                                                                |
                                                                v
                                                        Loans + adjustments
                                                                |
                                                                v
                                                            PAYSLIPS
                                                                |
                                                                v
                                              Approve  --->  Post  --->  Bank file`,

`  Employee        Supervisor        HR             IT
  requests   -->  approves    -->   approves  -->  provisions  -->  ROLE GRANTED
  access`,
];

let mermaidCount = 0;
md = md.replace(/```mermaid\n[\s\S]*?\n```/g, () => {
  const art = ASCII[mermaidCount++];
  if (art === undefined) throw new Error(`More mermaid blocks than ASCII replacements (${mermaidCount})`);
  return '```\n' + art + '\n```';
});
if (mermaidCount !== ASCII.length) {
  throw new Error(`Expected ${ASCII.length} mermaid blocks, found ${mermaidCount}`);
}

// Lift images out of blockquotes. Three of the screenshot links sit inside "> "
// note blocks; the blockquote handler would swallow them and the placeholder box
// would never be emitted. Promoting them to top level also reads better — a
// placeholder does not belong nested inside a callout.
md = md.replace(/^>\s*(!\[[^\]]*\]\([^)]+\))\s*$/gm, '\n$1\n');

// ---- 2. Markdown -> HTML ---------------------------------------------------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Screenshot captions, so a placeholder says what belongs there.
const SHOTS = {
  '01-dashboard.png': 'Dashboard after login — summary cards, company switcher, notification bell',
  '02-employees-list.png': 'Employee list — filters, import / export',
  '03-attendance-dtr.png': 'DTR matrix — a month, colour-coded by day state',
  '04-time-logs.png': 'Time logs — raw punches with device / company filters',
  '05-payroll-payslip.png': 'Payslip — REDACT ALL FIGURES before capturing',
  '06-device-connection-report.png': 'Biometric connection report — Last contact vs Last punch, match rate, staged',
  '07-access-levels.png': 'Access levels — the role x permission matrix',
  '16-scheduled-tasks.png': 'Windows Task Scheduler — the Meatplus HRIS tasks, Status + Last Run Result',
};

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // links: keep the text, drop the target (a .docx of internal repo paths is noise)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  return s;
}

const lines = md.split(/\r?\n/);
const out = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  // fenced code
  if (/^```/.test(line)) {
    i++;
    const buf = [];
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
    i++;
    out.push('<pre>' + esc(buf.join('\n')) + '</pre>');
    continue;
  }

  // image -> labelled placeholder
  const img = line.match(/^!\[([^\]]*)\]\(screenshots\/([^)]+)\)/);
  if (img) {
    const file = img[2];
    const cap = SHOTS[file] || img[1];
    out.push(
      `<div class="shot"><strong>[ SCREENSHOT TO BE INSERTED ]</strong><br/>` +
      `<span class="shotfile">${esc(file)}</span><br/>${esc(cap)}</div>`
    );
    i++;
    continue;
  }

  // table
  if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
    const head = line.split('|').slice(1, -1).map((c) => c.trim());
    i += 2;
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) {
      rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
      i++;
    }
    let t = '<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of rows) t += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
    out.push(t + '</tbody></table>');
    continue;
  }

  // blockquote (may span lines)
  if (/^>/.test(line)) {
    const buf = [];
    while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
    const inner = buf.join('\n').split(/\n{2,}/)
      .map((p) => '<p>' + inline(p.replace(/^#+\s*/gm, '')).replace(/\n/g, '<br/>') + '</p>').join('');
    out.push('<div class="note">' + inner + '</div>');
    continue;
  }

  // headings
  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

  // horizontal rule
  if (/^---+$/.test(line)) { out.push('<hr/>'); i++; continue; }

  // unordered list
  if (/^[-*]\s+/.test(line)) {
    const buf = [];
    while (i < lines.length && /^[-*]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^[-*]\s+/, ''));
    out.push('<ul>' + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ul>');
    continue;
  }

  // ordered list
  if (/^\d+\.\s+/.test(line)) {
    const buf = [];
    while (i < lines.length && /^\d+\.\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\d+\.\s+/, ''));
    out.push('<ol>' + buf.map((b) => `<li>${inline(b)}</li>`).join('') + '</ol>');
    continue;
  }

  if (line.trim() === '') { i++; continue; }

  // paragraph
  const buf = [];
  while (i < lines.length && lines[i].trim() !== '' && !/^([#>|`-]|\d+\.|!\[)/.test(lines[i])) buf.push(lines[i++]);
  if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>');
  else i++;
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ALL COMPANY HRIS - System Turnover Documentation</title>
<style>
body{font-family:Calibri,'Segoe UI',sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.45}
h1{font-size:22pt;color:#0f3b66;border-bottom:2px solid #0f3b66;padding-bottom:6pt;margin-top:24pt}
h2{font-size:16pt;color:#0f3b66;margin-top:22pt;border-bottom:1px solid #c9d6e2;padding-bottom:3pt}
h3{font-size:13pt;color:#1f5c96;margin-top:16pt}
h4{font-size:11.5pt;color:#1f5c96;margin-top:12pt}
table{border-collapse:collapse;width:100%;margin:10pt 0;font-size:9.5pt}
th{background:#0f3b66;color:#fff;text-align:left;padding:5pt 7pt;border:1px solid #0f3b66}
td{border:1px solid #b8c6d4;padding:4pt 7pt;vertical-align:top}
tr:nth-child(even) td{background:#f4f7fa}
pre{font-family:Consolas,'Courier New',monospace;font-size:8pt;background:#f6f8fa;border:1px solid #d5dde5;
    padding:8pt;white-space:pre;line-height:1.25}
code{font-family:Consolas,'Courier New',monospace;font-size:9.5pt;background:#eef2f6;padding:1pt 3pt}
.note{border-left:4px solid #d99000;background:#fdf7e8;padding:6pt 10pt;margin:10pt 0}
.note p{margin:4pt 0}
.shot{border:2px dashed #8aa0b4;background:#f7f9fb;padding:22pt 12pt;margin:12pt 0;text-align:center;color:#4a5c6e}
.shotfile{font-family:Consolas,monospace;font-size:9pt;color:#0f3b66}
ul,ol{margin:6pt 0 6pt 18pt}
li{margin:2pt 0}
hr{border:none;border-top:1px solid #d5dde5;margin:16pt 0}
</style></head><body>
${out.join('\n')}
</body></html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log(`OK  ${mermaidCount} diagrams converted to ASCII, ${out.length} blocks, ${html.length} bytes`);
