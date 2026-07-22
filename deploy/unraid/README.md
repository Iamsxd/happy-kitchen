# Unraid deployment

This repository is ready for Docker Compose deployment. The application uses a
SQLite database in the persistent `/data` volume and does not need Cloudflare,
D1, or a public internet port.

1. Copy the repository to an Unraid AppData folder, for example
   `/mnt/user/appdata/happy-kitchen/app`.
2. Copy `.env.example` to `.env` and set `APPDATA_PATH` to an AppData data
   folder, for example `/mnt/user/appdata/happy-kitchen/data`.
3. For trusted-LAN access, set `HOST_BIND_ADDRESS=0.0.0.0` and choose the host
   port in `HOST_PORT` (for example `8086`). Run
   `docker compose up -d --build`, then open `http://<NAS-LAN-IP>:8086`.
   The `3000` shown in container logs is the internal container port; it is not
   the port users access.
4. Do not expose this HTTP listener through router port-forwarding or UPnP.
   If remote access is needed later, put an authenticated HTTPS reverse proxy
   or a private overlay network in front of it instead.
5. Register the first account. It becomes the application administrator and
   the household owner.

The Compose file is deliberately defensive: configurable listener binding,
bridge networking, non-root execution, read-only root filesystem, no extra
Linux capabilities, no privileged mode, and no Docker socket mount. Use
`HOST_BIND_ADDRESS=127.0.0.1` when another local proxy is the only intended
entry point.

Use `backup.sh` for an online SQLite backup and `restore.sh` for a stopped
service restore. Keep at least one encrypted copy off the NAS and rehearse a
restore before relying on the backups.

## Move existing Cloudflare D1 data once

If this is replacing the previous Cloudflare deployment, export its full D1
database before starting the NAS app for the first time:

```bash
npx wrangler d1 export <database_name> --remote --output=./d1-export.sql
```

Copy that SQL file to the persistent data folder, stop the service, then run
the one-time import. It refuses to overwrite an existing SQLite database and
imports through a staging file before publishing it.

```bash
docker compose run --rm --no-deps happy-kitchen node scripts/import-d1-export.mjs /data/d1-export.sql
docker compose up -d
```

After you have verified the accounts and household data, move the SQL export
to encrypted offline storage or remove it from the NAS. It contains password
hashes and all household data, so it must never be committed to Git.
