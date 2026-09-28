# 生产环境待办（暂缓执行）

目标：将 OpenCalendar 改造版从“可打开的预览”推进到“可接受真实预约”。本文件只记录待填写的配置项和验收事项；**不要把密码、连接串、API Key 或 OAuth Secret 写进 Git 仓库**。敏感值应填在对应服务的 Secret / Environment Variables 设置中。

当前基线（2026-09-27）：PR #2 仍为 draft；Next.js 预览部署已能打开首页和后台登录页，但尚未配置新版数据库、Google OAuth 和定时任务，也未验证真实预约。生产站仍运行旧代码。

## 1. 先决定部署边界

- [ ] 确定正式站域名：`<production-domain>`。
- [ ] 决定为新版创建独立 Vercel Project，或在现有 Project 的 Production 环境切换；在完成端到端验收前，不将 draft PR 提升到生产。
- [ ] 为新版准备独立 Postgres 数据库，不在旧站数据库上直接运行新版 Prisma 迁移。
- [ ] 明确数据迁移范围：旧预约、客户资料、日历事件是否需要迁入；确定备份与回退方案。

## 2. 必填值与放置位置

| 配置项 | 待填写的值 / 来源 | 放置位置 | 完成 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `<新版 Postgres 的运行时连接串，优先使用连接池>` | Vercel Environment Variables（Secret） | [ ] |
| `DIRECT_URL` | `<同一数据库的迁移专用直连或 session pooler 连接串>` | Vercel Environment Variables（Secret） | [ ] |
| `ADMIN_EMAIL` | `<网站主人用于连接 Google 的邮箱>` | Vercel Environment Variables | [ ] |
| `ADMIN_PASSWORD` | `<新生成的强密码>` | Vercel Environment Variables（Secret） | [ ] |
| `GOOGLE_CLIENT_ID` | `<Google Cloud OAuth Web Client ID>` | Vercel Environment Variables | [ ] |
| `GOOGLE_CLIENT_SECRET` | `<同一 OAuth Client 的 Secret>` | Vercel Environment Variables（Secret） | [ ] |
| `GOOGLE_REDIRECT_URI` | `https://<production-domain>/api/google/callback` | Google Cloud 允许的重定向 URI + Vercel Environment Variables | [ ] |
| `NEXT_PUBLIC_APP_URL` | `https://<production-domain>` | Vercel Environment Variables | [ ] |
| `CRON_SECRET` | `<新生成的定时任务共享密钥>` | Vercel Environment Variables（Secret）和 GitHub Actions Secret，值一致 | [ ] |
| `BOOKKIT_URL` | `https://<production-domain>` | GitHub Actions Repository Variable | [ ] |

Google Cloud 还需启用 Calendar API，配置 OAuth consent screen，并将正式站回调地址加入 OAuth Client。通过部署后的 `/admin/settings` 完成 Google Calendar 连接与冲突日历、目标日历选择。

## 3. 按功能启用的可选值

- [ ] **令牌静态加密（建议）**：`TOKEN_ENCRYPTION_KEY`（新生成的 Secret）；设置后确认已有 Google 连接令牌的迁移或重连方式。
- [ ] **系统邮件**：`RESEND_API_KEY`（Secret）、`RESEND_FROM`（已验证发件地址）；验证确认、取消、改期和提醒邮件。未启用时，不能依赖应用自身发这些邮件。
- [ ] **收费预约**：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（均为 Secret），以及需要站内卡片表单时的 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`；先用 Stripe 测试模式验证付款、取消和退款，再决定正式收款。
- [ ] **故障通知**：`ALERT_EMAIL`，按需设置 `ALERT_WEBHOOK_URL`（Secret）；验证日历断连和失败任务告警。
- [ ] **对外集成**：需要 REST API 时在后台生成 API Key；需要出站 Webhook 时设置目标与签名密钥。密钥只在服务端保管，不写入本文件。
- [ ] **演示模式**：真实站确认未设置 `BOOKKIT_DEMO_MODE=1` 或 `BOOKKIT_CALENDAR=memory`。

## 4. 部署和验收

- [ ] 在新版数据库运行 `npm run db:deploy`；运行 `npm run setup` 或等效初始化，创建第一个 Host、Schedule、Brand 和可预约的 Event Type。
- [ ] Vercel Framework Preset 保持 `Next.js`；部署产物应包含页面和 API 函数，不能仅凭 Ready 状态判断可用。
- [ ] Vercel Hobby 不支持每 10 分钟的 Cron。待工作流进入默认分支后，配置上述 `BOOKKIT_URL` / `CRON_SECRET`，验证 GitHub Actions 定时调用 `/api/cron/tick`。
- [ ] 检查 `/api/health` 返回 200，数据库、Google Calendar、Cron、任务队列等关键检查均为正常。
- [ ] 用测试身份完整走通：查看可用时间 → 免费预约 → Google 日历事件和邀请 → 改期 → 取消；检查时区和移动端。
- [ ] 若启用收费，走通 Stripe 测试付款、Webhook、退款和失败重试；之后再开启真实付款。
- [ ] 验证面试主持人确认流程和滑雪课定价/优惠规则达到产品要求后，再考虑替换旧生产站。
- [ ] 记录切换日期、备份位置和回退步骤；切换后监控健康检查与失败任务。

参考：`.env.example`、`README.md`、`docs/RELIABILITY.md`、PR #2。
