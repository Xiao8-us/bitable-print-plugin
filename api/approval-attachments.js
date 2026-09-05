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
const VER = '20260904b'

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

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

async function larkGet(token, url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((x) =>
      x.json()
    )
    if (r.code === 0) return r.data || {}
    if (r.code === 99991400 || r.code === 99991401) {
      await sleep(1200 * (attempt + 1))
      continue
    }
    throw new Error(`lark api ${url.split('?')[0]} error ${r.code}: ${r.msg}`)
  }
  throw new Error('lark api rate limit exceeded')
}

function serialDateMs(ms) {
  const d = new Date(Number(ms) + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

// 简单内存缓存：实例列表 / 实例详情 / 查询结果
const listCache = new Map()
const detailCache = new Map()
const resultCache = new Map()
const notFoundCache = new Map()
const CACHE_TTL = 30 * 60 * 1000

function cacheGet(map, key) {
  const e = map.get(key)
  if (!e) return null
  if (Date.now() - e.t > CACHE_TTL) {
    map.delete(key)
    return null
  }
  return e.v
}

function cacheSet(map, key, v) {
  map.set(key, { v, t: Date.now() })
}

async function larkListCodes(token, def, ws, we, pageToken) {
  const q = new URLSearchParams({
    approval_code: def,
    page_size: '100',
    start_time: String(ws),
    end_time: String(we)
  })
  if (pageToken) q.set('page_token', pageToken)
  const url = `https://open.feishu.cn/open-apis/approval/v4/instances?${q.toString()}`
  const ck = `${def}|${ws}|${we}|${pageToken || ''}`
  let d = cacheGet(listCache, ck)
  if (!d) {
    d = await larkGet(token, url)
    cacheSet(listCache, ck, d)
  }
  return d
}

async function larkInstanceDetail(token, code) {
  let d = cacheGet(detailCache, code)
  if (!d) {
    d = await larkGet(
      token,
      `https://open.feishu.cn/open-apis/approval/v4/instances/${encodeURIComponent(code)}`
    )
    cacheSet(detailCache, code, d)
  }
  return d
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
  // date 形如 20260903（无连字符），手工拼成 ISO 再解析
  const ymd = String(date || '').replace(/\D/g, '').slice(0, 8)
  const parsed =
    ymd.length === 8
      ? Date.parse(
          `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00+08:00`
        )
      : NaN
  const base = Number.isFinite(parsed) ? parsed : Date.now()
  // 优先报销当天与前一天；命中即返回，减少调用避免超时
  const days = [0, -1]
  const stats = { defs: defs.length, windows: 0, lists: 0, details: 0, codes: 0, serials: [] }
  for (const def of defs) {
    for (const off of days) {
      const from = base + off * DAY
      const to = from + DAY
      for (let ws = from; ws < to; ws += 10 * HOUR) {
        const we = Math.min(ws + 10 * HOUR, to)
        stats.windows++
        let pageToken = ''
        for (let page = 0; page < 10; page++) {
          const d = await larkListCodes(token, def, ws, we, pageToken)
          stats.lists++
          const codes =
            d.instance_code_list || d.instance_codes || (Array.isArray(d) ? d : [])
          for (const code of codes) {
            stats.codes++
            const detail = await larkInstanceDetail(token, code)
            stats.details++
            if (stats.serials.length < 60) stats.serials.push(detail.serial_number || '')
            if (String(detail.serial_number || '') === serial) {
              return { detail, stats }
            }
          }
          if (!d.has_more) break
          pageToken = d.page_token || ''
          if (!pageToken) break
        }
      }
    }
  }
  return { detail: null, stats }
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
    const rk = serial + '|' + (date || '')
    const hit = cacheGet(resultCache, rk)
    if (hit) return json(res, 200, hit)
    const nfAt = notFoundCache.get(rk)
    if (nfAt && Date.now() - nfAt < 10 * 60 * 1000) {
      return json(res, 404, { ok: false, error: 'instance not found', ver: VER })
    }
    const found = await findInstanceBySerial(token, serial, date)
    const inst = found.detail
    if (!inst) {
      notFoundCache.set(rk, Date.now())
      if (req.query.debug === '1') {
        return json(res, 404, {
          ok: false,
          error: 'instance not found',
          ver: VER,
          debug: found.stats
        })
      }
      return json(res, 404, { ok: false, error: 'instance not found', ver: VER })
    }
    const urls = extractAttachmentUrls(inst.form)
    const body = { ok: true, urls, ver: VER }
    cacheSet(resultCache, rk, body)
    return json(res, 200, body)
  } catch (e) {
    return json(res, 502, { ok: false, error: String(e?.message || e) })
  }
}
