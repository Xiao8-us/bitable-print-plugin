<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ds, prepareAttachmentsFor } from '../bitable.js'
import {
  addBlock,
  addExpenseTemplate,
  addMetaRow,
  addTableColumn,
  createTemplate,
  currentTemplate,
  duplicateTemplate,
  moveBlock,
  moveTableColumn,
  removeBlock,
  removeMetaRow,
  removeTableColumn,
  removeTemplate,
  store
} from '../store.js'
import { collectAttachmentBlocks, enrichApprovalAttachments, renderAll } from '../render.js'

const showSettings = ref(false)
const focusedBlockId = ref('')
const focusedEl = ref(null)
const token = '{{' + '字段名' + '}}'

const previewRecords = computed(() => {
  const sel = ds.records.filter((r) => ds.selectedRecordIds.includes(r.recordId))
  return sel.length ? sel : ds.records.slice(0, 3)
})

const previewDim = computed(() =>
  currentTemplate.value?.paper === 'a5' ? { w: 794, h: 559 } : { w: 794, h: 1123 }
)
const previewHtml = ref('')

async function refreshPreview() {
  const t = currentTemplate.value
  const recs = previewRecords.value
  if (!t) {
    previewHtml.value = ''
    return
  }
  previewHtml.value = renderAll(t, recs)
  updateScale()
  await enrichApprovalAttachments(t, recs)
  const blocks = collectAttachmentBlocks(t)
  if (!blocks.length) return
  for (const b of blocks) {
    await prepareAttachmentsFor(b.fieldId, recs.slice(0, 8).map((r) => r.recordId))
  }
  previewHtml.value = renderAll(t, previewRecords.value)
}

watch(currentTemplate, refreshPreview, { deep: true, immediate: true })
watch(
  () => [ds.records, ds.selectedRecordIds],
  refreshPreview,
  { deep: true }
)

const pageScale = ref(0.5)
function updateScale() {
  pageScale.value = Math.max(0.3, Math.min(1, (window.innerWidth - 40) / previewDim.value.w))
}
onMounted(() => {
  updateScale()
  window.addEventListener('resize', updateScale)
})
onUnmounted(() => window.removeEventListener('resize', updateScale))

function onTextFocus(blockId, ev) {
  focusedBlockId.value = blockId
  focusedEl.value = ev.target
}

function insertVarToFocused(name) {
  const t = currentTemplate.value
  if (!t) return
  let block = t.blocks.find((b) => b.id === focusedBlockId.value && b.type === 'text')
  if (!block) block = t.blocks.find((b) => b.type === 'text')
  const varText = '{{' + name + '}}'
  if (!block) return
  const el = focusedEl.value
  if (el && block.id === focusedBlockId.value) {
    const start = el.selectionStart ?? block.text.length
    const end = el.selectionEnd ?? start
    block.text = block.text.slice(0, start) + varText + block.text.slice(end)
    nextTick(() => {
      el.focus()
      const pos = start + varText.length
      el.setSelectionRange(pos, pos)
    })
  } else {
    block.text += varText
  }
}

function onFieldDragStart(ev, field) {
  ev.dataTransfer.setData('text/plain', field.id)
  ev.dataTransfer.effectAllowed = 'copy'
}

function onDropMeta(block, ev) {
  ev.preventDefault()
  const fid = ev.dataTransfer.getData('text/plain')
  if (fid && ds.fields.some((f) => f.id === fid)) addMetaRow(block, fid)
}

function onDropTable(block, ev) {
  ev.preventDefault()
  const fid = ev.dataTransfer.getData('text/plain')
  if (fid && ds.fields.some((f) => f.id === fid)) addTableColumn(block, fid)
}

function onDropText(block, ev) {
  ev.preventDefault()
  const fid = ev.dataTransfer.getData('text/plain')
  const f = ds.fields.find((x) => x.id === fid)
  if (f) block.text += '{{' + f.name + '}}'
}

function onDropAttachments(block, ev) {
  ev.preventDefault()
  const fid = ev.dataTransfer.getData('text/plain')
  const f = ds.fields.find((x) => x.id === fid)
  if (f) block.fieldId = f.id
}

function signColsText(block) {
  return (block.columns || []).join('，')
}

function onSignCols(block, ev) {
  const arr = String(ev.target.value || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (arr.length >= 1) block.columns = arr
  else delete block.columns
}

const typeTag = { meta: '单', table: '表', text: '文', sign: '签', attachments: '附' }
</script>

<template>
  <section v-if="currentTemplate" class="editor">
    <div class="tpl-bar">
      <span class="tpl-bar-title">模板</span>
      <div class="chips scroll-x">
        <button
          v-for="t in store.templates"
          :key="t.id"
          class="chip tpl-chip"
          :class="{ active: t.id === currentTemplate.id }"
          @click="store.currentTemplateId = t.id"
        >
          {{ t.name }}
        </button>
      </div>
      <button class="btn btn-sm" title="新建模板" @click="createTemplate()">＋</button>
      <button class="btn btn-sm" title="复制当前模板" @click="duplicateTemplate()">⧉</button>
      <button class="btn btn-sm btn-primary" title="内置费用报销单模板（按字段名自动匹配）" @click="addExpenseTemplate()">报销单</button>
      <button
        class="btn btn-sm btn-danger"
        title="删除当前模板"
        @click="removeTemplate(currentTemplate.id)"
      >
        ×
      </button>
    </div>

    <div v-if="currentTemplate.kind === 'expense'" class="panel expense-map">
      <div class="panel-title">固定版式：费用报销单（A5，按样图）</div>
      <div class="form-grid">
        <label class="field">
          <span>报销单位（顶部左）</span>
          <select class="input" :value="currentTemplate.expense.company" @change="currentTemplate.expense.company = $event.target.value">
            <option value="">（留空）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>日期（顶部中）</span>
          <select class="input" :value="currentTemplate.expense.date" @change="currentTemplate.expense.date = $event.target.value">
            <option value="">（留空）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>编号（顶部右）</span>
          <select class="input" :value="currentTemplate.expense.code" @change="currentTemplate.expense.code = $event.target.value">
            <option value="">（留空）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>用途 / 报销事由（明细第一行）</span>
          <select class="input" :value="currentTemplate.expense.item" @change="currentTemplate.expense.item = $event.target.value">
            <option value="">（留空）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>金额（元）（合计/大写用）</span>
          <select class="input" :value="currentTemplate.expense.amount" @change="currentTemplate.expense.amount = $event.target.value">
            <option value="">（留空）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>金额大写（可选）</span>
          <select class="input" :value="currentTemplate.expense.uppercase" @change="currentTemplate.expense.uppercase = $event.target.value">
            <option value="">自动换算</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>附件字段（可选，打印在单据后）</span>
          <select class="input" :value="currentTemplate.expense.attachment" @change="currentTemplate.expense.attachment = $event.target.value">
            <option value="">不打印附件</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}（{{ f.typeName }}）</option>
          </select>
        </label>
        <label class="field">
          <span>审批单号字段（用于取审批票据）</span>
          <select class="input" :value="currentTemplate.expense.serialField" @change="currentTemplate.expense.serialField = $event.target.value">
            <option value="">（无）</option>
            <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>票据接口地址（部署小后端后填写）</span>
          <input v-model="currentTemplate.expense.approvalUrl" class="input" placeholder="https://你的后端域名/api/approval-attachments（留空=不自动拉取）" />
        </label>
        <label class="field">
          <span>明细空行数（供手写加行）</span>
          <select class="input" :value="Number(currentTemplate.expense.emptyRows) || 3" @change="currentTemplate.expense.emptyRows = Number($event.target.value)">
            <option :value="0">0</option>
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="4">4</option>
            <option :value="5">5</option>
          </select>
        </label>
      </div>
      <label class="check-line expense-map-toggle">
        <input v-model="currentTemplate.expense.autoRows" type="checkbox" />
        用途长内容自动分行（按换行/加号拆行，并尽量拆出每行金额）
      </label>
      <div class="hint">A5 横版（210×148mm）；盖章/签字马赛克区域按样图留空；不匹配的字段在这里改一下即可</div>
    </div>

    <div v-if="currentTemplate.kind !== 'expense'" class="field-bar">
      <span class="field-bar-title">字段（点击插入文本 / 拖入区块）</span>
      <div class="chips scroll-x">
        <span
          v-for="f in ds.fields"
          :key="f.id"
          class="chip field-chip"
          :title="f.typeName"
          draggable="true"
          @click="insertVarToFocused(f.name)"
          @dragstart="onFieldDragStart($event, f)"
        >
          {{ f.name }}
        </span>
      </div>
    </div>

    <button v-if="currentTemplate.kind !== 'expense'" class="settings-toggle" @click="showSettings = !showSettings">
      模板设置（标题 / 纸张 / 模式） {{ showSettings ? '▲' : '▼' }}
    </button>

    <div v-if="showSettings && currentTemplate.kind !== 'expense'" class="settings">
      <div class="form-grid">
        <label class="field">
          <span>模板名称</span>
          <input v-model="currentTemplate.name" class="input" />
        </label>
        <label class="field">
          <span>单据标题</span>
          <input v-model="currentTemplate.title" class="input" placeholder="如：出库单" />
        </label>
        <label class="field">
          <span>副标题</span>
          <input v-model="currentTemplate.subtitle" class="input" placeholder="如：编号随记录字段填入" />
        </label>
        <label class="field">
          <span>Logo 图片地址</span>
          <input v-model="currentTemplate.logoUrl" class="input" placeholder="https://…（可留空）" />
        </label>
        <label class="field">
          <span>纸张</span>
          <select v-model="currentTemplate.paper" class="input">
            <option value="a4">A4</option>
            <option value="a5">A5 横版</option>
          </select>
        </label>
        <label class="field">
          <span>打印模式</span>
          <select v-model="currentTemplate.pageBreak" class="input">
            <option value="perRecord">一单一页（每张记录一页）</option>
            <option value="continuous">汇总列表（明细表列出所有记录）</option>
          </select>
        </label>
        <label class="field field-wide">
          <span>页脚</span>
          <input v-model="currentTemplate.footer" class="input" />
        </label>
      </div>
    </div>

    <div v-if="currentTemplate.kind !== 'expense'" class="blocks">
      <div
        v-for="(block, i) in currentTemplate.blocks"
        :key="block.id"
        class="block-card"
        :class="'type-' + block.type"
      >
        <div class="block-head">
          <span class="block-type-tag">{{ typeTag[block.type] }}</span>
          <input v-model="block.label" class="input block-label" placeholder="区块名称" />
          <button class="icon-btn" title="上移" @click="moveBlock(block.id, -1)">↑</button>
          <button class="icon-btn" title="下移" @click="moveBlock(block.id, 1)">↓</button>
          <button class="icon-btn danger" title="删除" @click="removeBlock(block.id)">×</button>
        </div>

        <div class="block-body">
          <!-- 单据信息：一行一个字段 -->
          <template v-if="block.type === 'meta'">
            <div
              class="meta-row-edit"
              v-for="(row, ri) in block.rows"
              :key="ri"
              @dragover.prevent
              @drop.prevent="onDropMeta(block, $event)"
            >
              <input v-model="row.label" class="input" placeholder="显示名" />
              <select v-model="row.fieldId" class="input">
                <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
              <button class="icon-btn danger" @click="removeMetaRow(block, ri)">×</button>
            </div>
            <div class="add-row">
              <button class="btn btn-sm" @click="addMetaRow(block)">＋ 添加字段行</button>
              <span class="drop-hint">也可把字段拖到这里</span>
            </div>
            <label class="check-line">
              <input v-model="block.bordered" type="checkbox" />
              表格样式（带边框）
            </label>
            <div v-if="block.bordered" class="sign-edit">
              <label class="check-line">
                每行字段数
                <select
                  class="input"
                  :value="Number(block.cols) || 2"
                  @change="block.cols = Number($event.target.value)"
                >
                  <option :value="1">1 个</option>
                  <option :value="2">2 个</option>
                  <option :value="3">3 个</option>
                  <option :value="4">4 个</option>
                </select>
              </label>
              <label class="check-line">
                数值对齐
                <select
                  class="input"
                  :value="block.valueAlign || 'left'"
                  @change="block.valueAlign = $event.target.value"
                >
                  <option value="left">靠左</option>
                  <option value="center">居中</option>
                </select>
              </label>
            </div>
          </template>

          <!-- 明细表：一列一个字段 -->
          <template v-else-if="block.type === 'table'">
            <div
              class="col-row-edit"
              v-for="(col, ci) in block.columns"
              :key="ci"
              @dragover.prevent
              @drop.prevent="onDropTable(block, $event)"
            >
              <input v-model="col.label" class="input" placeholder="列名" />
              <select v-model="col.fieldId" class="input">
                <option v-for="f in ds.fields" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
              <button class="icon-btn" @click="moveTableColumn(block, ci, -1)">↑</button>
              <button class="icon-btn" @click="moveTableColumn(block, ci, 1)">↓</button>
              <button class="icon-btn danger" @click="removeTableColumn(block, ci)">×</button>
            </div>
            <div class="add-row">
              <button class="btn btn-sm" @click="addTableColumn(block)">＋ 添加列</button>
              <span class="drop-hint">也可把字段拖到这里</span>
            </div>
          </template>

          <!-- 文本：可含字段变量 -->
          <template v-else-if="block.type === 'text'">
            <textarea
              class="input textarea"
              rows="3"
              placeholder="支持换行；点击上方字段插入变量"
              :value="block.text"
              @input="block.text = $event.target.value"
              @focus="onTextFocus(block.id, $event)"
              @dragover.prevent
              @drop.prevent="onDropText(block, $event)"
            ></textarea>
            <span class="drop-hint">点击字段 = 插入 {{ token }}，打印时替换成该条记录的值</span>
            <label class="check-line">
              <input v-model="block.bordered" type="checkbox" />
              带边框（左侧显示区块名称作为行标题）
            </label>
          </template>

          <!-- 签名区 -->
          <template v-else-if="block.type === 'sign'">
            <div class="sign-edit">
              <input v-model="block.label" class="input" placeholder="签名区标题" />
              <label class="check-line">
                行数
                <select v-model.number="block.lines" class="input">
                  <option :value="1">1</option>
                  <option :value="2">2</option>
                  <option :value="3">3</option>
                  <option :value="4">4</option>
                  <option :value="5">5</option>
                </select>
              </label>
            </div>
            <div class="sign-edit">
              <input
                class="input"
                :value="signColsText(block)"
                @change="onSignCols(block, $event)"
                placeholder="签字栏：如 报销人，部门负责人，财务审核，总经理（留空=整行划线）"
              />
            </div>
            <span class="drop-hint">填多个栏名（顿号/逗号分隔）= 表格形式多栏签字，适合审批流程</span>
          </template>

          <!-- 附件 -->
          <template v-else-if="block.type === 'attachments'">
            <div class="sign-edit" @dragover.prevent @drop.prevent="onDropAttachments(block, $event)">
              <select
                class="input"
                :value="block.fieldId"
                @change="block.fieldId = $event.target.value"
              >
                <option value="" disabled>选择附件/图片字段…</option>
                <option v-for="f in ds.fields" :key="f.id" :value="f.id">
                  {{ f.name }}（{{ f.typeName }}）
                </option>
              </select>
              <label class="check-line">
                每行
                <select
                  class="input"
                  :value="Number(block.perRow) || 2"
                  @change="block.perRow = Number($event.target.value)"
                >
                  <option :value="1">1 张</option>
                  <option :value="2">2 张</option>
                  <option :value="3">3 张</option>
                  <option :value="4">4 张</option>
                </select>
              </label>
            </div>
            <span class="drop-hint">附件字段可直接拖到这里；打印时自动读取图片附件</span>
          </template>
        </div>
      </div>

      <div v-if="!currentTemplate.blocks.length" class="empty">还没有内容块，点击下方按钮添加</div>
    </div>

    <div v-if="currentTemplate.kind !== 'expense'" class="add-block-row">
      <button class="btn btn-sm" @click="addBlock('meta')">＋ 单据信息</button>
      <button class="btn btn-sm" @click="addBlock('table')">＋ 明细表</button>
      <button class="btn btn-sm" @click="addBlock('text')">＋ 文本</button>
      <button class="btn btn-sm" @click="addBlock('sign')">＋ 签名区</button>
      <button class="btn btn-sm" title="打印记录里的图片附件（选附件/图片字段）" @click="addBlock('attachments')">＋ 附件</button>
    </div>

    <details class="live-preview" open>
      <summary>实时预览（前 {{ previewRecords.length }} 条记录，打印效果请看“预览打印”页）</summary>
      <div class="preview-pane">
        <div class="preview-scale" :style="{ width: previewDim.w * pageScale + 'px', height: previewDim.h * pageScale + 'px' }">
          <div
            class="pages"
            :style="{ width: previewDim.w + 'px', transform: 'scale(' + pageScale + ')', transformOrigin: 'top left' }"
            v-html="previewHtml"
          ></div>
        </div>
      </div>
    </details>
  </section>
</template>
