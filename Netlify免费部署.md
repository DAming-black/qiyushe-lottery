# 免费方案：同站入口转发，保留现有数据库

## 为什么调整

旧入口在 GitHub Pages，成员浏览器还需要直接访问 `supabase.co`。部分同事能打开网页却无法读入名单。新方案让浏览器只连接自己的 Netlify 网站，Netlify 在服务端转发到现有 Supabase。数据仍存原项目，未重新分配签位、迁移数据库或更改密码。

这能去掉成员浏览器直连 Supabase 的要求，但不保证 Netlify 在每种网络或微信里都可访问。必须实际验证，不能仅凭部署成功宣布解决。

## 不购买的边界

- 只使用 Netlify Free，不购买域名、不升级计划、不启用自动充值。
- 如果注册/导入要求付款或绑卡，请停下核对，勿为了继续操作选择付费试用。
- Free 计划有月度额度和硬限制，额度耗尽时可能暂停。保持零费用意味着接受等待免费额度恢复，不自动升级。
- 价格与限额应以创建时平台实际页面为准。当前仓库代码不会调用购买、升级、付费 API。

## 一次性操作

1. 到 https://app.netlify.com/signup ，用本人的 GitHub 登录；授权仅限需要的仓库。
2. 选择 Free 计划，创建项目，选择 Import an existing project / Import from Git。
3. 选择 GitHub 仓库 `DAming-black/qiyushe-lottery`，分支 `main`。
4. 配置应自动读取根目录 `netlify.toml`：

   - Build command：`node scripts/prepare-netlify.mjs`
   - Publish directory：`netlify-dist`
   - Node.js：24

5. 不需要填任何服务密钥或管理员密码。只使用现有公开项目 URL 和 publishable key。
6. 点击免费部署，完成后以 Netlify 实际返回的 `https://…netlify.app` 为准，不自行猜一个未分配的网址。

## 工作方式与权限

- GitHub Pages 仍发布 `site/`，使用原方式；Netlify 发布 `netlify-dist/`，构建时加 `proxyBasePath: '/supabase'`。
- 网页密码登录、会话刷新、健康检查和抽签请求都使用同一网站下的 `/supabase/...`。
- Netlify 重写只有两个固定上游规则：Supabase Auth 和指定的 `quick-function`，不接收任意目标 URL。
- 转发保留浏览器原有 Origin，不额外添加或伪造第二个 Origin。部署后把实际 Netlify 来源加入 Supabase `FRONTEND_ORIGINS`，保留仍在使用的 GitHub 来源；域名末尾不带 `/`。Origin 不是认证，创建活动仍由 Supabase 验证用户令牌，管理页仍需管理凭证，结果由数据库事务固定。
- 来源白名单不能代替用户登录；前端、转发配置都没有 service_role。
- 后台仍返回 `Cache-Control: no-store`；不得为登录或抽签响应额外开启缓存。若以后改转发规则，务必重新检查方法、请求体、授权头与响应缓存。
- 用户登录密码和会话会通过 Netlify 的 HTTPS 转发到 Supabase。不要开启请求体日志、公开调试转储或将敏感数据放进 URL。

## 旧活动与登录

- 将旧链接的 `?event=活动ID` 接在新域名根路径后即可继续同一活动，不需要重建活动。
- 管理入口可将原 `#admin=...` 接到新域名根路径；这个片段只由本人保管，不能发到群。
- 管理 JSON 备份可在新站“我的活动”恢复。浏览器本地记录不会自动跨域同步。
- 新站需用现有邮箱＋密码重新登录。不要重新创建原邮箱用户，不用接收邮件。
- 目前保留旧邮件回调兼容；若仍要用邮件链接，则需要把新域名加入 Supabase Auth Site URL / Redirect URLs。密码登录本身不依赖这项回跳配置。

## 必须验证

1. 新站首页、配置及脚本均返回 200。
2. 浏览器网络请求只指向新站 `/supabase/`，不从成员手机直连 Supabase。
3. 新站“检查后台连接”返回 ready。
4. 使用现有测试活动，未登录的另一台设备可以读出名单。测试时不要代替真实成员点击抽签；实际抽取由本人操作。
5. 发起人本人验证密码登录、创建虚拟活动、查看管理结果。
6. 同事分别使用自己的 Wi-Fi、手机流量和真实微信打开新活动链接。通过后再正式发群。

## 当前验证范围

本地测试包含 UI 构建、同站请求、请求头和密码 POST 转发、会话保留、路径限制。它是按文档实现的本地模拟，不能代替实际 Netlify 部署和真实网络验证。

官方文档：

- https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
