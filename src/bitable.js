import { bitable, FieldType } from '@lark-base-open/js-sdk'
import { reactive } from 'vue'

export const FIELD_TYPE_NAMES = {
  [FieldType.NotSupport]: '不支持',
  [FieldType.Text]: '文本',
  [FieldType.Number]: '数字',
  [FieldType.SingleSelect]: '单选',
  [FieldType.MultiSelect]: '多选',
  [FieldType.DateTime]: '日期',
  [FieldType.Checkbox]: '勾选',
  [FieldType.User]: '人员',
  [FieldType.Phone]: '电话',
  [FieldType.Url]: '链接',
  [FieldType.Attachment]: '附件',
  [FieldType.SingleLink]: '关联',
  [FieldType.Lookup]: '查找',
  [FieldType.Formula]: '公式',
  [FieldType.DuplexLink]: '双向关联',
  [FieldType.Location]: '位置',
  [FieldType.GroupChat]: '群组',
  [FieldType.Object]: '对象',
  [FieldType.Denied]: '无权限',
  [FieldType.CreatedTime]: '创建时间',
  [FieldType.ModifiedTime]: '修改时间',
  [FieldType.CreatedUser]: '创建人',
  [FieldType.ModifiedUser]: '修改人',
  [FieldType.AutoNumber]: '自动编号',
  [FieldType.Barcode]: '条码',
  [FieldType.Progress]: '进度',
  [FieldType.Currency]: '货币',
  [FieldType.Rating]: '评分',
  [FieldType.Email]: '邮箱'
}

export const ds = reactive({
  connected: false,
  table: null,
  tableId: '',
  tableName: '',
  viewId: '',
  fields: [],
  records: [],
  selectedRecordIds: [],
  loading: false,
  progress: 0,
  error: ''
})

let token = 0

const MOCK_FIELDS = [
  { id: 'fld_order_no', name: '订单号', type: FieldType.Text, isPrimary: true, typeName: '文本' },
  { id: 'fld_customer', name: '客户名称', type: FieldType.Text, isPrimary: false, typeName: '文本' },
  { id: 'fld_date', name: '下单日期', type: FieldType.DateTime, isPrimary: false, typeName: '日期' },
  { id: 'fld_amount', name: '订单金额', type: FieldType.Currency, isPrimary: false, typeName: '货币' },
  { id: 'fld_status', name: '订单状态', type: FieldType.SingleSelect, isPrimary: false, typeName: '单选' },
  { id: 'fld_phone', name: '联系电话', type: FieldType.Phone, isPrimary: false, typeName: '电话' },
  { id: 'fld_items', name: '商品明细', type: FieldType.Text, isPrimary: false, typeName: '文本' },
  { id: 'fld_remark', name: '备注', type: FieldType.Text, isPrimary: false, typeName: '文本' }
]

const MOCK_RECORDS = [
  {
    recordId: 'rec_demo_1',
    fields: {
      fld_order_no: 'SO-20260828-001',
      fld_customer: '岛链传媒',
      fld_date: '2026-08-28 10:32',
      fld_amount: '¥1,280.00',
      fld_status: '已发货',
      fld_phone: '13800001234',
      fld_items: '帆布袋 x 20\n台历 x 10\n贴纸 x 50',
      fld_remark: '顺丰加急，客户要求周五前送达'
    }
  },
  {
    recordId: 'rec_demo_2',
    fields: {
      fld_order_no: 'SO-20260828-002',
      fld_customer: '星空传媒',
      fld_date: '2026-08-28 14:05',
      fld_amount: '¥3,650.00',
      fld_status: '待发货',
      fld_phone: '13900005678',
      fld_items: '文化衫 x 50\n帽子 x 20',
      fld_remark: '夏季款'
    }
  },
  {
    recordId: 'rec_demo_3',
    fields: {
      fld_order_no: 'SO-20260829-003',
      fld_customer: '云山科技',
      fld_date: '2026-08-29 09:18',
      fld_amount: '¥860.00',
      fld_status: '待付款',
      fld_phone: '13700009012',
      fld_items: '鼠标垫 x 30',
      fld_remark: ''
    }
  }
]

function loadMock() {
  ds.table = null
  ds.tableId = 'mock'
  ds.tableName = '演示数据（订单表）'
  ds.viewId = ''
  ds.fields = MOCK_FIELDS
  ds.records = MOCK_RECORDS
  ds.selectedRecordIds = []
}

export function formatCellValue(fid, v) {
  const meta = ds.fields.find((f) => f.id === fid)
  const t = meta?.type
  if (v == null || v === '') return ''
  switch (t) {
    case FieldType.DateTime:
      return typeof v === 'number' ? new Date(v).toLocaleString('zh-CN') : String(v)
    case FieldType.Checkbox:
      return v ? '是' : ''
    case FieldType.SingleSelect:
      return v?.text ?? String(v)
    case FieldType.MultiSelect:
      return Array.isArray(v) ? v.map((x) => x?.text ?? x).join('、') : String(v)
    case FieldType.User:
    case FieldType.CreatedUser:
    case FieldType.ModifiedUser:
    case FieldType.GroupChat:
      return Array.isArray(v) ? v.map((x) => x?.name ?? x).join('、') : String(v)
    case FieldType.Attachment:
      return Array.isArray(v) ? v.map((x) => x?.name ?? x).join('、') : String(v)
    case FieldType.Location:
      return v?.location?.address ?? String(v)
    case FieldType.Object:
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
    default:
      return String(v)
  }
}

export async function connect() {
  const my = ++token
  ds.loading = true
  ds.error = ''
  try {
    await Promise.race([
      initReal(my),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ])
  } catch (e) {
    if (my !== token) return
    ds.connected = false
    loadMock()
    ds.error = '未检测到多维表格环境，已载入演示数据（浏览器预览模式）'
  } finally {
    if (my === token) ds.loading = false
  }
}

async function initReal(my) {
  const table = await bitable.base.getActiveTable()
  if (my !== token) return
  const meta = await table.getMeta()
  if (my !== token) return
  let viewId = ''
  try {
    const sel = await bitable.base.getSelection()
    viewId = sel?.viewId || ''
  } catch (e) {
    /* ignore */
  }
  if (my !== token) return
  const fields = await table.getFieldMetaList()
  if (my !== token) return
  ds.table = table
  ds.tableId = meta.id
  ds.tableName = meta.name
  ds.viewId = viewId
  ds.fields = fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    isPrimary: !!f.isPrimary,
    typeName: FIELD_TYPE_NAMES[f.type] || '其它'
  }))
  ds.connected = true
  ds.error = ''
}

export async function loadRecords() {
  if (!ds.connected || !ds.table) return
  const my = ++token
  ds.loading = true
  ds.progress = 0
  try {
    const all = []
    let pageToken
    let hasMore = true
    while (hasMore && my === token) {
      const res = await ds.table.getRecordsByPage({
        pageSize: 200,
        pageToken: pageToken || undefined,
        viewId: ds.viewId || undefined,
        stringValue: true
      })
      all.push(...(res.records || []))
      hasMore = !!res.hasMore
      pageToken = res.pageToken
      ds.progress = all.length
      if (all.length >= 20000) break
    }
    if (my === token) {
      ds.records = all
      ds.progress = 0
      const valid = ds.selectedRecordIds.filter((id) => all.some((r) => r.recordId === id))
      if (valid.length !== ds.selectedRecordIds.length) ds.selectedRecordIds = valid
    }
  } catch (e) {
    if (my === token) ds.error = '读取记录失败：' + (e?.message || e)
  } finally {
    if (my === token) ds.loading = false
  }
}

export async function ensureRecords(ids) {
  if (!ds.connected || !ds.table) return
  const have = new Set(ds.records.map((r) => r.recordId))
  for (const id of ids) {
    if (have.has(id)) continue
    try {
      const val = await ds.table.getRecordById(id)
      const fields = {}
      for (const [fid, v] of Object.entries(val.fields || {})) {
        fields[fid] = formatCellValue(fid, v)
      }
      ds.records.push({ recordId: id, fields })
      have.add(id)
    } catch (e) {
      /* 单条失败不阻断整体 */
    }
  }
}

export async function pickRecordsByDialog() {
  if (!ds.connected) return
  try {
    const sel = await bitable.base.getSelection().catch(() => null)
    const ids = await bitable.ui.selectRecordIdList(
      sel?.tableId || ds.tableId,
      sel?.viewId || ds.viewId
    )
    if (Array.isArray(ids)) {
      ds.selectedRecordIds = [...new Set(ids.filter(Boolean))]
      await ensureRecords(ds.selectedRecordIds)
    }
  } catch (e) {
    ds.error = '选择记录失败：' + (e?.message || e)
  }
}

export async function selectVisibleRecords() {
  if (!ds.connected || !ds.table) return
  try {
    const view = await ds.table.getViewById(ds.viewId)
    const ids = await view.getVisibleRecordIdList()
    ds.selectedRecordIds = [...new Set(ids.filter(Boolean))]
    await ensureRecords(ds.selectedRecordIds)
  } catch (e) {
    ds.error = '读取当前视图记录失败：' + (e?.message || e)
  }
}
