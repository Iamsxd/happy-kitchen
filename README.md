# 快乐厨房

一个家庭共享的营养食谱、冰箱库存、采购清单与周食谱应用。它是移动优先的 PWA，支持详细菜谱录入、采购余量入库、饮食限制、整周餐次排期，以及《程序员做饭指南》开源菜谱与烹饪知识导入。

## 账号与家庭

- 一个账号代表一个真实使用者，不建议全家共用密码。
- 第一个注册账号会创建家庭，并同时成为应用管理员和家庭所有者。
- 家庭所有者可在“家人”页面生成一次性邀请码；其他成人注册时填写邀请码，即会加入同一个家庭并共享库存、菜谱、采购清单与周食谱。
- 儿童、老人和其他不需要登录的人可以作为受管理成员存在，有独立的营养目标和饮食限制。
- 当前一个账号只能属于一个家庭，避免家庭数据混杂。

## Docker Compose（Unraid / NAS）

本项目使用 Node.js + SQLite，不依赖 Cloudflare 或 D1。完整 Unraid 上线说明在 [deploy/unraid/README.md](deploy/unraid/README.md)。

```bash
cp .env.example .env
docker compose up -d --build
```

容器内部始终监听 `3000`，实际访问端口由 `HOST_PORT` 决定。`.env.example` 默认配置为受信任家庭局域网直连：`HOST_BIND_ADDRESS=0.0.0.0`，例如设置 `HOST_PORT=8086` 后访问 `http://NAS-LAN-IP:8086`。`localhost` 与 `127.0.0.1` 都只允许 NAS 本机访问。不要在路由器映射应用端口或启用 UPnP；如需远程访问，应另行使用 HTTPS 反向代理或私有网络入口。

数据库位于 `APPDATA_PATH` 的 `happy-kitchen.db`。使用 `deploy/unraid/backup.sh` 创建在线备份，并保留加密的异机副本；恢复前必须停止服务。

## 本地开发

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

默认数据库文件为 `./data/happy-kitchen.db`。测试与检查：

```bash
npm test
npm run lint
docker compose build
```

## 安全边界

- 密码使用随机盐和 PBKDF2-SHA256 哈希，不存储明文；会话令牌只保存 SHA-256 摘要。
- 登录失败按用户名和来源地址限速；接口响应禁用缓存，并设置 CSP、防嵌入、防 MIME 嗅探等安全响应头。
- Docker 配置默认使用非 root、只读根文件系统、无额外 capabilities、无 Docker socket、无 host 网络。
- 本产品不提供疾病诊断或医疗膳食处方。儿童、孕妇、老人和特殊疾病人群的营养目标应由用户或专业人员确认。

## 第三方内容与许可

菜谱与厨艺学习内容包含来自 [Anduin2017/HowToCook](https://github.com/Anduin2017/HowToCook) 的导入数据；保留其来源与 Unlicense 标注。项目自身使用 MIT 许可证，详见 [LICENSE](LICENSE)。
