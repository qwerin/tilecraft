# TileCraft

Nabídky, zakázky a faktury pro obkladače — místo papíru a tužky.

- **Zaměření na mobilu**: místnosti, stěny a podlahy v metrech, odpočty dveří a oken, lišty a kusy; plochy a obvody se počítají samy.
- **Nabídka z ceníku**: množství se bere ze zaměření (obklad = stěny + prořez, dlažba = podlaha, páska = obvod…), slevy
  dodavatele, materiál „dodá zákazník“, cestovné; součty po sekcích Práce / Materiál / Ostatní, DPH pro plátce.
- **Zákazník nabídku přijme online** (odkaz e-mailem nebo přes WhatsApp, PDF s QR kódem odkazu).
- **Zakázka** z přijaté nabídky: termíny, parta, fotky ze stavby, deník, skutečná množství a srovnání s nabídkou.
- **Faktury**: zálohové i konečné (s odečtem záloh), PDF s QR Platbou, odeslání e-mailem, přehled neuhrazených.
- **Claude přes MCP**: vyfoťte náčrt nebo nadiktujte rozměry a Claude založí nabídku z vašeho ceníku ([docs/MCP.md](docs/MCP.md)).
- Instalace na telefon jako aplikace (PWA), role vlastník / kancelář / parťák (parťák nevidí ceny).

Specifikace: [docs/SPEC.md](docs/SPEC.md). Vývojářské konvence: [CLAUDE.md](CLAUDE.md).

## Vývoj

```bash
make dev-backend    # Go API na :8080 (SQLite tilecraft.db, demo data)
make dev-frontend   # Vite na :5173, proxy /api → :8080
make test           # go vet + go test + tsc + vitest
make gen-types      # po změně API: web/src/api/schema.gen.ts z OpenAPI
```

Demo: `demo@tilecraft.cz` / `demo1234` (vlastník), `parta@tilecraft.cz` / `demo1234` (parťák). OpenAPI: http://localhost:8080/api/docs

## Spuštění v Dockeru

```bash
cp .env.example .env      # nastavte POSTGRES_PASSWORD
docker compose up -d --build
```

## Nasazení (https://tilecraft.svobo.cz)

GitHub Actions (`.github/workflows/docker.yml`) při pushi do `main` spustí testy, sestaví image `ghcr.io/qwerin/tilecraft`
(+ `tilecraft-backup`) a zavolá webhook stacku v Portaineru (secret `PORTAINER_WEBHOOK`; bez něj se nasazení přeskočí).

1. Portainer → Stacks → Add stack → Repository `https://github.com/qwerin/tilecraft`, reference `refs/heads/main`,
   compose path `deploy/docker-compose.yml`, proměnné podle `deploy/.env.example` (`DOMAIN=tilecraft.svobo.cz`,
   `POSTGRES_PASSWORD`, `TILECRAFT_SUPERADMINS`, `TILECRAFT_SIGNUP_CODE`, `TRAEFIK_*`, `CERT_RESOLVER`).
   Zapněte GitOps updates → Webhook a „Re-pull image“.
2. Registry `ghcr.io` v Portaineru (PAT se scope `read:packages`), dokud je image soukromý.
3. DNS: `tilecraft.svobo.cz` → VPS (A/AAAA záznam), certifikát vydá Traefik.

Zálohy: služba `backup` denně ukládá databázi a fotky do `/srv/tilecraft-backups` ([docs/BACKUP.md](docs/BACKUP.md)).

## Konfigurace (proměnné prostředí)

| Proměnná | Výchozí | Popis |
|---|---|---|
| `TILECRAFT_DB_DRIVER` | `sqlite` | `sqlite` nebo `postgres` |
| `TILECRAFT_DB_DSN` | `tilecraft.db` | soubor SQLite / DSN Postgresu |
| `TILECRAFT_DATA_DIR` | `./data` | fotky zakázek, loga |
| `TILECRAFT_STATIC_DIR` | — | sestavené SPA (v Dockeru `/app/dist`) |
| `TILECRAFT_PUBLIC_URL` | `http://localhost:8080` | veřejná adresa (odkazy pro zákazníky, OAuth pro MCP; https → Secure cookies) |
| `TILECRAFT_SIGNUP_CODE` | — | registrace nové firmy jen s tímto kódem (nebo jednorázovým od superadmina) |
| `TILECRAFT_ALLOW_SIGNUP` | `true` | registrace bez kódu (jen když není `TILECRAFT_SIGNUP_CODE`) |
| `TILECRAFT_SUPERADMINS` | — | e-maily superadminů (`/admin`) |
| `TILECRAFT_SEED_DEMO` | `false` | demo firma při prázdné DB |
| `TILECRAFT_ENV` | `production` | `test` = testovací instance (růžový motiv, nikdy neodesílá e-maily) |
| `TILECRAFT_EMAIL_LIVE` | `false` | ostré odesílání e-mailů (jinak se jen uloží na stránku E-maily) |
| `TILECRAFT_GMAIL_USER` / `_APP_PASSWORD` | — | odesílání přes Gmail; nebo `TILECRAFT_SMTP_*` (host, port, user, password, from, tls) |
| `TILECRAFT_DKIM_*` | — | DKIM podpis (doména, selektor, klíč) |
| `TILECRAFT_SECRET_KEY` | — | 32 B klíč šifrující uložená hesla SMTP; prázdné = `secret.key` v datovém adresáři |
| `TILECRAFT_TRUSTED_PROXIES` | — | IP/CIDR reverzních proxy |

E-mail lze nastavit i ve Správě aplikace (`/admin`) nebo vlastní SMTP firmy v Nastavení → E-mail.
