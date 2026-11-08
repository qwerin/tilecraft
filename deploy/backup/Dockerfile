# Zálohovací kontejner stacku (deploy/docker-compose.yml, docs/BACKUP.md).
# pg_dump musí mít stejnou hlavní verzi jako Postgres stacku.
FROM postgres:17-alpine
RUN apk add --no-cache rsync tzdata
COPY backup.sh /usr/local/bin/backup
COPY restore.sh /usr/local/bin/restore
COPY entrypoint.sh /usr/local/bin/backup-entrypoint
RUN chmod 755 /usr/local/bin/backup /usr/local/bin/restore /usr/local/bin/backup-entrypoint
ENV TZ=Europe/Prague \
    BACKUP_SCHEDULE="30 2 * * *" \
    BACKUP_KEEP_DAYS=14 \
    BACKUP_KEEP_MONTHS=12
# poslední úspěšná záloha nejvýš před 26 hodinami
HEALTHCHECK --interval=10m --start-period=30m \
  CMD find /backups/last-ok -mmin -1560 | grep -q .
ENTRYPOINT ["/usr/local/bin/backup-entrypoint"]
