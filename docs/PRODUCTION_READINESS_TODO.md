# 部署配置与上线待办

目标：将 OpenCalendar 改造版从“可打开的预览”推进到“可接受真实预约”。本文件记录已配置项、待填写值和验收事项；**不要把密码、连接串、API Key 或 OAuth Secret 写进 Git 仓库**。敏感值应填在对应服务的 Secret / Environment Variables 设置中。

当前状态（2026-10-01）：新项目 Production 已从 `codex/production-readiness-notes` 的 `92c7cb3` 构建成功，`/u/hao` 返回 200，Neon Production 数据库可达。Production 的 `/api/health` 仍返回 503：Google Calendar 未连接、系统邮件未配置、定时任务未运行，因此真实预约仍关闭。`main` 与旧站项目未改动。小改动先推 `codex/opencalendar-preview` 验证，验收后再合入生产分支。

| 环境 | Vercel 项目 / 域名 | Neon 分支 | 本地文件 |
| --- | --- | --- | --- |
| Production | `open_calendar` (`prj_brA3nNywRJhWBMaGuCCkrSEE9ciR`), `https://opencalendar-two.vercel.app` | `production` (`br-aged-field-b55ebft4`) | `.env.production.local` |
| Preview | `https://opencalendar-git-codex-opencalenda-2f5f56-haoliangpaos-projects.vercel.app`（`codex/opencalendar-preview`） | `preview-codex` (`br-divine-base-b5r87sdn`) | `.env.local` |

Neon Project ID：`mute-firefly-92263942`。两份本地环境文件均为 Git 忽略文件，权限 `0600`；生产和预览使用不同的数据库连接与管理员密码。勿将文件内容提交或粘贴到工单。

## 1. 先决定部署边界

- [x] 开发阶段 Production 域名：`https://opencalendar-two.vercel.app`；正式公开前仍需确定自有域名。
- [x] 为新版使用独立 Vercel Project `open_calendar`；在完成端到端验收前，不将 draft PR 提升到生产。
- [x] 使用独立 Neon Project，并将 Production 和 Preview 放在不同分支；未在旧站数据库运行新版 Prisma 迁移。
- [ ] 明确数据迁移范围：旧预约、客户资料、日历事件是否需要迁入；确定备份与回退方案。

## 2. 必填值与放置位置

| 配置项 | 待填写的值 / 来源 | 放置位置 | 完成 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `<新版 Postgres 的运行时连接串，优先使用连接池>` | Vercel Environment Variables（Secret） | [x] Production + Preview（分别使用池化连接） |
| `DIRECT_URL` | `<同一数据库的迁移专用直连或 session pooler 连接串>` | Vercel Environment Variables（Secret） | [x] Production + Preview（分别使用直连） |
| `ADMIN_EMAIL` | `<网站主人用于连接 Google 的邮箱>` | Vercel Environment Variables | [x] 两环境 |
| `HOST_TIMEZONE` | `<预约日程时区，如 America/Toronto>` | Vercel Environment Variables / 初始化脚本 | [x] 两环境；America/Toronto |
| `HOST_DISPLAY_NAME` | `<品牌页与邀请显示的主人姓名>` | Vercel Environment Variables / 初始化脚本 | [ ] |
| `LEGACY_CURRENCY` | `<确认旧站 $ 实际代表的三位币种，默认 usd>` | Vercel Environment Variables / 初始化脚本 | [ ] |
| `ADMIN_PASSWORD` | `<新生成的强密码>` | Vercel Environment Variables（Secret） | [x] 两环境，各自独立 |
| `GOOGLE_CLIENT_ID` | `<Google Cloud OAuth Web Client ID>` | Vercel Environment Variables | [ ] |
| `GOOGLE_CLIENT_SECRET` | `<同一 OAuth Client 的 Secret>` | Vercel Environment Variables（Secret） | [ ] |
| `GOOGLE_REDIRECT_URI` | `https://<production-domain>/api/google/callback` | Google Cloud 允许的重定向 URI + Vercel Environment Variables | [ ] Vercel 两环境已填；Google Cloud 客户端待添加 URI |
| `NEXT_PUBLIC_APP_URL` | `https://<production-domain>` | Vercel Environment Variables | [x] 两环境使用各自固定域名 |
| `CRON_SECRET` | `<新生成的定时任务共享密钥>` | Vercel Environment Variables（Secret）和 GitHub Actions Secret，值一致 | [ ] Vercel 两环境已填；GitHub Actions Secret 待配置 |
| `BOOKKIT_URL` | `https://<production-domain>` | GitHub Actions Repository Variable | [ ] |

## Google Cloud OAuth 客户端

选择 **Web application**。截图里的两个空白 URI 行会触发校验；填写以下地址（或删除不需要的空行）。这个项目通过 Next.js 服务端执行 OAuth，回调必须与 `GOOGLE_REDIRECT_URI` **完全一致**。使用稳定的 Vercel 项目 / 分支域名，不用每次部署都变化的部署 ID 域名。

| 环境 | Authorized JavaScript origin | Authorized redirect URI |
| --- | --- | --- |
| Production | `https://opencalendar-two.vercel.app` | `https://opencalendar-two.vercel.app/api/google/callback` |
| Preview | `https://opencalendar-git-codex-opencalenda-2f5f56-haoliangpaos-projects.vercel.app` | `https://opencalendar-git-codex-opencalenda-2f5f56-haoliangpaos-projects.vercel.app/api/google/callback` |

- [ ] 创建 OAuth Web Client，将 Client ID / Secret 分别写入两份本地环境文件与新 Vercel 项目的 Production / Preview 变量。Secret 必须使用 Secret 类型。
- [ ] 启用 Google Calendar API；在 Audience 测试状态时，将 `<admin-email>` 加为测试用户；配置 Data Access 所需 Calendar scopes。
- [ ] 新配置部署后，从新站 `/admin/settings` 连接 Google Calendar，并验证实际回调及日历事件创建。建议在普通浏览器完成 Google 授权。
- [ ] 正式公开使用前，换用自己控制的域名，更新 Google Cloud、Vercel 和 OAuth 同意屏幕的域名及政策页面，再考虑 Google 验证。

## 3. 按功能启用的可选值

- [x] **令牌静态加密**：两环境已分别生成 `TOKEN_ENCRYPTION_KEY` Secret；目前没有旧 Google 令牌要迁移。
- [ ] **系统邮件**：`RESEND_API_KEY`（Secret）、`RESEND_FROM`（已验证发件地址）；验证确认、取消、改期和提醒邮件。未启用时，不能依赖应用自身发这些邮件。
- [ ] **电子转账滑雪课**：`ETRANSFER_RECIPIENT_EMAIL`（真实已确认的收款邮箱）；未设置时该预约类型不公开。电子转账由主人线下核实，网站仅记录应收，不能显示已收款。
- [ ] **收费预约**：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（均为 Secret），以及需要站内卡片表单时的 `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`；先用 Stripe 测试模式验证付款、取消和退款，再决定正式收款。
- [ ] **故障通知**：`ALERT_EMAIL`，按需设置 `ALERT_WEBHOOK_URL`（Secret）；验证日历断连和失败任务告警。
- [ ] **对外集成**：需要 REST API 时在后台生成 API Key；需要出站 Webhook 时设置目标与签名密钥。密钥只在服务端保管，不写入本文件。
- [ ] **演示模式**：真实站确认未设置 `BOOKKIT_DEMO_MODE=1` 或 `BOOKKIT_CALENDAR=memory`。

## 4. 部署和验收

- [x] 在新版 Neon Production 运行 `npm run db:deploy` 和 `npm run seed:legacy`；Preview 分支从其复制，并再次验证迁移 / 种子脚本可重复执行。滑雪课两个支付选项仍因收款配置缺失而停用。详见 [旧站功能迁移对照](LEGACY_FEATURE_MIGRATION.md)。
- [x] 新项目 Production 构建为 Ready；实测正式域名首页从 Neon 读取三种公开服务，数据库可达。此前 Preview 后台密码登录成功；独立 Preview 分支已构建为 Ready，品牌页可打开。
- [ ] 开发阶段按需手动部署，`.github/workflows/cron-tick.yml` 仅保留手动触发。接受真实预约前，配置可靠的 `/api/cron/tick` 定时调用并验证提醒与失败重试；GitHub Actions 的定时工作流只能从仓库默认分支运行，Vercel Hobby 原生 Cron 也不支持每 10 分钟。
- [ ] 检查 `/api/health` 返回 200，数据库、Google Calendar、Cron、任务队列等关键检查均为正常。
- [ ] 用测试身份完整走通：查看可用时间 → 免费预约 → Google 日历事件和邀请 → 改期 → 取消；检查时区和移动端。
- [ ] 若启用收费，走通 Stripe 测试付款、Webhook、退款和失败重试；之后再开启真实付款。
- [ ] 验证面试申请 → 待审批 → 后台批准/拒绝 → 邀请与通知；检查无邮件配置时后台“Needs attention”仍可看到申请。
- [ ] 核对旧站 `$` 实际币种，并验证滑雪课刷卡 100、电子转账应收 90、`WINTER10` 分别减 10；电子转账核销为人工流程。
- [ ] 历史预约与客户数据需要单独备份、映射与导入；当前功能迁移脚本不会复制旧数据。完成这些验收后再考虑替换旧生产站。
- [ ] 记录切换日期、备份位置和回退步骤；切换后监控健康检查与失败任务。

参考：`.env.example`、`README.md`、`docs/RELIABILITY.md`、PR #2、PR #3。
