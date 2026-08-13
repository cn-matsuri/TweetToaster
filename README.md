# TweetToaster 烤推机

把公开的 X/Twitter 推文做成带中文翻译和翻译组 Logo 的 640px PNG。这个版本重写了 2019 年的 Selenium + Celery 实现：网页和 Bot 共享同一套卡片渲染器，不再依赖 X 的页面 DOM，也不需要购买 X API。

## 能做什么

- 接受 `x.com`、`twitter.com`、`mobile.twitter.com` 的推文永久链接
- 展示目标推文及数据源返回的同作者线程上下文
- 为每条推文选择是否出图、填写独立翻译
- 内置三种旧版 Logo，支持上传自定义 Logo
- 支持自定义 `{T}` HTML 翻译模板（会过滤脚本和危险属性）
- 浏览器下载 2x PNG
- 兼容旧 Bot 的 `/api/auto` + `/api/get_task=<id>` 异步协议
- 支持用环境变量切换到自建 FxEmbed 实例

## 本地运行

需要 Node.js 22+ 和 Chrome/Chromium。

```bash
corepack enable
pnpm install
pnpm test
pnpm start
```

打开 <http://localhost:8082>。macOS 会自动查找 Chrome；Linux/Docker 默认使用 Chromium。也可以显式设置：

```bash
CHROMIUM_PATH=/path/to/chromium PORT=8082 pnpm start
```

## Docker 部署

```bash
docker compose up --build -d
curl http://127.0.0.1:8082/api/health
```

在 Nginx/Caddy/Cloudflare Tunnel 中把域名反代到 `127.0.0.1:8082` 即可。`compose.yaml` 默认只监听本机，避免绕过反向代理直接暴露端口。

### 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `8082` | HTTP 端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `CHROMIUM_PATH` | 自动发现 | Bot 截图使用的 Chromium |
| `TWEET_PROVIDER_URL` | `https://api.fxtwitter.com/2/status` | 免费推文数据源；可指向自建 FxEmbed |
| `TWEET_PROVIDER_TIMEOUT_MS` | `15000` | 数据源超时毫秒数 |
| `TEMPLATE_ALLOWED_HOSTS` | `tweet.wudifeixue.com,raw.githubusercontent.com` | 允许 Bot 服务端下载模板的域名白名单，逗号分隔 |

## Bot API 兼容

创建任务：

```http
POST /api/auto
Content-Type: application/json

{
  "tweet": "https://x.com/user/status/123",
  "translate": "翻译文字",
  "template": "https://tweet.wudifeixue.com/template/matsuri.txt",
  "noLikes": false,
  "logo": "official"
}
```

返回 `200 {"task_id":"..."}`。轮询 `GET /api/get_task=<task_id>`。成功时 `state` 为 `SUCCESS`，`result` 是文件名；图片仍位于 `/cache/<result>.png`。

多条翻译沿用旧格式：

```text
##1
第一条翻译
##2
第二条翻译
```

`template` 可留空、直接传模板 HTML、传 `/template/name.txt` 本地路径，或传 HTTPS 模板地址。远程模板限制为 64 KB，且拒绝内网地址。

旧模板仍可挂载在原路径。把 [toastTemplates](https://github.com/cn-matsuri/toastTemplates) 的内容放到 `Matsuri_translation/frontend/template/`（该目录已被 Git 忽略），原来的 `/template/*.txt` Bot 参数和 `?template=/template/*.txt` 网页链接就会继续工作。模板文件中的多样式注释格式也继续支持；默认使用第一种样式，多推文 Bot 翻译会沿用旧行为对非目标推文使用第二种样式。

## 数据源与费用

默认使用免费的 FxTwitter/FxEmbed 公共 API，不需要密钥或付费 X API。公共服务可能调整限流或可用性；长期部署建议自行托管 FxEmbed，再修改 `TWEET_PROVIDER_URL`，本项目无需改代码。

## 测试

```bash
pnpm test
```

单元测试覆盖 URL 兼容、数据归一化、HTTP API 与旧 Bot 任务协议。PR 合并前还应执行真实公开推文的集成测试和浏览器视觉检查。

## 致谢

项目最初由夏色祭工坊社区共同完成，感谢 [FzXiao](https://github.com/fzxiao233)、[飞雪](https://github.com/wudifeixue)、[鱼鱼](https://github.com/yuyuyzl) 以及历年来的所有贡献者。新版的免费公开推文数据能力由 [FxEmbed/FxTwitter](https://github.com/FxEmbed/FxEmbed) 提供。
