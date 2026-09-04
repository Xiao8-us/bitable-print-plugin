import { attachCache, ds } from '../src/bitable.js'
import { amountUpperCn, renderAll } from '../src/render.js'
import { expenseTemplate } from '../src/store.js'

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

const upperChecks = [
  ['500', '伍佰元整'],
  ['500.00', '伍佰元整'],
  ['100000', '壹拾万元整'],
  ['1000001', '壹佰万零壹元整'],
  ['1280.50', '壹仟贰佰捌拾元伍角'],
  ['0.05', '零元伍分']
]
for (const [inp, want] of upperChecks) {
  checks.push([`大写金额 ${inp}`, amountUpperCn(inp) === want])
}

ds.tableName = '费用报销单'
ds.fields = [
  { id: 'c1', name: '报销单位', type: 1 },
  { id: 'c2', name: '报销日期', type: 5 },
  { id: 'c3', name: '单据编号', type: 1 },
  { id: 'c4', name: '报销事由', type: 1 },
  { id: 'c5', name: '报销金额', type: 99003 }
]
const et = expenseTemplate()
const ehtml = renderAll(et, [
  {
    recordId: 'e1',
    fields: {
      c1: '岛链传媒',
      c2: '2026-05-26 10:00',
      c3: '202605260003',
      c4: '5/25 日本直邮报白 300 元',
      c5: '300.00'
    }
  }
])
checks.push(['报销单固定版式(A5)', ehtml.includes('page-a5') && ehtml.includes('费用报销单')])
checks.push(['元信息映射', ehtml.includes('报销单位：岛链传媒') && ehtml.includes('编号：202605260003')])
checks.push(['日期格式 yyyy/mm/dd', ehtml.includes('2026/05/26')])
checks.push(['审批两栏上下堆叠', ehtml.includes('approve-head') && ehtml.indexOf('部门主管意见') < ehtml.indexOf('领导审批')])
checks.push(['领导审批栏', ehtml.includes('领导审批')])
checks.push(['金额大写行', ehtml.includes('叁佰元整')])
checks.push(['合计行', ehtml.includes('合　计')])
checks.push(['三栏签字', ehtml.includes('领款人') && ehtml.includes('出纳') && ehtml.includes('复核')])

const et2 = expenseTemplate()
const ehtml2 = renderAll(et2, [
  {
    recordId: 'e2',
    fields: {
      c1: '岛链传媒',
      c2: '2026-05-26',
      c3: '',
      c4: '5/25 日本直邮报白300元+5/25 购买算力充值200元',
      c5: ''
    }
  }
])
checks.push(['长明细自动分行2行', (ehtml2.match(/exp-data/g) || []).length === 2])
checks.push(['每行金额拆出', ehtml2.includes('300.00') && ehtml2.includes('200.00')])
checks.push(['自动合计并转大写', ehtml2.includes('伍佰元整') && ehtml2.includes('500.00')])

// 通用模板 A5
const tA5 = JSON.parse(JSON.stringify(t))
tA5.paper = 'a5'
checks.push(['通用模板选A5生效', renderAll(tA5, ds.records).includes('page-a5')])

// 附件：审批网页链接 → 文字条目；图片直链 → 从左到右排列图片
const attachBlock = { id: 'ax', type: 'attachments', label: '附件', fieldId: 'x', perRow: 2 }
const recA = {
  recordId: 'ra',
  fields: { x: '[2 个附件](https://www.feishu.cn/approval/admin/previewAttachment?key=ABC)' }
}
const htmlA = renderAll({ ...tA5, blocks: [attachBlock] }, [recA])
checks.push(['审批网页附件显示条目', htmlA.includes('attach-link') && htmlA.includes('previewAttachment')])
const recB = {
  recordId: 'rb',
  fields: { x: 'https://cdn.example.com/r1.png\nhttps://cdn.example.com/r2.jpg' }
}
const htmlB = renderAll({ ...tA5, blocks: [attachBlock] }, [recB])
checks.push(['图片直链多张横排', (htmlB.match(/<img /g) || []).length === 2 && htmlB.includes('r1.png') && htmlB.includes('r2.jpg')])

let failed = false
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)
