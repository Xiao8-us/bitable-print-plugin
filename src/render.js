import { attachCache, ds } from './bitable.js'

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

export function fieldName(fid) {
  return ds.fields.find((f) => f.id === fid)?.name || fid
}

export function collectAttachmentBlocks(template) {
  if (!template) return []
  return (template.blocks || []).filter((b) => b.type === 'attachments' && b.fieldId)
}

function valueFor(record, fid) {
  if (!record) return ''
  const v = record.fields?.[fid]
  return v == null ? '' : String(v)
}

function fillVars(text, vars) {
  return esc(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key) => {
    const k = String(key).trim()
    return vars[k] != null && vars[k] !== '' ? esc(vars[k]) : m
  })
}

function renderRecord(template, record, page, pages, allRecords) {
  const vars = { page, pages, date: new Date().toLocaleDateString('zh-CN') }
  for (const f of ds.fields) vars[f.name] = valueFor(record, f.id)

  let body = ''
  for (const block of template.blocks || []) {
    if (block.type === 'meta') {
      const items = (block.rows || [])
        .map((r) => {
          const name = fieldName(r.fieldId)
          return { label: r.label || name, value: vars[name] ?? '' }
        })
        .filter((r) => r.label)
      if (!items.length) continue
      if (block.bordered) {
        const cols = Math.min(Math.max(Number(block.cols) || 2, 1), 4)
        const valAlign = block.valueAlign === 'center' ? ' style="text-align:center"' : ''
        let rows = ''
        for (let i = 0; i < items.length; i += cols) {
          let cells = ''
          for (let j = 0; j < cols; j++) {
            const it = items[i + j]
            cells += it
              ? `<td class="form-label">${esc(it.label)}</td><td class="form-value"${valAlign}>${esc(it.value)}</td>`
              : '<td class="form-label"></td><td class="form-value"></td>'
          }
          rows += `<tr>${cells}</tr>`
        }
        body += `<div class="block form-block">${esc(block.label) ? `<div class="form-section-title">${esc(block.label)}</div>` : ''}<table class="form-table form-cols-${cols}"><tbody>${rows}</tbody></table></div>`
      } else {
        const rows = items
          .map(
            (r) =>
              `<div class="meta-row"><span class="meta-label">${esc(r.label)}</span><span class="meta-value">${esc(r.value)}</span></div>`
          )
          .join('')
        body += `<div class="block meta-block">${rows}</div>`
      }
    } else if (block.type === 'table') {
      const cols = block.columns || []
      if (!cols.length) continue
      const header = cols.map((c) => `<th>${esc(c.label || fieldName(c.fieldId))}</th>`).join('')
      let rows = ''
      if (template.pageBreak === 'continuous') {
        rows = allRecords
          .map((r) => {
            const v = {}
            for (const f of ds.fields) v[f.name] = valueFor(r, f.id)
            return `<tr>${cols.map((c) => `<td>${esc(v[fieldName(c.fieldId)] ?? '')}</td>`).join('')}</tr>`
          })
          .join('')
      } else {
        rows = `<tr>${cols.map((c) => `<td>${esc(vars[fieldName(c.fieldId)] ?? '')}</td>`).join('')}</tr>`
      }
      body += `<div class="block table-block">${esc(block.label || '') ? `<div class="block-title">${esc(block.label)}</div>` : ''}<table class="list-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`
    } else if (block.type === 'text') {
      const content = fillVars(block.text || '', vars)
      if (block.bordered && block.label) {
        body += `<div class="block form-block"><table class="form-table"><tbody><tr><td class="form-label form-label-text">${esc(block.label)}</td><td class="form-content-cell">${content}</td></tr></tbody></table></div>`
      } else {
        body += `<div class="block text-block">${content}</div>`
      }
    } else if (block.type === 'attachments') {
      const perRow = Math.min(Math.max(Number(block.perRow) || 2, 1), 4)
      const cached = record ? attachCache.get(`${record.recordId}|${block.fieldId}`) : null
      const urls = cached?.urls || []
      const nonImages = cached?.nonImages || 0
      let content = ''
      if (urls.length) {
        const figs = urls
          .map((u) => `<figure class="attach-item"><img src="${esc(u)}" alt="附件" /></figure>`)
          .join('')
        content = `<div class="attach-grid" style="grid-template-columns:repeat(${perRow},1fr)">${figs}</div>`
      } else if (record && record.fields?.[block.fieldId]) {
        const hint = String(record.fields[block.fieldId]).slice(0, 60)
        content = `<div class="attach-empty">${nonImages ? '含非图片附件' : '未取到图片附件'}：${esc(hint)}</div>`
      }
      if (content) {
        body += `<div class="block form-block attach-block">${esc(block.label) ? `<div class="form-section-title">${esc(block.label)}</div>` : ''}${content}</div>`
      }
    } else if (block.type === 'sign') {
      const lineCount = Math.max(1, Number(block.lines) || 2)
      const cols = Array.isArray(block.columns) && block.columns.length ? block.columns : null
      if (cols) {
        const cells = cols
          .map(
            (c) =>
              `<td class="sign-cell"><div class="sign-cell-label">${esc(c)}</div><div class="sign-cell-space">${'<div class="sign-line"></div>'.repeat(lineCount)}</div></td>`
          )
          .join('')
        body += `<div class="block form-block"><table class="form-table sign-grid"><tbody><tr>${cells}</tr></tbody></table></div>`
      } else {
        const lines = '<div class="sign-line"></div>'.repeat(lineCount)
        body += `<div class="block sign-block">${esc(block.label || '签名') ? `<div class="block-title">${esc(block.label)}</div>` : ''}<div class="sign-lines">${lines}</div></div>`
      }
    }
  }

  const logo = template.logoUrl
    ? `<img class="logo" src="${esc(template.logoUrl)}" alt="logo" />`
    : ''
  return `
<div class="page">
  <div class="page-header">
    ${logo}
    <div class="title-wrap">
      <h1 class="page-title">${esc(template.title || '')}</h1>
      ${template.subtitle ? `<div class="page-subtitle">${esc(template.subtitle)}</div>` : ''}
    </div>
    <div class="header-meta">第 ${page} 页 / 共 ${pages} 页</div>
  </div>
  <div class="page-body">${body}</div>
  <div class="page-footer">${fillVars(template.footer || '', vars)}</div>
</div>`
}

export function renderAll(template, records) {
  if (!template) return ''
  const list = records || []
  if (template.pageBreak === 'continuous') {
    return renderRecord(template, null, 1, 1, list)
  }
  return list
    .map((r, i) => renderRecord(template, r, i + 1, list.length, list))
    .join('\n')
}
