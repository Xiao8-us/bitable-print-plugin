import { attachCache, ds } from '../src/bitable.js'
import { renderAll } from '../src/render.js'

ds.fields = [
  { id: 'a', name: '订单号', type: 1, isPrimary: true },
  { id: 'b', name: '客户', type: 1, isPrimary: false },
  { id: 'c', name: '金额', type: 99003, isPrimary: false }
]
ds.records = [
  { recordId: 'r1', fields: { a: 'SO-001', b: '岛链传媒', c: '¥1,280.00' } },
  { recordId: 'r2', fields: { a: 'SO-002', b: '星空传媒', c: '¥3,650.00' } }
]

const t = {
  name: '出库单',
  pageBreak: 'perRecord',
  title: '出库单',
  subtitle: '测试',
  logoUrl: '',
  footer: '第 {{page}} 页 / 共 {{pages}} 页',
  blocks: [
    { id: 'b1', type: 'meta', label: '单据信息', rows: [{ label: '单号', fieldId: 'a' }, { label: '客户', fieldId: 'b' }] },
    { id: 'b2', type: 'table', label: '明细', columns: [{ label: '单号', fieldId: 'a' }, { label: '金额', fieldId: 'c' }] },
    { id: 'b3', type: 'text', label: '备注', text: '客户：{{客户}}，请尽快发货' },
    { id: 'b4', type: 'sign', label: '签收', lines: 2 }
  ]
}

const html = renderAll(t, ds.records)
const checks = [
  ['每记录一页 -> 2 个 page', (html.match(/class="page"/g) || []).length === 2],
  ['第二页内容存在', html.includes('SO-002')],
  ['字段变量已替换', html.includes('客户：岛链传媒')],
  ['页码正确', html.includes('第 2 页 / 共 2 页')],
  ['HTML 转义', !renderAll(t, [{ recordId: 'x', fields: { a: '<b>', b: 'a"b', c: '1' } }]).includes('<b>')]
]

const t2 = JSON.parse(JSON.stringify(t))
t2.pageBreak = 'continuous'
const html2 = renderAll(t2, ds.records)
checks.push(['汇总列表 -> 2 行数据', (html2.match(/<tr>/g) || []).length === 3])

const t3 = JSON.parse(JSON.stringify(t))
t3.blocks = [
  {
    id: 'f1',
    type: 'meta',
    label: '基本信息',
    bordered: true,
    rows: [
      { label: '报销人', fieldId: 'b' },
      { label: '金额', fieldId: 'c' }
    ]
  },
  { id: 'f2', type: 'text', label: '报销事由', text: '{{客户}} 的 {{订单号}}', bordered: true },
  { id: 'f3', type: 'sign', label: '审批签字', lines: 2, columns: ['报销人', '负责人', '财务', '总经理'] }
]
const html3 = renderAll(t3, ds.records)
checks.push(['表格形式信息区', html3.includes('class="form-table"')])
checks.push(['四栏签字表', html3.includes('sign-grid') && html3.includes('总经理')])
checks.push(['带边框事由', html3.includes('form-content-cell')])

const t4 = JSON.parse(JSON.stringify(t3))
t4.blocks[0].cols = 3
t4.blocks[0].valueAlign = 'center'
t4.blocks.push({ id: 'at1', type: 'attachments', label: '附件票据', fieldId: 'a', perRow: 2 })
attachCache.set('r1|a', { urls: ['https://example.com/receipt1.png', 'https://example.com/receipt2.jpg'], nonImages: 0 })
const html4 = renderAll(t4, ds.records)
checks.push(['每行3字段', html4.includes('form-cols-3')])
checks.push(['附件图片渲染', html4.includes('receipt1.png') && html4.includes('attach-grid')])

let failed = false
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
