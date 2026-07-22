# NAS 与 Unraid 部署安全方案 v0.2

本版本已完成 Node.js + SQLite 自托管迁移，并提供 Docker Compose。应用数据只写入 `/data/happy-kitchen.db`，该目录必须映射到 Unraid AppData 持久化路径。

局域网直连链路：家庭设备 → `http://NAS-LAN-IP:HOST_PORT` → Docker 容器内部的 `3000` 端口 → SQLite 数据卷。`3000` 是容器内部端口；`HOST_PORT` 才是访问 NAS 时使用的端口。不要配置路由器端口映射或 UPnP。

## 上线步骤

1. 将仓库放入 `/mnt/user/appdata/happy-kitchen/app`。
2. 复制 `.env.example` 为 `.env`，将 `APPDATA_PATH` 改为 `/mnt/user/appdata/happy-kitchen/data`。
3. 保持 `HOST_BIND_ADDRESS=0.0.0.0`，将 `HOST_PORT` 设为未被占用的端口，例如 `8086`。`localhost` 和 `127.0.0.1` 都只能让 NAS 本机访问，不能用于局域网直连。
4. 在应用目录运行 `docker compose up -d --build`，用 `docker compose ps` 确认健康检查通过。若 `HOST_PORT=8086`，应能看到 `0.0.0.0:8086->3000/tcp`。
5. 从家庭局域网访问 `http://<NAS 的局域网 IP>:8086`，注册第一个账号；该账号同时是系统管理员和家庭所有者。

## 从旧版 D1 迁移既有数据（仅一次）

如果 NAS 版要接管既有 Cloudflare 数据，必须先导出旧 D1；不能让新 SQLite 自动读取云端数据库。先在有 Cloudflare 权限的电脑上运行：

```bash
npx wrangler d1 export <database_name> --remote --output=./d1-export.sql
```

将导出的 SQL 放到 `APPDATA_PATH`，在 NAS 版首次启动前执行：

```bash
docker compose run --rm --no-deps happy-kitchen node scripts/import-d1-export.mjs /data/d1-export.sql
docker compose up -d
```

导入脚本拒绝覆盖已存在的 SQLite 文件，并先写入临时文件，导入成功后才发布为 `happy-kitchen.db`。验证账号、家庭和库存后，将 SQL 导出文件移出 NAS 或加密保存；它包含密码哈希和家庭数据，禁止提交到 Git。

## 强制安全要求

- 不要把 8086（或其他应用端口）、80、443 或数据库端口映射到路由器，也不要开启 UPnP。局域网直连使用 HTTP，密码会经过局域网；只应在自己信任的网络使用，远程访问应另行部署 HTTPS 反向代理或私有网络入口。
- 不要使用 `network_mode: host`、`privileged: true`、Docker socket 挂载或 `latest` 镜像标签。
- 不要把 `.env`、`data/`、SQLite 备份或任何密钥提交到 Git。
- 每日备份 SQLite，至少保留一份加密的异机或异盘副本；每季度进行恢复演练。
- NAS 版默认关闭 ChatGPT 登录；用户名密码和管理员登录是唯一应用身份方式。

## 验收

- 容器重建后，账号、家庭、库存、采购清单和周计划仍存在。
- 同一家庭局域网内可通过 `http://NAS-LAN-IP:HOST_PORT` 访问；从互联网侧未配置端口映射时不能访问应用。
- `/api/health` 正常且 Compose 显示容器 healthy。
- 连续输错密码 5 次后收到 429。
- 生成的邀请码可以让新账号加入现有家庭；非所有者不能创建邀请码或移除账号成员。
- 最新备份能在隔离目录恢复并登录验证。
