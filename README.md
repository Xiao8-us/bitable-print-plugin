# 排版打印 - 飞书多维表格自建插件

仿照多维表格官方“排版打印 DocuGenius”做的一个自建侧边栏插件：

- 多套模板管理（新建 / 复制 / 重命名 / 删除 / 导出导入 JSON）
- 简易模板编辑器：字段点击插入、字段拖入单据区/明细表、文本/表格/签名区等区块自由编排
- 两种打印模式：**一单一页**（每张记录一页，适合出库单/送货单/工单）、**汇总列表**（明细表列出所有记录）
- 记录选择：调用飞书自带记录选择弹窗、全选当前视图、搜索勾选
- 输出：浏览器打印 / 存为 PDF / 导出 CSV / 导出 Word
- 模板按“多维表格”分别保存，换表自动切换各自的模板集

## 技术栈

- Vue 3 + Vite
- `@lark-base-open/js-sdk`（飞书多维表格扩展脚本官方 SDK）
- 无后端，纯静态页面；插件本质是嵌入多维表格侧边栏的 iframe 网页

## 本地开发

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 即可看到**演示模式**（内置示例订单数据，可完整体验编辑/选记录/预览/打印）。真实连接多维表格时，插件会通过 SDK 读取当前表格的字段和记录。

## 已部署站点（GitHub Pages）

- 正式地址：https://xiao8-us.github.io/bitable-print-plugin/
- 代码仓库：https://github.com/Xiao8-us/bitable-print-plugin
- 修改代码后 `git push`，GitHub Actions 自动构建发布，1~2 分钟生效

## 接入飞书多维表格

插件需要一个**可访问的 HTTPS 网址**（localhost 除外）。

### 方式一：本地开发 + 内网穿透（临时测试）

```bash
# 终端 1：启动本地服务
npm run dev

# 终端 2：cloudflared 临时隧道（免费，无需注册）
cloudflared tunnel --url http://localhost:5173
```

把输出的 `https://xxx.trycloudflare.com` 填入飞书。

### 方式二：正式部署（推荐）

```bash
npm run build
```

把 `dist/` 目录部署到任意静态托管：

- GitHub Pages / Vercel / Netlify
- 公司 Nginx / 对象存储 CDN

部署后得到正式 https 地址，填入飞书即可。

### 在飞书里添加插件

1. 打开目标多维表格
2. 右上角「插件」→「自定义插件」
3. 「＋ 新增插件」，填入上面的 URL，确定
4. 插件加载后，右上角提示「已连接」即成功；如果显示「演示模式」，说明 URL 无法访问或不在飞书环境中

## 使用流程

1. **编辑模板**：点字段插入到文本，或拖到「单据信息 / 明细表」；设置标题、纸张、打印模式
2. **选记录**：在表格中选择（弹窗）/ 全选当前视图 / 搜索勾选
3. **预览打印**：预览效果 → 打印 / 存为 PDF / 导出 CSV / 导出 Word

## 测试

```bash
node scripts/smoke.mjs
```

## 目录

```text
src/
  bitable.js        飞书 SDK 封装 + 演示数据（浏览器预览模式）
  store.js          模板模型 / 增删改 / localStorage 持久化 / 导入导出
  render.js         模板渲染引擎（字段变量替换、两种打印模式）
  App.vue           外壳：连接状态、标签页
  components/
    TemplateEditor.vue   模板编辑器 + 实时预览
    RecordPicker.vue     记录选择
    PrintPreview.vue     预览打印 / 导出
```
