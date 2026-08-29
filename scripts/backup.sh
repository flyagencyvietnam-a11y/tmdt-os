#!/bin/sh
# Sao lưu DB hằng ngày — SPEC Mục 5.3. Chạy trong container `db` qua cron của host:
#   0 2 * * *  docker compose exec -T db sh /backup/backup.sh
# Giữ 30 bản gần nhất. NHỚ đồng bộ thư mục ./backup ra nơi lưu trữ thứ hai.
set -e
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="/backup/vmg_${STAMP}.dump"
pg_dump -U "${POSTGRES_USER:-vmg}" -Fc "${POSTGRES_DB:-vmg_tmdt_os}" > "$OUT"
echo "backup: $OUT"
# xóa bản cũ, giữ 30
ls -1t /backup/vmg_*.dump 2>/dev/null | tail -n +31 | xargs -r rm -f
