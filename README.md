# 樱雪的干饭小问卷

奶油白、薄荷绿与珊瑚红的小问卷，适配手机和电脑。

- 问卷：https://yingxue-dinner-wishlist.upbeat-book-0732.chatgpt.site
- Adam 收件箱：https://yingxue-dinner-wishlist.upbeat-book-0732.chatgpt.site/adam
- 收件箱使用创建网站的 ChatGPT 账号登录；访客无需登录即可填写。

**大陆访问状态（2026-11-03）：** 原 `chatgpt.site` 地址已在用户手机上出现平台拦截页，不能当作大陆可用地址。此仓库另外提供独立的 EdgeOne 部署版本；代码和部署配置已准备，尚需开通用户自己的托管账号、绑定域名及完成大陆手机验收。具体步骤见 [大陆部署说明](DEPLOY-CHINA.md)。

## 页面与数据

首页 → 六家餐厅（按 PDF 顺序）→ 多选页 → 感谢页。
多选页也可以进入「我有其他想法」，输入最多 1000 字并发送，或者返回继续选择。无论点击哪一页的发送按钮，都会提交当前全部餐厅选择和留言；后台在同一份答卷里显示两者。六个餐厅详情页已删除「Adam 的小纸条」。

餐厅详情支持放大原图。选择后标红。返回或刷新时保留本标签页内的草稿。提交成功才进入感谢页；断网或接口异常会保留内容并提示重试。同一请求重试不会重复入库。

- `lib/restaurants.ts`：六家餐厅的资料与参考价。
- `public/images/`：从「图例.pdf」提取的六张图片，压缩为 WebP。
- `sources/`：提供的原始资料。
- `db/schema.ts`、`drizzle/`：数据库结构及迁移。
- `app/api/answers/route.ts`：校验与写入接口。
- `app/adam/page.tsx`：仅主人可看的收件箱，每页 20 条。
- `app/api/export/route.ts`：仅主人可导出本页 JSON。

GitHub 保存代码、餐厅资料、图片和数据库结构。实际答卷存储在 Sites 托管的 Cloudflare D1（SQLite）数据库中，不提交到这个公开仓库。浏览器 sessionStorage 仅保存临时草稿，不替代数据库。

提交数据包含：请求 UUID、类型、餐厅名称/分店/价格说明/地址快照和留言、随机表单会话 ID、UTC 提交时间。收件箱以北京时间显示。数据库不会收集填写者的姓名、邮箱或 IP。Sites 版公开问卷每个表单会话每天最多 10 次提交，使用签名会话 cookie、同源校验和 CSRF token。此限制用于误点和普通重复提交，不是强反机器人保护。

## 本地运行

需要 Node.js 22.13+（建议 24）和 npm。

```sh
npm ci
```

创建不跟踪的 `.dev.vars`：

```text
SESSION_SECRET=自行生成足够长的随机字符串
OWNER_EMAIL=seedy@sites.test
```

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_ambiguous_morlun.sql
npm run dev -- --hostname 127.0.0.1
```

默认地址 http://127.0.0.1:5173 。本地 `/adam` 使用开发模拟登录，不需要真实 ChatGPT 登录。该模拟不会打包到生产。

## 验证

```sh
npx tsc --noEmit
npm run build
node scripts/test-api.mjs
```

接口测试仅允许本地地址，会写入明确的测试记录到本地数据库；生产库独立。检查真实保存、重复与并发重试、非法选项、空白留言、长文本、CSRF、跨域、限流和导出权限。浏览器人工核对 390px 手机、1440px 桌面、逐页展示、多选标红、返回保留及两条提交路径。

## 部署与维护

使用 Sites 发布，绑定 `DB` 的 D1 数据库，部署时执行迁移。生产环境必须配置 `SESSION_SECRET` 和 `OWNER_EMAIL`，这些值保存在托管环境的秘密配置中。切勿把它们提交到 GitHub，也不要把本地测试邮箱配置到生产。

该项目有服务端和数据库，不能仅靠 GitHub Pages 完成提交保存。源码可以继续从本仓库维护；重新发布使用匹配源码构建的 Sites 部署包。修改数据结构后运行 `npm run db:generate` 并提交新增迁移；不要重写已应用的迁移。

价格来自提供的清单（2026-11-03），不是实时查询。泰铺 ¥90–100 为品牌客单参考；其他价格也保留原始口径。图片来自提供的 PDF，沿用原素材的使用范围。
