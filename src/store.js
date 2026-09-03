import { computed, reactive, watch } from 'vue'
import { ds } from './bitable.js'
import { download, uid } from './utils.js'

export function defaultTemplate(name = '未命名模板') {
  return {
    id: uid(),
    name,
    paper: 'a4',
    pageBreak: 'perRecord',
    title: '单据标题',
    subtitle: '',
    logoUrl: '',
    blocks: [
      { id: uid(), type: 'meta', label: '单据信息', rows: [] },
      { id: uid(), type: 'table', label: '明细', columns: [] },
      { id: uid(), type: 'text', label: '备注', text: '备注：' },
      { id: uid(), type: 'sign', label: '签名区', lines: 2 }
    ],
    footer: '第 {{page}} 页 / 共 {{pages}} 页'
  }
}

export const store = reactive({
  templates: [],
  currentTemplateId: ''
})

export const currentTemplate = computed(
  () => store.templates.find((t) => t.id === store.currentTemplateId) || null
)

const storageKey = () => `print-plugin-templates:${ds.tableId || 'mock'}`

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(storageKey())
    const list = raw ? JSON.parse(raw) : []
    if (Array.isArray(list) && list.length) {
      store.templates = list
    } else {
      const t = defaultTemplate('出库单模板')
      t.title = '出库单'
      store.templates = [t]
    }
  } catch (e) {
    store.templates = [defaultTemplate('出库单模板')]
  }
  if (!store.templates.some((t) => t.id === store.currentTemplateId)) {
    store.currentTemplateId = store.templates[0].id
  }
  saveTemplates()
}

export function saveTemplates() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(store.templates))
  } catch (e) {
    /* 存储不可用时忽略 */
  }
}

watch(currentTemplate, () => saveTemplates(), { deep: true })

export function createTemplate() {
  const t = defaultTemplate(`模板 ${store.templates.length + 1}`)
  store.templates.push(t)
  store.currentTemplateId = t.id
  return t
}

export function duplicateTemplate() {
  const cur = currentTemplate.value
  if (!cur) return
  const copy = JSON.parse(JSON.stringify(cur))
  copy.id = uid()
  copy.name = cur.name + ' 副本'
  store.templates.push(copy)
  store.currentTemplateId = copy.id
}

export function removeTemplate(id) {
  const i = store.templates.findIndex((t) => t.id === id)
  if (i < 0) return
  store.templates.splice(i, 1)
  if (store.currentTemplateId === id) {
    store.currentTemplateId = store.templates[0]?.id || ''
  }
}

export function addBlock(type) {
  const t = currentTemplate.value
  if (!t) return
  const presets = {
    meta: { label: '单据信息', rows: [] },
    table: { label: '明细', columns: [] },
    text: { label: '文本', text: '' },
    sign: { label: '签名区', lines: 2 }
  }
  t.blocks.push({ id: uid(), type, ...presets[type] })
}

export function removeBlock(blockId) {
  const t = currentTemplate.value
  if (!t) return
  const i = t.blocks.findIndex((b) => b.id === blockId)
  if (i >= 0) t.blocks.splice(i, 1)
}

export function moveBlock(blockId, dir) {
  const t = currentTemplate.value
  if (!t) return
  const i = t.blocks.findIndex((b) => b.id === blockId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= t.blocks.length) return
  const [b] = t.blocks.splice(i, 1)
  t.blocks.splice(j, 0, b)
}

export function addMetaRow(block, fieldId) {
  const field = ds.fields.find((f) => f.id === fieldId) || ds.fields[0]
  block.rows.push({ label: field?.name || '', fieldId: field?.id || '' })
}

export function removeMetaRow(block, index) {
  block.rows.splice(index, 1)
}

export function addTableColumn(block, fieldId) {
  const field = ds.fields.find((f) => f.id === fieldId) || ds.fields[0]
  block.columns.push({ label: field?.name || '', fieldId: field?.id || '' })
}

export function removeTableColumn(block, index) {
  block.columns.splice(index, 1)
}

export function moveTableColumn(block, index, dir) {
  const j = index + dir
  if (j < 0 || j >= block.columns.length) return
  const [c] = block.columns.splice(index, 1)
  block.columns.splice(j, 0, c)
}

export function exportTemplates() {
  const blob = new Blob([JSON.stringify(store.templates, null, 2)], {
    type: 'application/json'
  })
  download(blob, `排版打印模板-${ds.tableName || '未连接'}.json`)
}

export function importTemplates(text) {
  try {
    const list = JSON.parse(text)
    if (!Array.isArray(list)) throw new Error('格式不正确')
    store.templates = list
    if (!store.templates.some((t) => t.id === store.currentTemplateId)) {
      store.currentTemplateId = store.templates[0]?.id || ''
    }
  } catch (e) {
    throw new Error('导入失败：模板文件格式不正确')
  }
}
