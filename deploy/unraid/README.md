# Unraid deployment

This repository is ready for Docker Compose deployment. The application uses a
SQLite database in the persistent `/data` volume and does not need Cloudflare,
D1, or a public internet port.

1. Copy the repository to an Unraid AppData folder, for example
   `/mnt/user/appdata/happy-kitchen/app`.
2. Copy `.env.example` to `.env` and set `APPDATA_PATH` to an AppData data
   folder, for example `/mnt/user/appdata/happy-kitchen/data`.
3. Run `docker compose up -d --build`.
4. Install the official Unraid Tailscale plugin, then publish only the local
   listener with `tailscale serve --https=443 http://127.0.0.1:3000`.
5. Open the Tailnet HTTPS address and register the first account. It becomes
   the application administrator and the household owner.

The Compose file is deliberately defensive: loopback-only port binding, bridge
networking, non-root execution, read-only root filesystem, no extra Linux
capabilities, no privileged mode, and no Docker socket mount.

Use `backup.sh` for an online SQLite backup and `restore.sh` for a stopped
service restore. Keep at least one encrypted copy off the NAS and rehearse a
restore before relying on the backups.
