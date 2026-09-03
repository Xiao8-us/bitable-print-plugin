<script setup>
import { onMounted, ref } from 'vue'
import { connect, ds, loadRecords } from './bitable.js'
import { exportTemplates, importTemplates, loadTemplates } from './store.js'
import TemplateEditor from './components/TemplateEditor.vue'
import RecordPicker from './components/RecordPicker.vue'
import PrintPreview from './components/PrintPreview.vue'

const tabs = [
  { id: 'editor', label: '编辑模板' },
  { id: 'records', label: '选记录' },
  { id: 'preview', label: '预览打印' }
]
const activeTab = ref('editor')
const importInput = ref(null)
const toasting = ref('')

onMounted(async () => {
  await connect()
  loadTemplates()
  await loadRecords()
})

async function refresh() {
  await connect()
  loadTemplates()
  await loadRecords()
}

function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      importTemplates(String(reader.result))
      toast('模板导入成功')
    } catch (err) {
      toast(err.message || '导入失败', 'error')
    }
    e.target.value = ''
  }
  reader.readAsText(file)
}

let toastTimer
function toast(msg, type = 'ok') {
  toasting.value = { msg, type }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toasting.value = ''), 2500)
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <span class="brand-dot">排</span>
        <div>
          <div class="brand-title">排版打印</div>
          <div class="brand-sub">
            <span :class="['status-dot', ds.connected ? 'on' : 'off']"></span>
            {{ ds.connected ? '已连接' : '演示模式' }} · {{ ds.tableName }}
          </div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost btn-sm" title="重新连接当前表格" @click="refresh">刷新</button>
        <button class="btn btn-ghost btn-sm" @click="exportTemplates()">导出模板</button>
        <button class="btn btn-ghost btn-sm" @click="importInput && importInput.click()">导入模板</button>
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json"
          style="display: none"
          @change="onImport"
        />
      </div>
    </header>

    <div v-if="ds.loading" class="loading-bar">
      <div class="loading-inner" :style="{ width: ds.progress ? '60%' : '30%' }"></div>
      <span v-if="ds.progress">已加载 {{ ds.progress }} 条记录…</span>
      <span v-else>连接多维表格…</span>
    </div>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
        <span v-if="t.id === 'records'" class="tab-count">{{ ds.selectedRecordIds.length }}</span>
      </button>
    </nav>

    <main class="main">
      <div v-if="ds.error" class="notice notice-warn">
        {{ ds.error }}
        <button class="btn btn-ghost btn-sm" @click="ds.error = ''">知道了</button>
      </div>

      <TemplateEditor v-show="activeTab === 'editor'" />
      <RecordPicker v-show="activeTab === 'records'" />
      <PrintPreview v-show="activeTab === 'preview'" />
    </main>

    <div v-if="toasting" :class="['toast', toasting.type === 'error' ? 'toast-error' : '']">
      {{ toasting.msg }}
    </div>
  </div>
</template>
