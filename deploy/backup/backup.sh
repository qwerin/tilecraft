#!/bin/sh
# Denní záloha do /backups/RRRR-MM-DD: tilecraft.dump (pg_dump -Fc) + data/ (kopie svazku příloh /data).
# Nezměněné přílohy jsou hardlinky na předchozí den, takže každý den zabere jen nové soubory.
# Ponechá posledních BACKUP_KEEP_DAYS dní a první zálohu z každého z posledních BACKUP_KEEP_MONTHS měsíců.
set -eu
B=/backups
day=$(date +%F)
tmp=$B/.tmp-$day
echo "backup: $day start"
rm -rf "$tmp"
mkdir -p "$tmp"
chmod 700 "$B"

pg_dump -Fc -f "$tmp/tilecraft.dump"

prev=$(ls -1d "$B"/20??-??-?? 2>/dev/null | grep -v "/$day\$" | sort | tail -n 1 || true)
if [ -n "$prev" ] && [ -d "$prev/data" ]; then
	rsync -a --delete --link-dest="$prev/data" /data/ "$tmp/data/"
else
	rsync -a --delete /data/ "$tmp/data/"
fi

rm -rf "${B:?}/$day"
mv "$tmp" "$B/$day"
date -Iseconds > "$B/last-ok"

all=$(ls -1d "$B"/20??-??-?? | sort)
keep=$({
	echo "$all" | tail -n "$BACKUP_KEEP_DAYS"
	echo "$all" | awk '{ m = substr($0, length($0) - 9, 7) } !(m in s) { s[m] = 1; print }' | tail -n "$BACKUP_KEEP_MONTHS"
})
for d in $all; do
	echo "$keep" | grep -qxF "$d" || { echo "backup: mažu $d"; rm -rf "$d"; }
done
echo "backup: $day hotovo ($(du -sh "$B/$day/tilecraft.dump" | cut -f1) databáze, celkem $(du -sh "$B" | cut -f1))"
