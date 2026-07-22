# NAS 与 Unraid 部署安全方案 v0.2

本版本已完成 Node.js + SQLite 自托管迁移，并提供 Docker Compose。应用数据只写入 `/data/happy-kitchen.db`，该目录必须映射到 Unraid AppData 持久化路径。

推荐链路：已加入 Tailnet 的设备 → Unraid Tailscale Serve → `127.0.0.1:3000` 的 Docker 容器 → SQLite 数据卷。不要配置路由器端口映射、UPnP 或 Tailscale Funnel。

## 上线步骤

1. 将仓库放入 `/mnt/user/appdata/happy-kitchen/app`。
2. 复制 `.env.example` 为 `.env`，将 `APPDATA_PATH` 改为 `/mnt/user/appdata/happy-kitchen/data`。
3. 在应用目录运行 `docker compose up -d --build`，用 `docker compose ps` 确认健康检查通过。
4. 在 Unraid 安装官方 Tailscale 插件，确认 NAS 已加入 Tailnet，然后执行 `tailscale serve --https=443 http://127.0.0.1:3000`。
5. 从 Tailnet 设备访问 HTTPS 地址，注册第一个账号；该账号同时是系统管理员和家庭所有者。

## 强制安全要求

- 不要把 3000、80、443 或数据库端口映射到路由器；默认 Compose 只绑定 localhost。
- 不要使用 `network_mode: host`、`privileged: true`、Docker socket 挂载或 `latest` 镜像标签。
- 不要把 `.env`、`data/`、SQLite 备份或任何密钥提交到 Git。
- 每日备份 SQLite，至少保留一份加密的异机或异盘副本；每季度进行恢复演练。
- NAS 版默认关闭 ChatGPT 登录；用户名密码和管理员登录是唯一应用身份方式。

## 验收

- 容器重建后，账号、家庭、库存、采购清单和周计划仍存在。
- 未加入 Tailnet 的设备不能访问应用。
- `/api/health` 正常且 Compose 显示容器 healthy。
- 连续输错密码 5 次后收到 429。
- 生成的邀请码可以让新账号加入现有家庭；非所有者不能创建邀请码或移除账号成员。
- 最新备份能在隔离目录恢复并登录验证。
