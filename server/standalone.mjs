// 内网一体部署：一个 Node 服务同时托管插件静态页 + /api/approval-attachments
// 启动：npm run build && npm run serve   （默认端口 8080，可用 PORT 环境变量改）
// 生产建议：前置 Nginx/Caddy 提供 HTTPS 并反代到本服务

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import approvalHandler from '../api/approval-attachments.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../dist')
const PORT = Number(process.env.PORT || 8080)

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://internal')
  try {
    if (url.pathname.startsWith('/api/')) {
      req.query = Object.fromEntries(url.searchParams.entries())
      await approvalHandler(req, res)
      return
    }
    let p = decodeURIComponent(url.pathname)
    if (p === '/') p = '/index.html'
    const file = path.join(DIST, p)
    const rel = path.relative(DIST, file)
    if (rel.startsWith('..')) {
      res.statusCode = 403
      res.end('forbidden')
      return
    }
    const data = await readFile(file)
    const ext = path.extname(file).toLowerCase()
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.end(data)
  } catch (e) {
    try {
      const data = await readFile(path.join(DIST, 'index.html'))
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('not found')
    }
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`bitable-print-plugin 内网服务已启动：http://0.0.0.0:${PORT}`)
  console.log(`插件页面：http://<服务器IP或域名>:${PORT}/`)
  console.log(`票据接口：http://<服务器IP或域名>:${PORT}/api/approval-attachments`)
})
