import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 构建时间标记（北京时间 月-日 时:分），用于确认插件页面加载的是哪一版
const buildStamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ')

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp)
  },
  server: {
    host: true,
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
