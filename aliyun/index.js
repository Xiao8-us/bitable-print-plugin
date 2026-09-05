// 阿里云函数计算入口：一个函数同时服务插件静态页 + /api/approval-attachments
// 运行时：Node.js 18（或 20）；入口：index.handler
// 部署：把 index.js、api/、dist/ 打包成 zip 上传；环境变量见 README

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import approvalHandler from '../api/approval-attachments.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
}

function simpleRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k] = v
    },
    end(b) {
      this.body = b == null ? '' : String(b)
    }
  }
}

export async function handler(event) {
  const pathname = event.path || '/'
  try {
    if (pathname.startsWith('/api/')) {
      const req = {
        method: event.httpMethod || 'GET',
        query: event.queryParameters || {}
      }
      const res = simpleRes()
      await approvalHandler(req, res)
      return {
        isBase64Encoded: false,
        statusCode: res.statusCode || 200,
        headers: res.headers || {},
        body: res.body || ''
      }
    }
    let p = decodeURIComponent(pathname)
    if (p === '/') p = '/index.html'
    const file = path.join(DIST, p)
    const rel = path.relative(DIST, file)
    if (rel.startsWith('..')) {
      return { isBase64Encoded: false, statusCode: 403, headers: {}, body: 'forbidden' }
    }
    const data = await readFile(file)
    const ext = path.extname(file).toLowerCase()
    const ct = MIME[ext] || 'application/octet-stream'
    const isBinary = /\.(png|jpg|jpeg|gif|webp|bmp|ico|woff2)$/i.test(file)
    const body = isBinary ? data.toString('base64') : data.toString('utf8')
    return {
      isBase64Encoded: isBinary,
      statusCode: 200,
      headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' },
      body
    }
  } catch (e) {
    try {
      const data = await readFile(path.join(DIST, 'index.html'))
      return {
        isBase64Encoded: false,
        statusCode: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: data.toString('utf8')
      }
    } catch {
      return { isBase64Encoded: false, statusCode: 404, headers: {}, body: 'not found' }
    }
  }
}
