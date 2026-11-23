---
name: deploy
description: Commit, push, lokální sestavení Docker image do ghcr.io a nasazení TileCraftu na produkci (https://tilecraft.svobo.cz, root@svobo.cz:/srv/tilecraft). Použij, když uživatel řekne „commit push“, „sestav image“, „nasaď na produkci“, „deploy“ apod.
---

# Commit → push → image → nasazení

Produkce běží jako docker compose stack v `/srv/tilecraft` na `root@svobo.cz` (soubor = `deploy/docker-compose.yml`,
tajné hodnoty v `/srv/tilecraft/.env`). Stack **nevznikl v Portaineru**, takže ho Portainer ani webhook z CI neovládá
(„This stack was created outside of Portainer“) — nasazuje se přes SSH. Udělej jen ty kroky, o které uživatel žádá
(např. jen commit+push, nebo i image a nasazení).

## 1. Kontrola a commit

```bash
git status --short            # nic z podklady/, *.db, .env — repo je veřejné
make gen-types                # pokud se měnilo API
make test                     # musí projít, jinak nepokračuj
git add … && git commit       # zpráva anglicky, na konci řádek Co-Authored-By podle pokynů relace
```

Práce na jiné větvi: `git checkout main && git pull --ff-only && git merge --ff-only <větev>` (při konfliktu se zastav
a řeš ho, nemerguj naslepo).

## 2. Push

```bash
git push origin main
```

Push do `main` spustí GitHub Actions (`.github/workflows/docker.yml`): testy, build a push image se **stejnými tagy**
(`latest`, `sha-<7 znaků>`), a pokus o Portainer webhook (pro tento stack nic nedělá). CI image je ze stejného commitu,
takže lokální image přepíše ekvivalentním — to nevadí.

## 3. Image lokálně → ghcr.io

```bash
SHA=$(git rev-parse --short=7 HEAD)
docker build -t ghcr.io/qwerin/tilecraft:latest -t ghcr.io/qwerin/tilecraft:sha-$SHA .
docker build -t ghcr.io/qwerin/tilecraft-backup:latest -t ghcr.io/qwerin/tilecraft-backup:sha-$SHA deploy/backup
```

Kouřový test před pushem (testovací režim, demo data, nic neodesílá):

```bash
docker run -d --rm --name tc-smoke -e TILECRAFT_ENV=test -e TILECRAFT_SEED_DEMO=1 -p 18080:8080 ghcr.io/qwerin/tilecraft:latest
sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18080/   # 200
docker logs tc-smoke | tail -3; docker stop tc-smoke
```

Push (Docker je k ghcr.io přihlášený; když ne, ať uživatel spustí `! docker login ghcr.io`):

```bash
for i in tilecraft tilecraft-backup; do for t in latest sha-$SHA; do docker push -q ghcr.io/qwerin/$i:$t; done; done
```

## 4. Nasazení na produkci

Nasazení je zásah do produkce — dělej ho jen na výslovnou žádost uživatele v této konverzaci.

```bash
ssh root@svobo.cz 'cd /srv/tilecraft && docker compose ps'          # podívej se, co běží
# záloha DB před migrací (AutoMigrate + doplňující migrace běží při startu aplikace)
ssh root@svobo.cz 'u=$(docker exec tilecraft-db-1 printenv POSTGRES_USER); d=$(docker exec tilecraft-db-1 printenv POSTGRES_DB);
  docker exec tilecraft-db-1 pg_dump -U "$u" -Fc "$d" > /root/tilecraft-predeploy-$(date +%F-%H%M).dump && ls -la /root/tilecraft-predeploy-*.dump | tail -1'
ssh root@svobo.cz 'cd /srv/tilecraft && docker compose pull -q app backup && docker compose up -d app backup'
```

Pokud se změnil `deploy/docker-compose.yml`, nejdřív ho porovnej se serverem
(`ssh root@svobo.cz cat /srv/tilecraft/docker-compose.yml | diff - deploy/docker-compose.yml`) a změnu nahraj
až po ukázání diffu uživateli. `.env` na serveru neměň a nevypisuj (obsahuje hesla).

## 5. Ověření

```bash
ssh root@svobo.cz 'cd /srv/tilecraft && docker compose ps && docker logs --tail 20 tilecraft-app-1'
#   → "listening … db=postgres", žádné ERROR/panic
curl -s -o /dev/null -w "%{http_code}\n" https://tilecraft.svobo.cz/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://tilecraft.svobo.cz/api/me      # 401 = API žije
gh run list -L 2                                                               # stav CI
```

Po migracích dat zkontroluj dotčené tabulky přes `docker exec tilecraft-db-1 psql …` (jen čtení).

## Návrat zpět

- Starší image: do `/srv/tilecraft/.env` `TILECRAFT_TAG=sha-<předchozí>` a `docker compose up -d app backup`
  (předchozí SHA: `git log --oneline -5`). Po návratu tag zase odeber, jinak zůstane přišpendlený.
- Data: `pg_restore --clean -U … -d …` z `/root/tilecraft-predeploy-*.dump` — jen po potvrzení uživatelem,
  přepíše produkční databázi. Denní zálohy dělá kontejner `tilecraft-backup` (14 dní).

Na konci shrň: commit (SHA), co je pushnuté, tagy image, stav kontejnerů a výsledky ověření.
