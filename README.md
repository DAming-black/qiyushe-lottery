# 奇遇社：GitHub Pages + Supabase 版

按参考架构实现：腾讯云域名 → DNSPod → GitHub Pages 前端与 HTTPS → Supabase Auth / PostgreSQL / Edge Function → Resend 邮箱验证码邮件。

不需要单独购买虚拟机，不依赖 ChatGPT Sites；但域名、平台配额、邮件发送等仍可能产生费用。代码已准备并做本地验证，**没有实际创建/发布 GitHub 仓库、Supabase 项目或购买域名，也未完成真实手机微信验证**。免费配额不等于无费用或无网络限制，实际费用在开通前核对。

## 功能与保留范围

- 保留动漫扭蛋设计、名单勾选、名额设置、群内共用活动链接、本人选姓名揭晓、管理结果、CSV 导出、管理 JSON 备份恢复。
- 保留旧版个人邀请码接口。创建时服务端随机分配固定签位，全部抽完后中签人数等于设置人数；重复点击、换设备不重抽。
- 发起人主流程为邮箱＋密码登录，直接通过 HTTPS 调用 Supabase Auth，不发送验证码邮件。密码不写源码或浏览器本地存储，提交结束后清空输入框。后台需事先准备密码账号；不会自动把旧邮件登录账号转换为密码账号。保留旧 Sign in 邮件回调兼容。
- 群成员无需注册/登录。自选姓名不等于微信实名验证，无法防止别人代选；不读取微信群成员。
- 发起人登录只是限制创建资格；管理活动仍需原有管理链接/JSON 备份，“我的活动”仍基于本地浏览器保存的入口，不自动跨设备同步。
- 参考图中 XP BOT 的反馈管理和密码找回不是本抽签业务。本版采用无密码验证码登录，不包含无关的反馈模块或密码找回页。

## 分工

| 部分 | 文件/服务 |
|---|---|
| 静态 UI | `site/index.html` |
| 公开配置 | `site/config.js`：仅项目 URL 与 publishable key |
| 登录与云 API | `site/cloud.js`：邮箱验证码、会话刷新、Edge 调用 |
| 数据库 | `supabase/migrations/202611120001_lottery.sql` |
| 后台 | `supabase/functions/lottery/`：CORS、用户验证、RPC 请求 |
| 自动发布 | `.github/workflows/pages.yml`：只发布 `site/` |
| 数据权限 | 私有 schema + RLS + 服务角色限定 RPC；客户端不能读签位或改结果 |
| 邮件 | Resend → Supabase SMTP，不在网页内调用 Resend |

## 现在需要准备

1. GitHub 账号及你拥有的空仓库，例如 `qiyushe-lottery`。
2. Supabase 账号及新项目。后台配置只在控制台或安全授权工具中填写，勿把密码、service_role、secret key 发进聊天或提交仓库。
3. 自有域名及 DNSPod 管理权。不要使用参考图里的域名，它不属于本项目。
4. Resend 账号及经过验证的发信域名。注册和收费开通由用户本人完成。

详细顺序见 [部署指南](部署指南.md)。在域名购买前，先通过 GitHub Pages 默认地址检查前端和 Supabase 的网络可达性。购买域名不会改变这两项服务的实际托管位置。

## 测试

前端和 Edge 处理测试无需安装依赖：

```bash
npm test
```

PostgreSQL 测试需另外安装的测试用 PGlite，**它不是部署依赖**：

```powershell
$env:PGLITE_TEST_MODULE='临时测试目录\node_modules\@electric-sql\pglite\dist\index.js'
npm run test:postgres
```

已验证真实 PostgreSQL SQL 的权限、名额、签位隐藏、重复抽签与活动隔离；运行于 WASM 单进程，不能代替真实 Supabase 多连接压力测试。UI 交互使用 DOM 模型，不能代替真实浏览器视觉测试。

运行 `node scripts/check-config.mjs` 检查公开配置。出厂配置为空，该检查会**故意失败**，防止发布一个没有接后台的空壳网站。配置好自己的 Supabase 后才允许自动发布。

## 数据与密钥

本包无真实用户、名单、数据库、登录会话、证书私钥和云平台密钥。管理员服务密钥仅从 Edge 环境读取。仅公开 publishable key 可放在网页；它本身不授予私有数据库权限。

现有 SQLite 数据没有自动迁入 PostgreSQL。旧站管理入口/JSON 备份不能凭空恢复未迁移的活动；需要单独核对、迁移数据及管理凭证。

服务端限制每位已验证发起人一天创建 50 场活动。`CREATOR_EMAILS` 可限定允许创建的邮箱，建议正式部署时设置为实际活动管理员邮箱。活动链接会显示名单，应只向允许查看名单的群分享。

## 使用

发起人完成邮箱验证 → 设置活动和名单 → 保存管理备份 → 复制活动链接到群 → 成员选本人姓名并抽签 → 管理端刷新查看结果。共用链接没有管理密钥。

## 官方资料

- GitHub Pages 限制：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- 自定义域名：https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- HTTPS：https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- Supabase 权限：https://supabase.com/docs/guides/database/secure-data
- Supabase Auth：https://supabase.com/docs/guides/auth/auth-email-passwordless
- Edge CORS：https://supabase.com/docs/guides/functions/cors
- Resend SMTP：https://resend.com/docs/send-with-supabase-smtp
