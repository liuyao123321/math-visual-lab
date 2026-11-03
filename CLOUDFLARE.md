# 发布到个人 Cloudflare Workers

2026-10-28 扫描教材修复已部署，版本`a9b268f2-1e6b-4d34-a2a0-4d63bb04a0f1`。新增本机中英文OCR与同源模型资源；实际教材第21页已用同款引擎验证识别，36项相关测试、TypeScript检查和生产构建通过。公网检索页及OCR脚本/WASM/语言资源正常。没有上传用户PDF到服务器、识别整本379页或调用付费AI；尚未完成本轮真实浏览器逐按钮验收，自动化渲染与提取测试使用模拟依赖。

本入口发布当前工作区的生产构建到维护者自己的 Cloudflare 账户，保留原 Sites 项目身份和 Windows 本地启动方式。

## 首次发布

在 math-lab 目录执行：

```powershell
npx wrangler login
npx wrangler whoami
npm run deploy:cloudflare
```

登录必须由账户本人在 Cloudflare 官方网页完成。不要将账户密码、API Token 或 OAuth 回调地址粘贴到聊天或仓库。Wrangler 使用自己的认证存储；部署脚本不读取或打印凭据。

`deploy:cloudflare`先准备PDF Worker并运行原生产构建，再从生成的配置创建同目录的`dist/server/wrangler.public.json`，保留框架模块规则和静态资源路径，并设置Worker名`math-visual-lab`和`workers_dev: true`。不修改`.openai/hosting.json`，不将`.local-server`的数据库、密码文件、Python模型或浏览器学习数据作为静态资产发布。

部署成功以Wrangler返回的实际`workers.dev`地址为准。构建或部署失败会中止，不将本机预检当成已发布。

## 检查和更新

```powershell
# 构建并仅做本地部署预检，不上传
npm run deploy:cloudflare -- --dry-run

# 已经构建后，可复用当前产物；仅在确定产物属于当前版本时使用
npm run deploy:cloudflare -- --skip-build

# 后续正常更新：重新构建并部署
npm run deploy:cloudflare
```

如果账户中已经存在同名Worker，正式部署会更新它。多个Cloudflare账户时必须确认选择网站所属账户。首次部署可能要求注册账户的workers.dev子域名。免费套餐的资源限制以Cloudflare实际校验为准，未授权自动购买付费套餐。

## 当前线上范围

- 核心页面、交互绘图、离线示例、课程文本检索随应用部署。
- DeepSeek仍由每位访问者在设置中填写自己的密钥；没有新增共享付费密钥。
- 未部署独立编码服务时，RAG如实使用文本检索。保留模型与索引一致性校验；线上不得将`RAG_EMBEDDING_URL`设为维护者电脑的localhost。
- 错题、个人教材和学习记录仍在各访问者浏览器内。公网域名与localhost的存储隔离，不自动迁移。
- 首次独立发布不配置运营后台签名密钥或管理员白名单，后台保持未配置。统计、反馈需要真实D1的`DB`绑定、现有迁移及适合独立Cloudflare部署的管理员认证。不能在公开Worker上直接信任原Sites的身份请求头，详见`OPERATIONS.md`。

## 2026-10-27 准备记录

生产构建、TypeScript检查与Wrangler dry-run通过。实际上传仍需账户本人完成OAuth登录；未获得授权时不创建云端资源，不声称网站已经公开发布。

## 2026-10-28 正式发布

- 地址：https://math-visual-lab.liuyaoliuyao123321.workers.dev
- Worker：math-visual-lab；版本：18f7b15c-8263-4c76-889b-cc5a6c36e3bf。
- 修复Workers生产SSR中动画库模块初始化创建计时器的问题。`use-browser-gsap.ts`统一在浏览器effect中导入GSAP；首页、产品演示、答疑导航及模式预览均采用此入口，保留服务端HTML及动画清理。
- 生产构建、TypeScript检查通过；本机生产首页/solve/knowledge及公网对应页面HTTP200。没有配置共享DeepSeek密钥、独立编码器或运营D1；功能边界见上文。临时依赖诊断日志已移除。
