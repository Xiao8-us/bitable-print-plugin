// GitHub Actions 定时任务：把审批票据直链写回多维表格“票据直链”字段
// 环境变量：
//   FEISHU_APP_ID / FEISHU_APP_SECRET  审批应用（机器人身份）
//   BASE_TOKEN                         多维表格 app token
//   TABLE_ID                           数据表 id
//   APPROVAL_DEFINITIONS               可选，多个审批定义 code 逗号分隔

const BASE_TOKEN = process.env.BASE_TOKEN
const TABLE_ID = process.env.TABLE_ID
const DEFS_DEFAULT =
  'FF12E11B-CB61-487B-A551-A47C6C838F32,3CEE9405-4F03-43E9-BE3C-C7D149E5F089'

async function tenantToken() {
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  }).then((x) => x.json())
  if (!r.tenant_access_token) throw new Error('token failed: ' + JSON.stringify(r))
  return r.tenant_access_token
}

async function lark(token, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  }).then((x) => x.json())
  if (res.code !== 0) throw new Error(`lark ${url.split('?')[0]} error ${res.code}: ${res.msg}`)
  return res.data || {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listRecords(token, serials) {
  const out = new Map()
  let pageToken = ''
  do {
    const q = new URLSearchParams({ page_size: '500' })
    if (pageToken) q.set('page_token', pageToken)
    const d = await lark(
      token,
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records?${q}`
    )
    for (const it of d.items || []) {
      const f = it.fields || {}
      const serialObj = f['申请编号']
      const serial = (serialObj && serialObj.text) || String(serialObj || '').trim()
      if (serial && f['附件'] && (serials.has('*') || serials.has(serial))) {
        const dateVal = f['报销日期']
        out.set(serial, {
          recordId: it.record_id || it.id,
          serial,
          dateMs: typeof dateVal === 'number' ? dateVal : null
        })
      }
    }
    pageToken = d.page_token || ''
  } while (pageToken)
  return out
}

function extractUrls(form) {
  const urls = []
  try {
    const arr = typeof form === 'string' ? JSON.parse(form) : form
    for (const item of Array.isArray(arr) ? arr : []) {
      const name = String(item?.name || '')
      const type = String(item?.type || '')
      if (!/附件/i.test(name) && !/attachment/i.test(type)) continue
      const v = item?.value
      const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
      for (const u of list) {
        const s = String(u || '').trim()
        if (/^https?:\/\//.test(s)) urls.push(s)
      }
    }
  } catch (e) {
    /* ignore */
  }
  return urls
}

async function fetchSerialUrls(token, defs, serial, dateMs) {
  const HOUR = 3600 * 1000
  const DAY = 24 * HOUR
  const base = dateMs ? dateMs : Date.now()
  for (const def of defs) {
    for (const off of [0, -1]) {
      const from = base + off * DAY
      const to = from + DAY
      for (let ws = from; ws < to; ws += 10 * HOUR) {
        const we = Math.min(ws + 10 * HOUR, to)
        const q = new URLSearchParams({
          approval_code: def,
          page_size: '100',
          start_time: String(ws),
          end_time: String(we)
        })
        const d = await lark(
          token,
          `https://open.feishu.cn/open-apis/approval/v4/instances?${q}`
        )
        const codes = d.instance_code_list || d.instance_codes || []
        for (const code of codes) {
          const detail = await lark(
            token,
            `https://open.feishu.cn/open-apis/approval/v4/instances/${encodeURIComponent(code)}`
          )
          if (String(detail.serial_number || '') === serial) {
            return extractUrls(detail.form)
          }
          await sleep(150)
        }
        await sleep(200)
      }
    }
  }
  return null
}

async function ensureField(token) {
  const list = await lark(
    token,
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/fields?page_size=100`
  )
  const has = (list.items || []).some((f) => f.field_name === '票据直链')
  if (has) return
  await lark(token, `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/fields`, {
    method: 'POST',
    body: JSON.stringify({ field_name: '票据直链', type: 1 })
  })
}

async function updateRecord(token, recordId, urls) {
  await lark(
    token,
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records/${recordId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ fields: { '票据直链': urls.join('\n') } })
    }
  )
}

export async function main() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) throw new Error('missing env')
  const token = await tenantToken()
  const defs = (process.env.APPROVAL_DEFINITIONS || DEFS_DEFAULT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // 拉最近 8 天所有记录里的编号作为候选（简单起见先收集全部记录中的编号）
  const all = await listRecords(token, new Set(['*']))
  const report = { scanned: 0, updated: 0, failed: [] }
  await ensureField(token)
  for (const rec of all.values()) {
    report.scanned++
    const urls = await fetchSerialUrls(token, defs, rec.serial, rec.dateMs)
    if (urls && urls.length) {
      await updateRecord(token, rec.recordId, urls)
      report.updated++
    } else {
      report.failed.push(rec.serial)
    }
    await sleep(300)
  }
  console.log(JSON.stringify(report, null, 2))
}

import { pathToFileURL } from 'node:url'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e)
      process.exit(1)
    }
  )
}
