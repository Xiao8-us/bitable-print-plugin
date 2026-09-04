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
  .form-content-cell { white-space: pre-wrap; }
  .sign-grid td { vertical-align: top; }
  .sign-cell-label { font-weight: 600; text-align: center; margin-bottom: 8px; }
  .text-block { white-space: pre-wrap; word-break: break-all; }
  .sign-block .sign-lines { margin-top: 4px; }
  .sign-block .sign-line { border-bottom: 1px solid #c9cdd4; height: 26px; }
  .page-footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e6eb; font-size: 9pt; color: #646a73; text-align: center; }
`
