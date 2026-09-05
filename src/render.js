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
  if (template.kind === 'expense' && template.expense?.attachment) {
    return [{ fieldId: template.expense.attachment }]
  }
  return (template.blocks || []).filter((b) => b.type === 'attachments' && b.fieldId)
}

function fmtDate(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  return s.replace(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2}).*/, '$1/$2/$3')
}

function splitDetails(raw) {
  const out = []
  const lines = String(raw || '').replace(/\r/g, '').split(/\n+/)
  for (const ln of lines) {
    const segs = ln.split(/(?<=[+＋;；])\s*(?=[0-9])/)
    for (const s of segs) {
      const t = s.trim()
      if (t) out.push(t)
    }
  }
  return out
}

function extractAmount(text) {
  const s = String(text || '').replace(/,/g, '')
  const m = s.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*元\s*$/)
  if (m) return parseFloat(m[1])
  const nums = s.match(/([0-9]+(?:\.[0-9]{1,2})?)/g)
  if (nums && nums.length) {
    return Math.max(...nums.map(Number))
  }
  return null
}

// 把审批明细行清洗成可读内容：
// “报销内容:购买电梯风扇 | 日期（年-月-日）:2026-08-29 00:00:00 | 金额:74.000000 CNY”
//  → { text: “购买电梯风扇（8/29）”, amount: 74 }
function parseDetailLine(line) {
  const s = String(line || '').trim()
  const contentM = s.match(/报销内容[:：]\s*([^|]+)/)
  if (contentM) {
    const content = contentM[1].trim()
    const amountM = s.match(/金额[:：]\s*([\d,]+(?:\.\d{1,2})?)/)
    return {
      text: content,
      amount: amountM ? parseFloat(amountM[1].replace(/,/g, '')) : null,
      structured: true
    }
  }
  return { text: s, amount: extractAmount(s), structured: false }
}

function fmtAmount(n) {
  return Number(n).toFixed(2)
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

function isImgUrl(u) {
  const p = String(u || '').split('?')[0].split('#')[0].toLowerCase()
  return IMG_EXT.test(p)
}

function extractLinkAttachments(raw) {
  const s = String(raw || '')
  const out = []
  const mdRe = /\[([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g
  let m
  while ((m = mdRe.exec(s))) {
    const name = (m[1] || '').trim() || '附件'
    if (!out.some((o) => o.url === m[2])) out.push({ name, url: m[2] })
  }
  if (!out.length) {
    const urlRe = /https?:\/\/[^\s)\]]+/g
    let u
    while ((u = urlRe.exec(s))) {
      if (!out.some((o) => o.url === u[0])) out.push({ name: '附件', url: u[0] })
    }
  }
  return out
}

function shortUrl(u) {
  return String(u).replace(/^https?:\/\//, '').slice(0, 90)
}

function attachmentsHtml(record, fieldId, cached, perRow, webOnly = false) {
  if (!record || !fieldId) return ''
  const raw = record.fields?.[fieldId]
  let items = []
  if (cached?.urls?.length) {
    items = cached.urls.map((u) => ({ url: u, kind: 'img' }))
  } else {
    items = extractLinkAttachments(raw).map((o) => ({
      url: o.url,
      kind: isImgUrl(o.url) ? 'img' : 'link',
      name: o.name
    }))
  }
  if (!items.length) {
    if (!raw) return ''
    const msg = cached?.msg || '附件无法预览'
    return `<div class="attach-empty">${esc(msg)}</div>`
  }
  const links = items.filter((i) => i.kind === 'link')
  const imgs = items.filter((i) => i.kind === 'img')
  if (webOnly && !imgs.length && links.length) {
    const msg = cached?.msg || '含审批附件：请在模板映射里选择「票据直链字段」以自动打印票据图片'
    return `<div class="attach-empty">${esc(msg)}</div>`
  }
  const grid = imgs.length
    ? `<div class="attach-grid" style="grid-template-columns:repeat(${perRow},1fr)">${imgs
        .map(
          (i) =>
            `<figure class="attach-item"><img src="${esc(i.url)}" alt="附件" /></figure>`
        )
        .join('')}</div>`
    : ''
  const linkBlock = links.length
    ? `<div class="attach-links">${links
        .map(
          (l, i) =>
            `<div class="attach-link">${esc(l.name || '附件' + (i + 1))}：${esc(shortUrl(l.url))}</div>`
        )
        .join('')}</div>`
    : ''
  return grid + linkBlock
}

const CN_DIGIT = '零壹贰叁肆伍陆柒捌玖'
const CN_UNIT = ['', '拾', '佰', '仟']
const CN_BIG = ['', '万', '亿', '兆']

function intToCnUpper(n) {
  if (n === 0) return '零'
  const s = String(n)
  const pad = s.padStart(Math.ceil(s.length / 4) * 4, '0')
  const groupCount = pad.length / 4
  let out = ''
  for (let g = 0; g < groupCount; g++) {
    const seg = pad.slice(g * 4, g * 4 + 4)
    const val = Number(seg)
    if (val === 0) continue
    let part = ''
    for (let k = 0; k < 4; k++) {
      const digit = Number(seg[k])
      const pos = 3 - k
      if (digit > 0) {
        part += CN_DIGIT[digit] + CN_UNIT[pos]
      } else if (part && !part.endsWith('零')) {
        part += '零'
      }
    }
    if (part.endsWith('零')) part = part.slice(0, -1)
    const gi = groupCount - 1 - g
    if (out) {
      if (seg[0] === '0' && !out.endsWith('零')) out += '零'
    }
    out += part + CN_BIG[gi]
  }
  return out
}

export function amountUpperCn(text) {
  const clean = String(text ?? '').replace(/[^\d.-]/g, '')
  const num = parseFloat(clean)
  if (!isFinite(num) || num < 0 || num > 999999999999) return ''
  const [intPart, decPart = ''] = String(num.toFixed(2)).split('.')
  const int = parseInt(intPart, 10)
  let out = intToCnUpper(int) + '元'
  const jiao = Number(decPart[0] || 0)
  const fen = Number(decPart[1] || 0)
  if (jiao === 0 && fen === 0) return out + '整'
  if (jiao > 0) out += CN_DIGIT[jiao] + '角'
  if (fen > 0) out += CN_DIGIT[fen] + '分'
  return out
}

export function extractSerial(text) {
  const s = String(text || '')
  const md = s.match(/\[([^\]]+)\]/)
  if (md && /\d/.test(md[1])) return md[1].trim()
  const num = s.match(/\d{8,}/)
  return num ? num[0] : ''
}

export async function enrichApprovalAttachments(template, records) {
  if (!template || template.kind !== 'expense' || !records?.length) return
  const cfg = template.expense
  if (!cfg?.attachment) return
  for (const r of records.slice(0, 30)) {
    const key = `${r.recordId}|${cfg.attachment}`
    if (attachCache.has(key)) continue
    const directUrls = cfg.directField
      ? String(r.fields?.[cfg.directField] || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => /^https?:\/\//.test(s) && !/previewAttachment/.test(s))
      : []
    if (directUrls.length) {
      attachCache.set(key, { urls: directUrls, nonImages: 0 })
    }
  }
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
      const content = attachmentsHtml(record, block.fieldId, cached, perRow)
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
  const pageCls = template.paper === 'a5' ? 'page page-a5' : 'page'
  return `
<div class="${pageCls}">
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
  if (template.kind === 'expense') {
    if (!list.length) return ''
    const flat = []
    for (const r of list) {
      flat.push(expenseFormHtml(template, r))
      flat.push(...expenseAttachPages(template, r))
    }
    return flat.map((b, i) => b(i + 1, flat.length)).join('\n')
  }
  if (template.pageBreak === 'continuous') {
    return renderRecord(template, null, 1, 1, list)
  }
  return list
    .map((r, i) => renderRecord(template, r, i + 1, list.length, list))
    .join('\n')
}

function buildExpenseRows(lines, declaredAmount, blanksAfter, depRows, total) {
  const bodyCount = lines.length + blanksAfter
  const U = depRows
  const blankA = U >= 2 ? U - 1 : 0
  const blankB = bodyCount - U - 1 // 领导标签之后、合计之前的明细行数
  const bodyTexts = lines.map((l) => ({
    cls: 'exp-data',
    item: esc(l.text),
    amt: esc((declaredAmount || (l.amount != null ? fmtAmount(l.amount) : '')) || '')
  }))
  for (let i = 0; i < blanksAfter; i++) {
    bodyTexts.push({ cls: 'exp-blank', item: '', amt: '' })
  }
  let rows = ''
  bodyTexts.forEach((b, i) => {
    let col = ''
    if (i === 0 && U > 0) col = `<td class="exp-blank-box" rowspan="${U}"></td>`
    else if (i === U && U > 0 && U < bodyCount)
      col = '<td class="exp-label-cell">领导审批</td>'
    else if (i === U + 1 && blankB > 0)
      col = `<td class="exp-blank-box" rowspan="${blankB + 1}"></td>`
    rows += `<tr class="${b.cls}"><td class="exp-item">${b.item}</td><td class="exp-amt">${b.amt}</td>${col}</tr>`
  })
  let totalRow
  if (U >= bodyCount) {
    totalRow = `<tr class="exp-total"><td class="exp-total-label">合　计</td><td class="exp-amt">${esc(total || '')}</td><td class="exp-label-cell">领导审批</td></tr>`
  } else if (blankB === 0) {
    totalRow = `<tr class="exp-total"><td class="exp-total-label">合　计</td><td class="exp-amt">${esc(total || '')}</td><td class="exp-blank-box"></td></tr>`
  } else {
    totalRow = `<tr class="exp-total"><td class="exp-total-label">合　计</td><td class="exp-amt">${esc(total || '')}</td></tr>`
  }
  return { rows, totalRow }
}

function expenseFormHtml(template, record) {
  const cfg = template.expense || {}
  const val = (fid) => valueFor(record, fid)
  const codeShown = extractSerial(val(cfg.code)) || val(cfg.code) || extractSerial(val(cfg.serialField))
  const itemRaw = String(val(cfg.item) || '')
  const declaredAmount = val(cfg.amount)

  // 长明细自动分行：按换行拆，每行尽量拆出金额
  const detailLines = []
  if (itemRaw) {
    const parts = splitDetails(itemRaw)
    if (parts.length) {
      for (const p of parts) {
        const parsed = parseDetailLine(p)
        const text = cfg.detailMode === 'raw' ? p : parsed.text
        detailLines.push({ text, amount: parsed.amount })
      }
    } else {
      const parsed = parseDetailLine(itemRaw)
      const text = cfg.detailMode === 'raw' ? itemRaw : parsed.text
      detailLines.push({ text, amount: parsed.amount })
    }
  }
  const autoRows = cfg.autoRows !== false && detailLines.length > 1
  const linesToShow = autoRows
    ? detailLines
    : [detailLines[0] || { text: '', amount: null }]
  const parsedSum = detailLines.reduce((sum, l) => sum + (l.amount || 0), 0)
  const total = declaredAmount || (parsedSum > 0 ? fmtAmount(parsedSum) : '')
  const upper = val(cfg.uppercase) || amountUpperCn(total)
  const extraBlanks = autoRows ? Math.max(0, linesToShow.length - 1) : 0
  const emptyRows = Math.min(Math.max(Number(cfg.emptyRows) || 3, 0), 6)
  const blanksAfter = autoRows ? Math.max(0, emptyRows - extraBlanks) : emptyRows

  // 右侧审批区单个列：部门主管意见占前 depRows 行，
  // 领导审批紧接其下直到合计行；两块无间隙
  const bodyCount = linesToShow.length + blanksAfter
  const manualDep = Number(cfg.depRows)
  const depRows =
    manualDep >= 1
      ? Math.min(Math.floor(manualDep), bodyCount)
      : Math.max(1, Math.ceil(bodyCount / 2))
  const builtRows = buildExpenseRows(
    linesToShow,
    declaredAmount,
    blanksAfter,
    depRows,
    total
  )
  const dataRows = builtRows.rows
  const totalRow = builtRows.totalRow
  const capRow = `<tr class="exp-cap-row"><td class="exp-cap-label">金额大写：</td><td class="exp-cap-value" colspan="2">${esc(upper)}</td></tr>`
  const signCell = (txt) =>
    txt ? `<div class="exp-sign-filled">${esc(txt)}</div>` : '<div class="exp-sign-space"></div>'
  const payerName = cfg.payerField ? val(cfg.payerField) : ''

  return (page, pages) => {
    const footer = fillVars(template.footer || '', { page, pages })
    return `
<div class="page page-a5">
  <div class="exp-title-line">
    <h1 class="page-title">费用报销单</h1>
  </div>
  <div class="exp-meta">
    <span class="exp-meta-item">报销单位：${esc(val(cfg.company))}</span>
    <span class="exp-meta-date">${esc(fmtDate(val(cfg.date)))}</span>
    <span class="exp-meta-item">编号：${esc(codeShown)}</span>
  </div>
  <table class="exp-table exp-table-approve">
    <thead>
      <tr>
        <th class="exp-th-item">用途</th>
        <th class="exp-th-amt">金额(元)</th>
        <th class="exp-th-approve">部门主管意见</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows}
      ${totalRow}
      ${capRow}
    </tbody>
  </table>
  <div class="exp-sign">
    <div class="exp-sign-cell"><span class="exp-sign-label">复核：</span>${signCell(cfg.reviewerText)}</div>
    <div class="exp-sign-cell"><span class="exp-sign-label">出纳：</span>${signCell(cfg.cashierText)}</div>
    <div class="exp-sign-cell"><span class="exp-sign-label">领款人：</span>${signCell(payerName)}</div>
  </div>
  ${footer ? `<div class="page-footer">${footer}</div>` : ''}
  <div class="exp-page-no">${page}/${pages}</div>
</div>`
  }
}

function expenseAttachPages(template, record) {
  const cfg = template.expense || {}
  if (!cfg.attachment || !record) return []
  const cached = attachCache.get(`${record.recordId}|${cfg.attachment}`)
  if (!cached?.urls?.length) {
    const content = attachmentsHtml(record, cfg.attachment, cached, 3, true)
    if (!content) return []
    return [attachPageBuilder(template, record, content)]
  }
  const orient = cached.orient || cached.urls.map(() => 'portrait')
  const portraits = []
  const landscapes = []
  cached.urls.forEach((u, i) => {
    ;(orient[i] === 'landscape' ? landscapes : portraits).push(u)
  })
  const builders = []
  if (portraits.length) {
    const figs = portraits
      .map((u) => `<figure class="attach-item"><img src="${esc(u)}" alt="附件" /></figure>`)
      .join('')
    builders.push(
      attachPageBuilder(
        template,
        record,
        `<div class="attach-grid" style="grid-template-columns:repeat(3,1fr)">${figs}</div>`
      )
    )
  }
  for (const u of landscapes) {
    builders.push((page, pages) => {
      const label = attachPageLabel(template, record)
      return `<div class="page page-a5 attach-page attach-landscape">
  <div class="attach-page-head">
    <span class="attach-page-title">费用报销单 · 附件票据</span>
    <span class="attach-page-no-label">编号：${esc(label)}</span>
  </div>
  <figure class="landscape-item"><img src="${esc(u)}" alt="附件" /></figure>
  <div class="exp-page-no">${page}/${pages}</div>
</div>`
    })
  }
  if (!builders.length && cached.msg) {
    builders.push(attachPageBuilder(template, record, `<div class="attach-empty">${esc(cached.msg)}</div>`))
  }
  return builders
}

function attachPageLabel(template, record) {
  const cfg = template.expense || {}
  const val = (fid) => valueFor(record, fid)
  const serial = extractSerial(record.fields?.[cfg.serialField])
  return val(cfg.code) || serial
}

function attachPageBuilder(template, record, content) {
  const label = attachPageLabel(template, record)
  return (page, pages) => `
<div class="page page-a5 attach-page">
  <div class="attach-page-head">
    <span class="attach-page-title">费用报销单 · 附件票据</span>
    <span class="attach-page-no-label">编号：${esc(label)}</span>
  </div>
  ${content}
  <div class="exp-page-no">${page}/${pages}</div>
</div>`
}

export async function inspectAttachmentOrientations(template, records) {
  if (!template || template.kind !== 'expense' || !records?.length) return
  const cfg = template.expense
  if (!cfg?.attachment) return
  for (const r of records.slice(0, 30)) {
    const entry = attachCache.get(`${r.recordId}|${cfg.attachment}`)
    if (!entry?.urls?.length || entry.orient) continue
    entry.orient = await Promise.all(entry.urls.map(probeOrientation))
  }
}

function probeOrientation(u) {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => {
      img.onload = img.onerror = null
      resolve('portrait')
    }, 2500)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait')
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve('portrait')
    }
    img.src = u
  })
}
