export function uid() {
  return 'id' + Math.random().toString(36).slice(2, 10)
}

export function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}

export function escCsv(s) {
  s = String(s ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export const PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  @page { size: A4; margin: 0; }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 16mm 18mm;
    margin: 0 auto;
    background: #fff;
    color: #1f2329;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
    font-size: 12pt;
    line-height: 1.55;
    page-break-after: always;
    position: relative;
  }
  .page:last-child { page-break-after: auto; }
  .page-a5 { width: 210mm; min-height: 148mm; padding: 7mm 10mm 9mm; font-size: 9.5pt; line-height: 1.45; }
  .page-a5 .page-title { font-size: 17pt; }
  .exp-title-line { border-bottom: 3px double #1f2329; padding-bottom: 2.5mm; }
  .exp-title-line .page-title { margin: 0; text-align: center; letter-spacing: 8px; }
  .exp-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 2.8mm 0 2mm; font-size: 9.5pt; }
  .exp-meta-item { white-space: nowrap; }
  .exp-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .exp-table th, .exp-table td { border: 1px solid #1f2329; padding: 1.8mm 1.5mm; vertical-align: middle; word-break: break-all; }
  .exp-table th { font-weight: 600; font-size: 10pt; text-align: center; }
  .exp-th-item { width: 48%; }
  .exp-th-amt { width: 22%; }
  .exp-th-approve { width: 30%; }
  .approve-stack { display: flex; flex-direction: column; height: 100%; }
  .approve-head { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1mm 0; font-size: 9pt; }
  .approve-head + .approve-head { border-top: 1px solid #1f2329; }
  .vtext { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px; }
  .exp-item { font-size: 9pt; line-height: 1.55; white-space: pre-wrap; }
  .exp-amt { text-align: right; font-size: 10pt; }
  .exp-blank td { height: 7.5mm; }
  .exp-total td { height: 7.5mm; font-weight: 600; }
  .exp-total-label { text-align: center; letter-spacing: 6px; }
  .exp-cap-label { text-align: left; font-weight: 600; white-space: nowrap; width: 34%; }
  .exp-cap-value { letter-spacing: 2px; }
  .exp-sign { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #1f2329; border-top: 0; }
  .exp-sign-cell { padding: 2.5mm 3mm; min-height: 17mm; }
  .exp-sign-cell + .exp-sign-cell { border-left: 1px solid #1f2329; }
  .exp-sign-label { font-size: 9.5pt; white-space: nowrap; }
  .exp-sign-space { height: 10mm; }
  .exp-attach { margin-top: 3mm; }
  .exp-sec-title { font-weight: 600; font-size: 10pt; margin-bottom: 1.5mm; }
  .attach-page-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1f2329; padding-bottom: 2mm; margin-bottom: 4mm; }
  .attach-page-title { font-weight: 700; font-size: 13pt; }
  .attach-page-no-label { font-size: 9.5pt; }
  .attach-page .attach-grid { gap: 6mm; }
  .attach-page .attach-item { border: none; padding: 0; background: #fff; break-inside: avoid; }
  .attach-page .attach-item img { width: 100%; height: 100mm; object-fit: contain; }
  .exp-page-no { position: absolute; right: 8mm; bottom: 6mm; font-size: 8pt; color: #646a73; }
  .page-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1f2329; padding-bottom: 10px; margin-bottom: 14px; }
  .logo { height: 44px; max-width: 120px; object-fit: contain; }
  .title-wrap { flex: 1; }
  .page-title { margin: 0; font-size: 22pt; font-weight: 700; }
  .page-subtitle { margin-top: 2px; font-size: 10pt; color: #646a73; }
  .header-meta { font-size: 9pt; color: #646a73; white-space: nowrap; }
  .block { margin-bottom: 14px; }
  .block-title { font-weight: 600; margin-bottom: 6px; font-size: 11pt; }
  .meta-block { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .meta-row { display: flex; font-size: 11pt; }
  .meta-label { width: 88px; flex: none; color: #646a73; }
  .meta-value { flex: 1; font-weight: 500; word-break: break-all; }
  .table-block table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  .table-block th, .table-block td { border: 1px solid #c9cdd4; padding: 5px 8px; text-align: left; }
  .table-block th { background: #f2f3f5; font-weight: 600; }
  .form-block { margin-bottom: 14px; }
  .form-section-title { font-weight: 600; margin-bottom: 5px; font-size: 11pt; }
  .form-table { width: 100%; border-collapse: collapse; }
  .form-table td { border: 1px solid #1f2329; padding: 6px 10px; font-size: 11pt; vertical-align: top; word-break: break-all; }
  .form-label { width: 86px; background: #f2f3f5; font-weight: 600; text-align: center; white-space: nowrap; }
  .form-cols-1 .form-label { width: 130px; }
  .form-cols-3 .form-label, .form-cols-4 .form-label { white-space: normal; font-size: 10pt; width: auto; min-width: 44px; }
  .form-content-cell { white-space: pre-wrap; }
  .sign-grid td { vertical-align: top; }
  .sign-cell-label { font-weight: 600; text-align: center; margin-bottom: 8px; }
  .attach-grid { display: grid; gap: 8px; }
  .attach-item { margin: 0; border: 1px solid #c9cdd4; padding: 4px; background: #fff; break-inside: avoid; }
  .attach-item img { width: 100%; height: 150px; object-fit: contain; display: block; }
  .page-a5 .attach-item img { height: 95px; }
  .page-a5 .page-header { padding-bottom: 4mm; margin-bottom: 3mm; }
  .page-a5 .page-title { font-size: 16pt; }
  .page-a5 .page-subtitle, .page-a5 .header-meta { font-size: 8.5pt; }
  .page-a5 .block { margin-bottom: 8px; }
  .page-a5 .block-title, .page-a5 .form-section-title { font-size: 10pt; }
  .page-a5 .form-table td { font-size: 9.5pt; padding: 4px 6px; }
  .page-a5 .form-label { width: 62px; font-size: 9pt; }
  .page-a5 .form-cols-3 .form-label, .page-a5 .form-cols-4 .form-label { font-size: 8.5pt; min-width: 30px; }
  .page-a5 .table-block table { font-size: 9pt; }
  .page-a5 .table-block th, .page-a5 .table-block td { padding: 3px 5px; }
  .page-a5 .meta-row, .page-a5 .text-block { font-size: 9.5pt; }
  .page-a5 .sign-line { height: 18px; }
  .attach-links { border: 1px dashed #c9cdd4; padding: 4px 8px; }
  .attach-link { font-size: 8.5pt; color: #333; word-break: break-all; line-height: 1.5; }
  .attach-empty { border: 1px dashed #c9cdd4; color: #646a73; font-size: 10pt; padding: 8px 10px; word-break: break-all; }
  .text-block { white-space: pre-wrap; word-break: break-all; }
  .sign-block .sign-lines { margin-top: 4px; }
  .sign-block .sign-line { border-bottom: 1px solid #c9cdd4; height: 26px; }
  .page-footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e6eb; font-size: 9pt; color: #646a73; text-align: center; }
  .attach-page .attach-item img { width: 100%; height: 72mm; object-fit: contain; }
`
