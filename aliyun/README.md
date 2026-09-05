# 阿里云函数计算部署（无服务器）

一个函数同时提供：

- 插件页面（dist 静态文件）
- 票据接口 `/api/approval-attachments`

## 准备

1. 阿里云账号（函数计算 FC，按量付费；月费基本只有几元到十几元）
2. **一个已备案的域名**，并已解析到阿里云（大陆访问必需）
3. 本地先执行 `npm run build` 生成 `dist/`

## 打包

把以下内容打成 zip（保持相对结构）：

```text
index.js          ← aliyun/index.js 复制到根目录
api/approval-attachments.js
dist/...          ← 构建产物
```

## 创建函数

1. 函数计算 FC → 创建函数 → **使用自定义运行时（Node.js 18/20）**，上传上面的 zip
2. 环境变量：
   - `FEISHU_APP_ID=cli_aaf44bb3b4b81be5`
   - `FEISHU_APP_SECRET=<应用Secret>`
3. 函数配置：内存 512MB，超时 **120 秒**
4. 配置**自定义域名**（https），路径 `/` 指向该函数；域名需要已备案

## 验证

浏览器打开：

```text
https://你的域名/api/approval-attachments?serial=202609030001&date=20260903
```

返回 `{"ok":true,"urls":[...]}` 即成功。

## 接入飞书

- 插件自定义插件地址：`https://你的域名/`
- 模板映射里「票据接口地址」：`https://你的域名/api/approval-attachments`

## 网络要求

- 函数计算默认可访问公网 → 能访问 `open.feishu.cn` ✅
- 飞书客户端需要能访问：你的域名 + 飞书域名（图片域名）
