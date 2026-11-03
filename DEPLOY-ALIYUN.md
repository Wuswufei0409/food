# 阿里云深圳服务器部署

## 已交付状态（2026-11-03）

- 问卷临时地址：<http://47.107.178.192/>。
- 服务器：用户购买的深圳轻量应用服务器，Alibaba Cloud Linux 3，1 GB 内存；保留原宝塔面板。
- 网页和接口由同一个 Node.js 24 服务提供，答卷存本机 SQLite。无外部字体、图片、ChatGPT 登录或第三方数据库依赖。
- 手机用户已确认大陆蜂窝网络下首页和图片正常。公网两种提交入口均已验证同时保存餐厅与留言。仅清理了本次创建的 2 条验收记录，保留原站 2 条历史答卷和部署期间的新提交。
- 域名、ICP备案和 HTTPS 尚未配置。当前 IP 地址用于部署验收，不能把现阶段称为已完成正式域名上线。阿里云大陆地域的网站备案要求见 [创建服务器说明](https://help.aliyun.com/zh/simple-application-server/user-guide/)。该实例目前购买 1 个月，申请备案前还需核对官方的实例时长要求。

## 管理员收件箱

公网 HTTP 请求不允许管理员登录和读取答卷。Adam 在自己的电脑通过 SSH 加密隧道访问 `http://127.0.0.1:18789/adam`。管理员口令及隧道命令保存在仓库外的本机 `服务器部署信息.txt`，只允许当前 Windows 用户读取，不能公开或提交 Git。

关闭本机隧道不影响服务器继续收集答卷。再次查看时重新运行私有说明中的 SSH 命令即可。填写者只需问卷网址，不需要 SSH 或管理员口令。

正式域名备案并解析完成后，配置受信任 HTTPS 证书和反向代理，将 `PUBLIC_ORIGIN` 改成正式 HTTPS 域名，再把服务改回只监听 `127.0.0.1:8789`。公网管理员登录就可通过 HTTPS 使用。反向代理必须覆盖 `Host`、`X-Real-IP`、`X-Forwarded-For`，同时显式启用 `TRUST_LOCAL_PROXY=true`。

## 文件与服务

| 项目 | 位置 |
| --- | --- |
| 应用 | `/opt/yingxue-dinner/current`（指向 release 目录） |
| Node 运行环境 | `/opt/yingxue-runtime/bin/node` |
| 数据库 | `/var/lib/yingxue-dinner/answers.sqlite` |
| 数据库备份 | `/var/lib/yingxue-dinner/backups/` |
| 环境变量和口令 | `/etc/yingxue-dinner.env`，root 0600 |
| 服务配置 | `/etc/systemd/system/yingxue-dinner.service` |

服务使用单独的 `yingxue-dinner` 系统用户、限制写入目录、开机启动、异常退出重启。公网当前仅增加标准 HTTP 80 端口服务，未扩大 SSH、宝塔或数据库访问范围；数据库没有对外监听端口。

```sh
systemctl status yingxue-dinner
journalctl -u yingxue-dinner -n 50 --no-pager
systemctl restart yingxue-dinner
```

## 构建和更新

在本机安装依赖后构建，不需要在这台 1 GB 服务器编译项目或执行 npm install：

```sh
npm ci
npx tsc --noEmit
npm run build:selfhost
npm run test:selfhost
```

产物 `dist-selfhost/` 含静态网页、图片、`server.mjs` 和 `maintenance.mjs`。上传到新的 release 目录，先备份数据库和记录旧 `current` 目标，再切换软链接、重启并验证 `/api/health`。不要把 `current` 指向开发源码，也不要覆盖 `/var/lib/yingxue-dinner` 或秘密配置。失败时可切回旧 release。

`deploy/install-selfhost.sh` 是本次首次安装脚本：检测到已有配置会停止，不能用它覆盖更新线上实例。首次安装使用官方 Node 发行包并校验 SHA-256。

## 答卷和备份

SQLite 使用 WAL 和事务。餐厅和留言在同一个 JSON 记录中保存；数据库视图 `answers` 便于查看。正常重试不重复保存、不改变原提交时间，提交限额和答卷写入在同一个事务内完成。

同源检查、CSRF 和签名 HttpOnly cookie 保护表单。每个会话每天最多 10 份答卷；登录失败有来源限流，但不作为强反机器人保护。管理员可以从信箱逐页导出 JSON。没有自动删除真实答卷的任务。

已创建初始备份。后续可在服务器执行：

```sh
runuser -u yingxue-dinner -- env DATABASE_PATH=/var/lib/yingxue-dinner/answers.sqlite \
  /opt/yingxue-runtime/bin/node /opt/yingxue-dinner/current/maintenance.mjs \
  backup /var/lib/yingxue-dinner/backups/answers-YYYYMMDD.sqlite
```

备份使用 SQLite 在线备份 API；不要只复制正在使用的主数据库而遗漏 WAL。恢复前停止服务并保留当前数据库及 WAL 的副本，再使用已验证的备份替换，恢复用户所有权后启动。管理员口令不在数据库备份中，应分别妥善保管。

原站迁移通过 `maintenance.mjs import` 完成，保留原来的餐厅快照、留言及时间，重复导入不产生重复记录。旧站数据库未改动。
