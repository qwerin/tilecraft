# Zálohování

Zálohuje se databáze (Postgres) a svazek příloh (`tilecraft_appdata`) – to je veškerý stav aplikace. Zálohy obsahují
osobní údaje pacientů: adresáře mají práva 700 a nikam jinam než na server a do PC správce se nekopírují.

## Na serveru

Služba `backup` v `deploy/docker-compose.yml` (image `ghcr.io/qwerin/tilecraft-backup` z `deploy/backup/`, sestavuje ho
CI spolu s aplikací) jednou denně (`BACKUP_SCHEDULE`, výchozí 2:30 Europe/Prague) uloží do `BACKUP_DIR` na hostiteli
(výchozí `/srv/tilecraft-backups`):

```
/srv/tilecraft-backups/
  2026-10-29/tilecraft.dump   pg_dump -Fc celé databáze
  2026-10-29/data/           kopie svazku příloh; nezměněné soubory jsou hardlinky na předchozí den
  last-ok                    čas poslední úspěšné zálohy
```

- Ponechá se posledních `BACKUP_KEEP_DAYS` (14) dní a první záloha z každého z posledních `BACKUP_KEEP_MONTHS` (12)
  měsíců. Díky hardlinkům zabírá každý den jen databázi a nové přílohy.
- Při startu kontejneru se záloha udělá hned, pokud poslední je starší než 24 hodin.
- Healthcheck: kontejner je `unhealthy`, když poslední úspěšná záloha je starší než 26 hodin (vidět v Portaineru).
- Ruční záloha: `docker exec tilecraft-backup-1 backup`. Výpis: `docker logs tilecraft-backup-1`.

Po prvním nasazení ověřte, že Portainer image stáhne (stejný registr `ghcr.io` jako aplikace; balíček
`tilecraft-backup` musí být pro PAT dostupný stejně jako `tilecraft`) a že vznikl první adresář se zálohou.

## Stažení do PC

Záloha jen na serveru nepřežije ztrátu serveru, proto se stahuje do PC. `scripts/backup-pull.sh` přes SSH a rsync
stáhne nové dny (přílohy zase jako hardlinky, takže se přenáší jen to nové):

```bash
./scripts/backup-pull.sh <server>                    # do ~/zalohy/tilecraft
./scripts/backup-pull.sh <server> /mnt/disk/tilecraft # jinam
```

- `<server>` je host z `~/.ssh/config`; uživatel musí číst `BACKUP_DIR` (vlastní ho root, práva 700).
- Co server už smazal, v PC zůstane: v PC se drží posledních `KEEP_DAYS` (30) dní a první záloha každého měsíce navždy.
- Skript skončí chybou (a vypíše POZOR), když poslední záloha na serveru je starší než 2 dny – tak se pozná, že
  zálohování na serveru neběží.

Automaticky jednou denně (systemd uživatele; `Persistent=true` dožene běh, když byl PC vypnutý):

```ini
# ~/.config/systemd/user/tilecraft-backup.service
[Unit]
Description=Stažení záloh tilecraftu
[Service]
Type=oneshot
ExecStart=%h/work/tilecraft/scripts/backup-pull.sh <server>

# ~/.config/systemd/user/tilecraft-backup.timer
[Unit]
Description=Denní stažení záloh tilecraftu
[Timer]
OnCalendar=*-*-* 09:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now tilecraft-backup.timer
journalctl --user -u tilecraft-backup   # výsledek posledních běhů
```

Služba neběží v sezení s ssh-agentem: použijte klíč bez hesla určený jen pro zálohy, nebo v service nastavte
`Environment=SSH_AUTH_SOCK=%t/ssh-agent.socket` (podle toho, kde agent běží).

## Obnova

Přepíše databázi i přílohy stavem ze zvoleného dne. Aplikace musí stát (v Portaineru zastavit kontejner `app`, nebo
`docker stop tilecraft-app-1`):

```bash
docker stop tilecraft-app-1
docker run --rm --network tilecraft_internal -v tilecraft_appdata:/data -v /srv/tilecraft-backups:/backups \
  -e PGHOST=db -e PGUSER=tilecraft -e PGDATABASE=tilecraft -e PGPASSWORD=<heslo> \
  --entrypoint restore ghcr.io/qwerin/tilecraft-backup:latest 2026-10-29
docker start tilecraft-app-1
```

Heslo DB lze převzít z kontejneru zálohy: `docker exec tilecraft-backup-1 printenv PGPASSWORD`. Obnova databázi smaže a
založí znovu, takže po ní nic nezůstane z novějšího stavu. Ze zálohy v PC ji obnovíte tak, že adresář dne nahrajete
na server (`rsync -aH ~/zalohy/tilecraft/2026-10-29 <server>:/srv/tilecraft-backups/`).

Obsah dumpu bez obnovy: `pg_restore -l tilecraft.dump`; do jiné databáze (např. pro kontrolu) `pg_restore --no-owner -d …`.
