#!/usr/bin/env sh
set -eu

# Run on the Unraid host from the repository directory. Backups remain in the
# persistent /data mount; copy them to an encrypted second destination as well.
backup_dir="/data/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T happy-kitchen sh -lc "mkdir -p '$backup_dir'; node -e \"const Database=require('better-sqlite3'); const db=new Database(process.env.DATABASE_PATH,{readonly:true}); db.backup('$backup_dir/happy-kitchen-$timestamp.db').then(()=>db.close()).catch(e=>{console.error(e);process.exit(1)})\""
echo "Backup created: $backup_dir/happy-kitchen-$timestamp.db"
