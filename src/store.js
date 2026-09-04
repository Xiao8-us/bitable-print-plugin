import { computed, reactive, watch } from 'vue'
import { FieldType } from '@lark-base-open/js-sdk'
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

const norm = (s) => String(s || '').toLowerCase().trim()

export function matchField(aliases, excludeIds = [], types = null) {
  const lows = aliases.map(norm).filter(Boolean)
  return ds.fields.find(
    (f) =>
      (!types || types.includes(f.type)) &&
      !excludeIds.includes(f.id) &&
      lows.some((a) => {
        const n = norm(f.name)
        return n.includes(a) || a.includes(n)
      })
  )
}

export function looksLikeExpense() {
  const names = ds.fields.map((f) => norm(f.name))
  const key = norm(ds.tableName)
  if (/(报销|expense)/.test(key)) return true
  const has = (...als) => als.some((a) => names.some((n) => n.includes(a)))
  return (has('报销') || has('事由')) && (has('金额') || has('费用'))
}

export function expenseTemplate() {
  const used = []
  const pick = (aliases) => {
    const f = matchField(aliases, used)
    if (!f) return null
    used.push(f.id)
    return f
  }
  const uppercase = pick(['金额大写', '大写金额'])
  const company = pick(['报销单位', '单位名称', '单位', '公司'])
  const date = pick(['报销日期', '报销时间', '日期'])
  const code = pick(['单据编号', '编号', '单号', '流水号', '申请编号'])
  const serialF = matchField(['申请编号', '审批编号', '单据编号', '编号'], used)
  const item = pick(['报销事由', '费用明细', '明细', '报销内容', '用途', '事由', '费用说明', '说明', '摘要'])
  const amount = pick(['报销金额', '金额', '费用汇总', '汇总金额', '总额', '合计'])
  const att =
    matchField(['附件', '票据', '凭证', '图片', '上传', '发票'], used, [FieldType.Attachment]) ||
    pick(['附件', '票据', '凭证', '图片', '上传', '发票'])

  const t = {
    id: uid(),
    name: '费用报销单模板',
    kind: 'expense',
    paper: 'a5',
    pageBreak: 'perRecord',
    title: '费用报销单',
    subtitle: '',
    logoUrl: '',
    blocks: [],
    footer: '',
    expense: {
      company: company?.id || '',
      date: date?.id || '',
      code: code?.id || '',
      serialField: serialF?.id || code?.id || '',
      approvalUrl: '',
      item: item?.id || '',
      amount: amount?.id || '',
      uppercase: uppercase?.id || '',
      attachment: att?.id || '',
      emptyRows: 3,
      autoRows: true
    }
  }
  return t
}

function isUntouchedDefault(t) {
  return (
    t.name === '出库单模板' &&
    Array.isArray(t.blocks) &&
    t.blocks.length === 4 &&
    t.blocks.every(
      (b) =>
        (b.type === 'meta' && !(b.rows || []).length) ||
        (b.type === 'table' && !(b.columns || []).length) ||
        (b.type === 'text' && b.text === '备注：') ||
        b.type === 'sign'
    )
  )
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
      store.templates = [looksLikeExpense() ? expenseTemplate() : deliveryOrderTemplate()]
    }
  } catch (e) {
    store.templates = [looksLikeExpense() ? expenseTemplate() : deliveryOrderTemplate()]
  }
  // 之前自动生成的空“出库单模板”出现在报销表里时，自动升级为报销单
  if (looksLikeExpense() && store.templates.length === 1 && isUntouchedDefault(store.templates[0])) {
    store.templates = [expenseTemplate()]
  }
  if (!store.templates.some((t) => t.id === store.currentTemplateId)) {
    store.currentTemplateId = store.templates[0].id
  }
  saveTemplates()
}

function deliveryOrderTemplate() {
  const t = defaultTemplate('出库单模板')
  t.title = '出库单'
  return t
}

export function addExpenseTemplate() {
  const t = expenseTemplate()
  store.templates.push(t)
  store.currentTemplateId = t.id
  return t
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
    sign: { label: '签名区', lines: 2 },
    attachments: {
      label: '附件',
      fieldId:
        ds.fields.find((f) => f.type === FieldType.Attachment)?.id || ds.fields[0]?.id || '',
      perRow: 2
    }
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
