#!/usr/bin/env sh
set -eu

source_file="${1:?usage: restore.sh /absolute/path/to/happy-kitchen-backup.db}"
data_dir="${APPDATA_PATH:-./data}"
target_file="$data_dir/happy-kitchen.db"

if docker compose ps --status running --services | grep -qx happy-kitchen; then
  echo "Stop the service first: docker compose stop happy-kitchen" >&2
  exit 1
fi

test -f "$source_file" || { echo "Backup file not found: $source_file" >&2; exit 1; }
mkdir -p "$data_dir"
cp "$source_file" "$target_file"
echo "Database restored. Start the service with: docker compose up -d"
