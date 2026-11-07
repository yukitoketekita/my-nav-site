# Yukifly 导航 · 2.0

面向个人使用的轻量导航站。原生 JavaScript、本地 CSS、Cloudflare Pages Functions 和原有 D1 数据库，没有运行时前端依赖。

## 这次重构

- 桌面分类侧栏、手机横向分类和双列卡片，支持搜索和浅色/深色主题。
- 管理员输入密码后，直接在卡片上编辑名称、网址、描述和图标；保存成功后重新读取数据并立即渲染，保持登录即可看到结果。
- 链接图标可填 HTTPS 地址、站内路径或上传图片；站点 favicon 在“站点设置”内修改。
- 上传 PNG、JPEG、WebP、GIF、ICO，浏览器转为最大 256×256 的 PNG；最大输入文件 5 MB，最终图片不超过 128 KB。GIF 取静态帧，不接受 SVG 文件上传。HTTPS SVG 图片地址仍可使用。
- 分类新增、改名、排序；有链接的分类不能删除。可导出链接、分类和设置的 JSON 备份。
- 后端验证每个写入请求。密码只存在 Cloudflare Secret，服务端会话使用 HttpOnly / Secure / SameSite=Strict Cookie，有效期 8 小时。服务端校验 Origin 和 CSRF Token，同一 IP 在每个 15 分钟窗口最多尝试 5 次登录。
- API 和动态 favicon 不缓存；站点内容以文本节点渲染，拒绝脚本协议链接，不加载第三方脚本或旧版追踪脚本。

## 已上线项目的升级步骤

当前代码基于仓库 main 的 82a96cbf245887af956a3486c9bbb3aeaa3a19d0。先在预览环境验证，再合并到生产分支。

1. 在 Cloudflare 导出现有 D1 数据库 SQL 备份，并保存目前的生产部署版本。页面内 JSON 备份是额外便利功能，不能替代完整数据库备份。
2. 继续使用原 Pages 项目和原 D1 数据库，绑定名必须为 **DB**。不要新建数据库来替换已有数据库。
3. 在现有 D1 控制台执行 migrations/0002_auth.sql 的全部内容：仅新增 nav_sessions、nav_login_attempts 及索引，不删除、不重写原表。代码发布前即可先执行。
4. 检查 categories 表含 displayOrder 列（原版 README 已要求添加）。可执行 PRAGMA table_info(categories); 查看；仅在确实不存在此列时执行 ALTER TABLE categories ADD COLUMN displayOrder INTEGER;。不要重复添加。
5. 在 Pages 生产环境添加 Secret **ADMIN_PASSWORD**，使用至少 16 位的随机强密码。示例值和旧的默认密码不可用。请在 Cloudflare 自己填写，不要将密码提交到仓库。修改密码会使已有会话失效。
6. Pages 保持 Git 集成，项目根目录是仓库根目录，框架选 None，构建命令留空，输出目录 public。Functions 在根目录 functions 下，由 Pages 自动编译。不要仅通过控制台拖拽 public 静态文件上传，否则不会部署后端。
7. 本项目将旧的 wrangler.jsonc 替换为 **wrangler.local.jsonc**，避免新配置文件意外接管或覆盖你的生产 D1 绑定。生产配置继续以现有 Cloudflare 控制台为准。不要把本地配置重命名为 wrangler.jsonc 后部署，也不要把本地的全零 database_id 用于生产。
8. 预览环境绑定独立测试 D1 并执行两份 SQL，设置独立的管理 Secret。不要将演示或测试写入指向生产数据库。
9. 合并并完成生产部署后检查：首页数据完整；错误密码拒绝；登录后改链接和图标立即更新；站点 favicon 上传可保存；刷新仍保持登录；退出后管理接口返回 401。
10. 在 Pages 设置的“常规问题 → 预览访问”启用“限制预览”。核对自动创建的 Access 应用仅允许你的账户邮箱，并保护 *.项目名.pages.dev。历史部署 URL 会继续运行旧版代码；必须实测旧 URL 的 API 已转到 Access 登录，避免旧的未鉴权接口仍能写原 D1。自定义正式域名继续正常访问。

原表 settings、categories、sites 的字段、ID、链接和分类关系保持兼容。保留 sidebar / topbar 类型，新界面将两类统一放在分类导航中。未知设置不会被覆盖，公开设置接口只返回显示需要的四个字段。原 GIF 文件保持原名和原字节，已有背景路径仍能使用；它约 20 MB，若继续使用仍会产生相应加载开销。背景以低透明度显示，清空背景设置可恢复纯色布局。

如果你另有未提交到仓库的静态图标或背景文件，更新代码时也要保留它们。

## 管理方式

点击“管理导航”（手机顶部“管理”）→ 输入密码 → 卡片“编辑链接与图标”。顶部工具条可添加链接、管理分类、打开站点设置和备份。站点设置可更改名称、说明、浏览器标签页 favicon 和背景。

图标地址留空时，浏览器尝试通过 Google favicon 服务按网站域名获取图标；无法访问时显示名称首字。希望不使用该服务时，为每个网站上传图标或指定自有图片地址。上传图片以 data URL 保存于原来的 sites.icon 或 settings.faviconUrl，不引入 R2 依赖，也不提供任意文件托管。

API 返回数据不缓存；保存后会重新读取并渲染列表，而不是等退出登录才重画。站点 favicon 通过 /favicon 动态读取，保存后为当前页面更新带版本参数的图标地址。外部图片服务器或其他已打开标签页仍可能使用自身缓存；上传图片可避免依赖外部服务器。

## 本地开发

需要 Node.js >= 22.13（测试使用内置 node:sqlite），安装依赖后运行：

~~~text
npm install
~~~

将 .dev.vars.example 复制为 .dev.vars，把占位值替换为本地随机测试密码，然后：

~~~text
npm run db:local
npm run dev
~~~

这些命令使用 wrangler.local.jsonc 和本地 SQLite，不操作远程数据库。不在源码里保存真实生产密码。

~~~text
npm test
~~~

tests/api.test.mjs 使用真实 SQLite 和 D1 接口适配层，检查鉴权、CSRF、限流、即时读取、favicon、数据库兼容性等。测试不连接生产数据库。Cloudflare 运行时仍需用 Wrangler 或 Pages 预览部署做最终验证。

## 文件说明

- public/index.html：页面结构；public/styles.css：响应式主题；public/app.js：页面交互和管理表单。
- functions/api/[[catchall]].js：只读接口、管理会话和需要授权的增删改。
- functions/favicon.js：读取设置并返回站点图标。
- migrations/0001_base.sql：全新部署的基础表；migrations/0002_auth.sql：现有部署所需的增量管理表。
- public/_headers：静态资源安全策略；API 自己设置响应头，不能只依赖 _headers。

## 验证与限制

本次本地使用 SQLite 适配层验证 API，并通过真实浏览器检查桌面、390px 和 320px 窄屏、登录、编辑、搜索、图片上传及 favicon 更新。预览中的网站为隔离测试数据，不会写入线上数据库，也不会作为初始内容发布。

这不是对任意威胁的绝对安全保证。管理密码应保持高强度；可按需要在 Cloudflare 增加针对 /api/auth/login 的 WAF 规则。当前版本为单管理员设计，未实现多用户权限、编辑冲突合并和 JSON 导入。

2026-11-07 已在现有 Cloudflare Pages 项目编译并部署到 https://pages.yukifly.com/。原 D1 的 14 个分类、50 条链接和原有设置已完成备份恢复测试与上线后的逐字段核对。服务端管理密钥已配置；未登录写入返回 401，跨站写入返回 403。实际生产密码由站点所有者保管，生产环境的成功登录和授权编辑未由自动化读取密码验证。

历史部署已通过 Cloudflare Access 限制到账户所有者邮箱；旧 API 的读取和空提交请求均被重定向到 Access 登录页，正式域名仍可正常访问。其他环境部署时也必须配置并验证这项保护。

## 参考文档

- [Pages D1 绑定](https://developers.cloudflare.com/pages/functions/bindings/)
- [Pages 配置与 source of truth](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Pages 安全响应头](https://developers.cloudflare.com/pages/configuration/headers/)
