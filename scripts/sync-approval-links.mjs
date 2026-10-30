// GitHub Actions 定时任务：把审批票据直链写回多维表格“票据直链”字段
// 主判据是「直链刷新时间」的年龄（默认 16 小时到期重拉），探活只做写入前校验。
// 环境变量：
//   FEISHU_APP_ID / FEISHU_APP_SECRET  审批应用（机器人身份）
//   BASE_TOKEN                         多维表格 app token
//   TABLE_ID                           数据表 id
//   APPROVAL_DEFINITIONS               可选，多个审批定义 code 逗号分隔
//   SYNC_FORCE_ALL                     可选，设为 1 时忽略年龄、全量重扫
//   SYNC_RECENT_DAYS                   可选，最近 N 天内的记录每次都重扫（默认 1）
//   SYNC_MAX_AGE_HOURS                 可选，直链保鲜期小时数（默认 16）

const BASE_TOKEN = process.env.BASE_TOKEN
const TABLE_ID = process.env.TABLE_ID
const DEFS_DEFAULT = ''
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const TZ_OFFSET = 8 * HOUR // 审批与多维表格都按北京时间划分自然日
const FORCE_ALL = process.env.SYNC_FORCE_ALL === '1'
// 有了「直链刷新时间」做定期重拉后，重拉本身就会重新扫审批附件列表，
// 后补的附件最多延迟一个保鲜期被发现，所以「最近 N 天每轮重扫」已无必要，默认降到 1 天。
const RECENT_DAYS = Number(process.env.SYNC_RECENT_DAYS || 1)
// 直链寿命实测下界约 20.2 小时（10/29 14:27 重拉的那批，20.2h 仍可下载，24.5h 已 400）。
// 16 小时保鲜期留出 4 小时余量，足以覆盖「循环 job 330 分钟结束 + cron 最长拖到 435 分钟」
// 造成的约 1.75 小时断档。
const MAX_AGE = (Number(process.env.SYNC_MAX_AGE_HOURS) || 16) * HOUR

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

function dayStart(ms) {
  return Math.floor((ms + TZ_OFFSET) / DAY) * DAY - TZ_OFFSET
}

// 申请编号形如 202609280002，前 8 位就是审批发起的年月日
function serialDay(serial) {
  const m = String(serial || '').match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return Date.UTC(y, mo - 1, d) - TZ_OFFSET
}

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

async function listRecords(token) {
  const out = []
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
      const serial = ((serialObj && serialObj.text) || String(serialObj || '')).trim()
      if (!serial) continue
      out.push({
        recordId: it.record_id || it.id,
        serial,
        dateMs: numOrNull(f['报销日期']),
        createMs: numOrNull(f['发起时间']) || numOrNull(f['完成时间']),
        hasAttachment: Boolean(f['附件']),
        refreshedAt: numOrNull(f['直链刷新时间']),
        directLinks: String(f['票据直链'] || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      })
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

const dayListCache = new Map() // `${审批定义}|${北京时间自然日}` → 实例 code 列表
const detailCache = new Map() // 实例 code → { serial, urls }

// 单次列表接口最多覆盖 10 小时，这里按 10 小时切段并按需翻页
async function instanceCodesOfDay(token, def, dayMs) {
  const key = `${def}|${dayMs}`
  if (dayListCache.has(key)) return dayListCache.get(key)
  const codes = []
  for (let ws = dayMs; ws < dayMs + DAY; ws += 10 * HOUR) {
    const we = Math.min(ws + 10 * HOUR, dayMs + DAY)
    let pageToken = ''
    do {
      const q = new URLSearchParams({
        approval_code: def,
        page_size: '100',
        start_time: String(ws),
        end_time: String(we)
      })
      if (pageToken) q.set('page_token', pageToken)
      const d = await lark(
        token,
        `https://open.feishu.cn/open-apis/approval/v4/instances?${q}`
      )
      codes.push(...(d.instance_code_list || d.instance_codes || []))
      pageToken = d.page_token || ''
    } while (pageToken)
    await sleep(150)
  }
  dayListCache.set(key, codes)
  return codes
}

async function instanceDetail(token, code) {
  if (detailCache.has(code)) return detailCache.get(code)
  const d = await lark(
    token,
    `https://open.feishu.cn/open-apis/approval/v4/instances/${encodeURIComponent(code)}`
  )
  const info = { serial: String(d.serial_number || ''), urls: extractUrls(d.form) }
  detailCache.set(code, info)
  await sleep(120)
  return info
}

// 审批发起的日期可能和「报销日期」不在同一天（例如 9/28 提交、报销日期填 9/22），
// 所以同时用「编号里的日期 / 发起时间 / 报销日期」三种线索定位，并各自前后放宽一天。
function candidateDays(rec) {
  const days = new Set()
  const add = (ms) => {
    if (Number.isFinite(ms)) days.add(dayStart(ms))
  }
  add(serialDay(rec.serial))
  add(rec.createMs)
  add(rec.dateMs)
  if (!days.size) add(Date.now())
  return [...days]
}

async function fetchSerialUrls(token, defs, rec) {
  for (const base of candidateDays(rec)) {
    for (const off of [0, -1, 1]) {
      const day = base + off * DAY
      for (const def of defs) {
        const codes = await instanceCodesOfDay(token, def, day)
        for (const code of codes) {
          const info = await instanceDetail(token, code)
          if (info.serial === rec.serial) return info.urls
        }
      }
    }
  }
  return null
}

// 需要保证存在的字段：票据直链（多行文本，type 1）+ 直链刷新时间（日期，type 5）
const ENSURE_FIELDS = [
  { name: '票据直链', type: 1 },
  { name: '直链刷新时间', type: 5 }
]

async function ensureField(token) {
  const list = await lark(
    token,
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/fields?page_size=100`
  )
  const have = new Set((list.items || []).map((f) => f.field_name))
  let created = false
  for (const f of ENSURE_FIELDS) {
    if (have.has(f.name)) continue
    await lark(token, `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/fields`, {
      method: 'POST',
      body: JSON.stringify({ field_name: f.name, type: f.type })
    })
    created = true
  }
  // 新建字段后等一小会儿再写，避免字段还没传播到写接口时首批 PUT 报「字段不存在」
  if (created) await sleep(1500)
}

async function updateRecord(token, recordId, urls) {
  await lark(
    token,
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${TABLE_ID}/records/${recordId}`,
    {
      method: 'PUT',
      // 同一次 PUT 里顺带写入刷新时间，不额外增加请求
      body: JSON.stringify({
        fields: {
          '票据直链': urls.join('\n'),
          '直链刷新时间': Date.now()
        }
      })
    }
  )
}

// 校验直链可否下载。只作为「写入前后校验」，不再用作存活判断：
// 飞书过期直链通常返回 4xx，个别情况会返回 200 的提示页，所以状态码和内容类型都要看。
// 返回 image / file / dead 三态，octet-stream 是飞书图片常见的返回类型，不能判死。
async function probe(url) {
  if (!/^https?:\/\//.test(String(url || ''))) return 'dead'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal })
    r.body?.cancel()
    if (r.status < 200 || r.status >= 300) return 'dead'
    const ct = String(r.headers.get('content-type') || '').toLowerCase()
    if (ct.startsWith('image/')) return 'image'
    if (ct.includes('octet-stream') || ct.includes('pdf')) return 'file'
    return 'dead'
  } catch (e) {
    return 'dead'
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
}

export async function main() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) throw new Error('missing env')
  const token = await tenantToken()
  const defs = (process.env.APPROVAL_DEFINITIONS || DEFS_DEFAULT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!defs.length) throw new Error('missing APPROVAL_DEFINITIONS env')
  await ensureField(token)
  const all = await listRecords(token)
  const recentFrom = Date.now() - Math.max(0, RECENT_DAYS) * DAY
  const report = { records: all.length, fresh: 0, checked: 0, updated: 0, skipped: 0, failed: [] }
  for (const rec of all) {
    // 没有附件的记录不用查审批
    if (!rec.hasAttachment) {
      report.skipped++
      continue
    }
    const isRecent = Number.isFinite(rec.createMs) && rec.createMs >= recentFrom
    // 主判据是「直链年龄」而不是探活：老数据没有刷新时间字段 → ageMs 为 Infinity
    // → 首次运行自动全量重拉，正好完成历史数据初始化。
    const ageMs = Number.isFinite(rec.refreshedAt) ? Date.now() - rec.refreshedAt : Infinity
    const stale = FORCE_ALL || !Number.isFinite(ageMs) || ageMs > MAX_AGE
    if (!stale && !isRecent) {
      report.fresh++
      continue
    }
    report.checked++
    // 单条记录出错不能带垮整轮：一次权限/字段异常会让后面所有记录都被跳过 30 分钟
    try {
      const urls = await fetchSerialUrls(token, defs, rec)
      if (!urls || !urls.length) {
        report.failed.push({ serial: rec.serial, reason: 'not-found-in-approval' })
      } else if ((await probe(urls[0])) === 'dead') {
        // 写入前校验：宁可这一轮不写、下一轮再试，也不要把死链写进表里
        // （死链一旦写入并带上新的刷新时间，就会骗过年龄判断，卡住 16 小时）
        report.failed.push({ serial: rec.serial, reason: 'pulled-but-unreachable' })
      } else {
        await updateRecord(token, rec.recordId, urls)
        report.updated++
      }
    } catch (e) {
      report.failed.push({ serial: rec.serial, reason: 'exception: ' + (e?.message || e) })
    }
    await sleep(150)
  }
  console.log(JSON.stringify(report, null, 2))
  if (report.failed.length) {
    console.log(`::warning::${report.failed.length} 条记录本轮未取得可用直链`)
    for (const f of report.failed.slice(0, 20)) {
      console.log(`  - ${f.serial} (${f.reason})`)
    }
  }
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
