<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { attachCache, ds, prepareAttachmentsFor } from '../bitable.js'
import { currentTemplate } from '../store.js'
import {
  collectAttachmentBlocks,
  enrichApprovalAttachments,
  extractSerial,
  renderAll
} from '../render.js'
import { download, escCsv, PRINT_CSS } from '../utils.js'

const selected = computed(() =>
  ds.records.filter((r) => ds.selectedRecordIds.includes(r.recordId))
)
const html = ref('')
let refreshing = false
let refreshPending = false
const previewDim = computed(() =>
  currentTemplate.value?.paper === 'a5' ? { w: 794, h: 559 } : { w: 794, h: 1123 }
)

async function refresh() {
  if (refreshing) {
    refreshPending = true
    return
  }
  refreshing = true
  try {
    do {
      refreshPending = false
      const t = currentTemplate.value
      const recs = selected.value
      if (!t) {
        html.value = ''
        return
      }
      html.value = renderAll(t, recs)
      updateScale()
      await enrichApprovalAttachments(t, recs)
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
    } while (refreshPending)
  } finally {
    refreshing = false
  }
}

function ensureExpenseAttachMsg(t, recs) {
  if (!t || t.kind !== 'expense' || !t.expense?.attachment) return
  const cfg = t.expense
  for (const r of recs) {
    const entry = attachCache.get(`${r.recordId}|${cfg.attachment}`)
    if (!entry || entry.urls?.length) continue
    if (!entry.msg) {
      if (!cfg.approvalUrl) entry.msg = '未填写「票据接口地址」（映射面板里填）'
      else if (!extractSerial(r.fields?.[cfg.serialField]))
        entry.msg = '该记录缺少「申请编号」，无法取审批票据'
      else entry.msg = '票据图片拉取失败，请点「重试拉取」'
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

const pageScale = ref(0.55)
function updateScale() {
  pageScale.value = Math.max(0.35, Math.min(1, (window.innerWidth - 40) / previewDim.value.w))
}
onMounted(() => {
  updateScale()
  window.addEventListener('resize', updateScale)
})
onUnmounted(() => window.removeEventListener('resize', updateScale))

function doPrint() {
  if (!selected.value.length) return
  ensurePageCss()
  waitAppImages(() => window.print())
}

function waitAppImages(cb) {
  const imgs = Array.from(document.querySelectorAll('.print-shell img'))
  if (!imgs.length) {
    setTimeout(cb, 150)
    return
  }
  let done = 0
  const onDone = () => {
    done++
    if (done >= imgs.length) cb()
  }
  imgs.forEach((img) => {
    if (img.complete) onDone()
    else {
      img.onload = onDone
      img.onerror = onDone
    }
  })
  setTimeout(cb, 8000)
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
  const title = currentTemplate.value?.name || '排版打印'
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
        模板：{{ currentTemplate?.name }} · 已选 {{ selected.length }} 条记录
      </span>
      <div class="btn-row">
        <button class="btn btn-primary" :disabled="!selected.length" @click="doPrint()">
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
