// 审批票据直链后端（Vercel Serverless Function）
// 用法：GET /api/approval-attachments?serial=202609030001&date=20260903
// 返回：{ ok: true, urls: ["https://...", ...] }
//
// 环境变量（Vercel -> Settings -> Environment Variables）：
//   FEISHU_APP_ID      审批表所在租户的自建应用 App ID（cli_aa... 这类）
//   FEISHU_APP_SECRET  该应用的 App Secret
//   APPROVAL_DEFINITIONS  可选，多个审批定义 Code 用英文逗号分隔；
//                        默认覆盖“费用报销2026 / 费用报销”两个定义

const DEFS_DEFAULT =
  'FF12E11B-CB61-487B-A551-A47C6C838F32,3CEE9405-4F03-43E9-BE3C-C7D149E5F089'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(body))
}

async function tenantToken() {
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  }).then((x) => x.json())
  if (!r.tenant_access_token) throw new Error('tenant token failed: ' + JSON.stringify(r))
  return r.tenant_access_token
}

async function larkGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json())
  if (r.code !== 0) throw new Error(`lark api ${url.split('?')[0]} error ${r.code}: ${r.msg}`)
  return r.data || {}
}

function serialDateMs(ms) {
  const d = new Date(Number(ms) + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function extractAttachmentUrls(form) {
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

async function findInstanceBySerial(token, serial, date) {
  const defs = (process.env.APPROVAL_DEFINITIONS || DEFS_DEFAULT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const HOUR = 3600 * 1000
  const DAY = 24 * HOUR
  // 接口要求每次查询区间 ≤10 小时，且必须带 start_time/end_time。
  // 以报销日期为锚点，往前 3 天、往后 1 天，按 10 小时窗口分片扫描。
  const base = date
    ? Date.parse(`${date}T00:00:00+08:00`)
    : Math.floor(Date.now() / HOUR) * HOUR
  const from = Number.isFinite(base) ? base - 3 * DAY : Date.now() - 7 * DAY
  const to = Number.isFinite(base) ? base + 1 * DAY : Date.now()
  for (const def of defs) {
    for (let ws = from; ws < to; ws += 10 * HOUR) {
      const we = Math.min(ws + 10 * HOUR, to)
      let pageToken = ''
      for (let page = 0; page < 10; page++) {
        const q = new URLSearchParams({
          approval_code: def,
          page_size: '100',
          start_time: String(ws),
          end_time: String(we)
        })
        if (pageToken) q.set('page_token', pageToken)
        const d = await larkGet(
          token,
          `https://open.feishu.cn/open-apis/approval/v4/instances?${q.toString()}`
        )
        const codes =
          d.instance_code_list || d.instance_codes || (Array.isArray(d) ? d : [])
        for (const code of codes) {
          const detail = await larkGet(
            token,
            `https://open.feishu.cn/open-apis/approval/v4/instances/${encodeURIComponent(code)}`
          )
          if (String(detail.serial_number || '') === serial) {
            return detail
          }
        }
        if (!d.has_more) break
        pageToken = d.page_token || ''
        if (!pageToken) break
      }
    }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end()
    return
  }
  const serial = String(req.query.serial || '').trim()
  const date = String(req.query.date || '').trim()
  if (!serial) return json(res, 400, { ok: false, error: 'serial required' })
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    return json(res, 500, { ok: false, error: 'server env not configured' })
  }
  try {
    const token = await tenantToken()
    const inst = await findInstanceBySerial(token, serial, date)
    if (!inst) return json(res, 404, { ok: false, error: 'instance not found' })
    const urls = extractAttachmentUrls(inst.form)
    return json(res, 200, { ok: true, urls })
  } catch (e) {
    return json(res, 502, { ok: false, error: String(e?.message || e) })
  }
}
