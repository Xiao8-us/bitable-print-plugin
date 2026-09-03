<script setup>
import { computed, ref } from 'vue'
import { ds, pickRecordsByDialog, selectVisibleRecords } from '../bitable.js'

const search = ref('')
const showAll = ref(false)
const RENDER_CAP = 500

const primaryField = computed(() => ds.fields.find((f) => f.isPrimary) || ds.fields[0])
const secondaryFields = computed(() => ds.fields.filter((f) => !f.isPrimary).slice(0, 3))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = ds.records
  if (q) {
    list = list.filter((r) =>
      Object.values(r.fields).some((v) => String(v ?? '').toLowerCase().includes(q))
    )
  } else if (!showAll.value) {
    list = list.slice(0, RENDER_CAP)
  }
  return list
})

function isSelected(id) {
  return ds.selectedRecordIds.includes(id)
}

function toggle(id) {
  const i = ds.selectedRecordIds.indexOf(id)
  if (i >= 0) ds.selectedRecordIds.splice(i, 1)
  else ds.selectedRecordIds.push(id)
}

function selectAll() {
  const ids = new Set(ds.selectedRecordIds)
  for (const r of filtered.value) ids.add(r.recordId)
  ds.selectedRecordIds = [...ids]
}

function clearAll() {
  ds.selectedRecordIds = []
}
</script>

<template>
  <section class="panel">
    <div class="panel-title">
      选择要打印的记录
      <span class="muted">（已选 {{ ds.selectedRecordIds.length }} 条）</span>
    </div>

    <div class="btn-row wrap">
      <button class="btn btn-primary" :disabled="!ds.connected" @click="pickRecordsByDialog()">
        在表格中选择…
      </button>
      <button class="btn" :disabled="!ds.connected || !ds.viewId" @click="selectVisibleRecords()">
        全选当前视图
      </button>
      <button class="btn" @click="selectAll()">全选列表</button>
      <button class="btn btn-danger" @click="clearAll()">清空</button>
    </div>

    <div v-if="!ds.connected" class="hint">
      当前是演示模式，下方为示例订单数据，用于预览插件效果。
    </div>

    <div class="record-toolbar">
      <input v-model="search" class="input" placeholder="搜索记录（按任意字段）" />
      <label class="check-line">
        <input v-model="showAll" type="checkbox" />
        显示全部（{{ ds.records.length }} 条）
      </label>
    </div>

    <div class="record-list">
      <button
        v-for="r in filtered"
        :key="r.recordId"
        class="record-item"
        :class="{ selected: isSelected(r.recordId) }"
        @click="toggle(r.recordId)"
      >
        <span class="record-check">{{ isSelected(r.recordId) ? '✓' : '' }}</span>
        <span class="record-main">{{ r.fields[primaryField?.id] ?? '' }}</span>
        <span class="record-sub">
          {{
            secondaryFields
              .map((f) => r.fields[f.id])
              .filter((v) => v !== '' && v != null)
              .join(' · ')
          }}
        </span>
      </button>
      <div v-if="!filtered.length" class="empty">没有匹配的记录</div>
      <div v-if="!search && !showAll && ds.records.length > RENDER_CAP" class="hint">
        列表仅显示前 {{ RENDER_CAP }} 条，可用搜索缩小范围或勾选“显示全部”。
      </div>
    </div>
  </section>
</template>
