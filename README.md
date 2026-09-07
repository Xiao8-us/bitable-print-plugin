# 排版打印 - 飞书多维表格自建插件

基于多维表格数据生成 A5 横版“费用报销单”（含审批栏、金额大写、签字栏），
并把审批票据图片自动打印到附件页。

## 使用中的架构（正式链路）

```text
GitHub Actions（定时同步，每小时）
  └─ 读取报销表「申请编号 / 附件」→ 调飞书审批接口 → 票据直链写入「票据直链」字段

飞书多维表格插件（GitHub Pages 托管）
  └─ 读取「票据直链」字段 → 打印时显示票据图片
```

- 插件只读表格字段，不依赖任何第三方接口
- 票据直链每小时自动刷新，多人打印无压力

## 本地开发

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 为演示模式（示例数据）。

## 定时同步配置

工作流：`.github/workflows/sync-approval-links.yml`

需要的 GitHub Secrets（仓库 Settings → Secrets and variables → Actions）：

| 名称 | 说明 |
| --- | --- |
| `FEISHU_APP_ID` | 飞书自建应用 App ID |
| `FEISHU_APP_SECRET` | 应用 App Secret |
| `BASE_TOKEN` | 报销表多维表格 app token |
| `TABLE_ID` | 报销表数据表 id |
| `APPROVAL_DEFINITIONS` | 审批定义 code（多个用英文逗号分隔） |

手动触发：Actions → Sync Approval Attachments → Run workflow。

## 插件接入飞书

1. `npm run build`，把 `dist/` 部署到静态托管（当前为 GitHub Pages）
2. 多维表格「插件 → 自定义插件」填入页面地址
3. 模板映射中确认「票据直链字段」指向表格的「票据直链」列

## 测试

```bash
node scripts/smoke.mjs
```
