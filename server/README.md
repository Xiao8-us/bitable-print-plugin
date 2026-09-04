# 审批票据直链小后端（Vercel）

用途：排版打印插件在浏览器里无法直接放应用密钥调审批接口。这个小后端（仓库根目录 `api/approval-attachments.js`）负责
“按申请编号找到审批实例 → 取回票据附件直链”，插件再把这些直链图片印到报销单上。

## 部署步骤

1. 注册/登录 https://vercel.com （可用 GitHub 账号一键导入）
2. 导入本仓库 `Xiao8-us/bitable-print-plugin`，Vercel 会自动识别根目录 `api/` 为云函数
3. 在 Vercel 项目 Settings → Environment Variables 添加：
   - `FEISHU_APP_ID`：审批表所在租户的自建应用 App ID
   - `FEISHU_APP_SECRET`：对应 App Secret
   - `APPROVAL_DEFINITIONS`（可选）：审批定义 Code，逗号分隔（默认含“费用报销2026/费用报销”）
4. 重新部署后得到域名，例如 `https://xxx.vercel.app`
5. 测试：
   `https://xxx.vercel.app/api/approval-attachments?serial=202609030001&date=20260903`
   返回 `{"ok":true,"urls":[...]}` 即成功

## 应用侧还需要

- 在飞书开发者后台给该应用开通审批权限范围（机器人身份）：
  `approval:approval:readonly`、`approval:approval`、`approval:instance`
  可直接打开：https://open.feishu.cn/page/scope-apply?clientID=<APP_ID>&scopes=approval%3Aapproval%3Areadonly%2Capproval%3Aapproval%2Capproval%3Ainstance
- 审批管理后台中把该应用加入“费用报销2026 / 费用报销”流程的数据权限（可按需）

## 插件端填写

1. 生成“费用报销单模板”
2. 映射面板里：
   - 附件字段 → 选“附件”列
   - 审批单号字段 → 选“申请编号”列
   - 票据接口地址 → 填 `https://xxx.vercel.app/api/approval-attachments`
3. 到“预览打印”页，插件会自动拉取票据图片并印在单据上
