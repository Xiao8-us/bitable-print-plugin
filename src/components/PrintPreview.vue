<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { attachCache, ds, ensureRecords, prepareAttachmentsFor } from '../bitable.js'
import { currentTemplate } from '../store.js'
import {
  collectAttachmentBlocks,
  enrichApprovalAttachments,
  inspectAttachmentOrientations,
  renderAll
} from '../render.js'
import { download, escCsv, PRINT_CSS } from '../utils.js'

// 由 vite.config.js 注入的构建时间，用于确认加载的是哪一版插件
const BUILD_STAMP = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev'

const selected = computed(() =>
  ds.records.filter((r) => ds.selectedRecordIds.includes(r.recordId))
)
const html = ref('')
const printing = ref(false)
// 正在跑的 refresh Promise。并发调用直接复用同一个实例，
// 这样 await refresh() 一定能等到 refreshPending 追加的最后一轮结束；
// 用「等两帧 HTML 不变」之类的启发式判断，在慢网络下会误判。
let refTask = null
let refreshPending = false
const previewDim = computed(() =>
  currentTemplate.value?.paper === 'a5' ? { w: 794, h: 559 } : { w: 794, h: 1123 }
)

function refresh() {
  if (refTask) {
    refreshPending = true
    return refTask
  }
  refTask = (async () => {
    try {
      do {
        refreshPending = false
        await renderOnce()
      } while (refreshPending)
    } finally {
      refTask = null
    }
  })()
  return refTask
}

async function renderOnce() {
  const t = currentTemplate.value
  const recs = selected.value
  if (!t) {
    html.value = ''
    return
  }
  html.value = renderAll(t, recs)
  updateScale()
  await enrichApprovalAttachments(t, recs)
  await inspectAttachmentOrientations(t, recs)
  const blocks = collectAttachmentBlocks(t)
  if (blocks.length) {
    for (const b of blocks) {
      await prepareAttachmentsFor(b.fieldId, recs.slice(0, 50).map((r) => r.recordId))
    }
  }
  ensureExpenseAttachMsg(t, recs)
  if (currentTemplate.value === t) {
    html.value = renderAll(currentTemplate.value, selected.value)
  }
}

function ensureExpenseAttachMsg(t, recs) {
  if (!t || t.kind !== 'expense' || !t.expense?.attachment) return
  const cfg = t.expense
  for (const r of recs) {
    const entry = attachCache.get(`${r.recordId}|${cfg.attachment}`)
    if (!entry || entry.urls?.length) continue
    if (!entry.msg) {
      if (cfg.directField) {
        entry.msg = '该记录暂无票据直链：等待每 30 分钟自动同步，或点「重试拉取票据」'
      } else {
        entry.msg = '请在映射里选择「票据直链字段」以自动打印票据图片'
      }
    }
  }
}

function retryAttachments() {
  const t = currentTemplate.value
  if (!t || t.kind !== 'expense' || !t.expense?.attachment) return
  const cfg = t.expense
  for (const r of selected.value) {
    attachCache.delete(`${r.recordId}|${cfg.attachment}`)
  }
  refresh()
}

watch(() => currentTemplate.value, refresh, { deep: true, immediate: true })
watch(() => [ds.records, ds.selectedRecordIds], refresh, { deep: true })
// v-html 每次重渲染都会重建 DOM，error 监听必须在渲染后重新绑
watch(html, async () => {
  await nextTick()
  bindAttachErrors()
})

const pageScale = ref(0.55)
function updateScale() {
  pageScale.value = Math.max(0.35, Math.min(1, (window.innerWidth - 40) / previewDim.value.w))
}
onMounted(() => {
  updateScale()
  window.addEventListener('resize', updateScale)
})
onUnmounted(() => window.removeEventListener('resize', updateScale))

async function doPrint() {
  if (!selected.value.length || printing.value) return
  printing.value = true
  try {
    const t = currentTemplate.value
    const ids = selected.value.map((r) => r.recordId)
    // 重读选中的那几条记录，拿到同步任务刚写入的新直链。
    // 只能用 ensureRecords(force)，绝不能调 loadRecords()——后者只保留当前视图内的记录，
    // 会把视图外 / 已被移出视图的已选记录静默踢掉，表现为「点了打印没反应」。
    const { missing } = await ensureRecords(ids, { force: true })
    if (missing.length) {
      ds.selectedRecordIds = ds.selectedRecordIds.filter((id) => !missing.includes(id))
    }
    // 附件地址缓存是派生的，重读后必须清掉，否则 enrichApprovalAttachments 命中旧死链直接跳过
    const attachField = t?.expense?.attachment
    if (attachField) {
      for (const id of ids) attachCache.delete(`${id}|${attachField}`)
    }
    await refresh()
    await waitImagesReady()
    ensurePageCss()
    window.print()
  } finally {
    printing.value = false
  }
}

// 等附件图真正解码完成再打印，避免打出半张 / 空白
function waitImagesReady(timeout = 10000) {
  return new Promise((resolve) => {
    const imgs = Array.from(document.querySelectorAll('.print-shell img[data-attach]'))
    if (!imgs.length) {
      setTimeout(resolve, 150)
      return
    }
    let done = 0
    const tick = () => {
      if (++done >= imgs.length) resolve()
    }
    imgs.forEach((img) => {
      if (img.complete) tick()
      else {
        img.onload = tick
        img.onerror = tick
      }
    })
    setTimeout(resolve, timeout)
  })
}

// 图片加载失败时给可见提示，而不是打出一片空白让人猜原因
function bindAttachErrors() {
  const imgs = document.querySelectorAll('.print-shell img[data-attach]')
  imgs.forEach((img) => {
    const fail = () => {
      const fig = img.closest('figure') || img.parentElement
      if (!fig || fig.dataset.failed) return
      fig.dataset.failed = '1'
      fig.classList.add('attach-failed')
      const tip = document.createElement('div')
      tip.className = 'attach-fail-tip'
      tip.textContent =
        '票据无法显示：可能是链接已过期，或该票据是 PDF/OFD 等非图片格式。可点右上角「刷新」重新读取表格后再试；若仍空白，请到多维表格查看原票据文件。'
      fig.appendChild(tip)
    }
    if (img.complete && img.naturalWidth === 0) fail()
    else img.addEventListener('error', fail, { once: true })
  })
}

function ensurePageCss() {
  let el = document.getElementById('pp-page-size')
  if (!el) {
    el = document.createElement('style')
    el.id = 'pp-page-size'
    document.head.appendChild(el)
  }
  el.textContent =
    currentTemplate.value?.paper === 'a5'
      ? '@page { size: 210mm 148mm; margin: 0; }'
      : '@page { size: A4; margin: 0; }'
}

function openPrintWindow() {
  if (!selected.value.length) return
  const w = window.open('', '_blank')
  if (!w) {
    alert('浏览器拦截了弹窗，请允许本页面弹出窗口后重试')
    return
  }
  const title = `${currentTemplate.value?.name || '排版打印'} · 构建 ${BUILD_STAMP}`
  const pageCss =
    currentTemplate.value?.paper === 'a5'
      ? '<style>@page { size: 210mm 148mm; margin: 0; }</style>'
      : ''
  w.document.write(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style>${pageCss}</head><body>${html.value}</body></html>`
  )
  w.document.close()
  w.focus()
  waitImagesThenPrint(w)
}

function waitImagesThenPrint(w) {
  const tryPrint = () => {
    try {
      w.print()
    } catch (e) {
      /* ignore */
    }
  }
  const imgs = Array.from(w.document.images || [])
  if (!imgs.length) {
    setTimeout(tryPrint, 200)
    return
  }
  let done = 0
  const onDone = () => {
    done++
    if (done >= imgs.length) tryPrint()
  }
  imgs.forEach((img) => {
    if (img.complete) onDone()
    else {
      img.onload = onDone
      img.onerror = onDone
    }
  })
  setTimeout(tryPrint, 8000) // 兜底：最多等 8 秒
}

function exportCsv() {
  if (!selected.value.length) return
  const t = currentTemplate.value
  const tableBlock = t?.blocks.find((b) => b.type === 'table')
  const cols =
    tableBlock?.columns?.length
      ? tableBlock.columns
      : ds.fields.map((f) => ({ label: f.name, fieldId: f.id }))
  const lines = [cols.map((c) => escCsv(c.label)).join(',')]
  for (const r of selected.value) {
    lines.push(cols.map((c) => escCsv(r.fields[c.fieldId] ?? '')).join(','))
  }
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  download(blob, `${t?.name || '导出'}-${ds.tableName || '数据'}.csv`)
}

function exportDocx() {
  if (!selected.value.length) return
  const t = currentTemplate.value
  const body = html.value.replace(/<img[^>]*>/g, '')
  const doc = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${t?.name || '排版打印'}</title></head><body>${body}</body></html>`
  const blob = new Blob(['\ufeff', doc], { type: 'application/msword' })
  download(blob, `${t?.name || '导出'}.doc`)
}
</script>

<template>
  <section class="panel">
    <div class="panel-title">预览与打印</div>
    <div class="preview-toolbar">
      <span class="muted">
        模板：{{ currentTemplate?.name }} · 已选 {{ selected.length }} 条记录 · 构建 {{ BUILD_STAMP }}
      </span>
      <div class="btn-row">
        <button class="btn btn-primary" :disabled="!selected.length || printing" @click="doPrint()">
          打印 / 存为 PDF
        </button>
        <button class="btn" :disabled="!selected.length" @click="openPrintWindow()">
          新窗口打印
        </button>
        <button class="btn" :disabled="!selected.length" @click="exportCsv()">导出 CSV</button>
        <button class="btn" :disabled="!selected.length" @click="exportDocx()">导出 Word</button>
        <button
          v-if="currentTemplate?.kind === 'expense' && currentTemplate?.expense?.attachment"
          class="btn"
          :disabled="!selected.length"
          @click="retryAttachments()"
        >
          重试拉取票据
        </button>
      </div>
    </div>

    <div v-if="!selected.length" class="notice">
      还没有选择记录，请到“选记录”页勾选要打印的记录。
    </div>

    <div v-else class="print-pane">
      <div
        class="print-scale"
        :style="{ width: previewDim.w * pageScale + 'px', height: previewDim.h * pageScale + 'px' }"
      >
        <div
          class="print-shell"
          :style="{ width: previewDim.w + 'px', transform: 'scale(' + pageScale + ')', transformOrigin: 'top left' }"
          v-html="html"
        ></div>
      </div>
    </div>
  </section>
</template>
