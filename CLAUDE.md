# CLAUDE.md

TileCraft — software pro obkladače: zaměření → nabídka → zakázka → faktura, na mobilu (PWA) i na PC, s MCP serverem
pro automatické nabídky přes Clauda. Produkce: https://tilecraft.svobo.cz. Multi-tenant (firmy), Go API + React SPA ve `web/`.
Kostra převzata z qwersoft (`/home/qwerin/work/qwersoft`).

**`docs/SPEC.md` je závazná specifikace domény.** Odchylky zapisujte do jejích „Otevřených otázek“.

## Příkazy

```bash
make dev-backend / make dev-frontend   # :8080 (SQLite tilecraft.db, demo data) + Vite :5173
make test                              # go vet, go test, tsc, vitest
make gen-types                         # po každé změně API (web/src/api/schema.gen.ts)
go test ./internal/api/ -run TestQuoteToInvoice -v -count=1
docker compose up -d --build           # lokální stack (Postgres, testovací instance)
```

Demo: `demo@tilecraft.cz` / `demo1234` (vlastník), `parta@tilecraft.cz` / `demo1234` (parťák).

## Struktura

```
cmd/server/         config → db.Open/Migrate → (SeedDemo) → api.New → SPA (TILECRAFT_STATIC_DIR)
cmd/gen-schema/     OpenAPI JSON pro typy frontendu
internal/calc/      čistá aritmetika: plochy, odpočty, obvody, množství ze zaměření, částky řádků, součty, DPH
internal/model/     GORM modely (account.go: firma, členové, e-maily; domain.go: zákazník, ceník, nabídka, zakázka, faktura)
internal/api/       jeden soubor na zdroj, DTO vedle handlerů:
                    customers, catalog (+ výchozí ceník), lines (řádky + zaměření), quotes, public_quotes (/n/{token}),
                    jobs (+ fotky, deník), invoices (+ zálohy, odpočet), pdf (PDF + e-mail), dashboard, mcp, seed
internal/invoicepdf/ PDF faktury a nabídky (fpdf, Noto, QR Platba)
internal/auth/      session, API tokeny tc_…, role ForAll/ForManagers
web/src/routes/     /a/$slug/… aplikace, /n/$token veřejná nabídka pro zákazníka, /print/… tisk
web/src/components/doc-editor/  RoomsEditor + LinesEditor (nabídka i zakázka), web/src/lib/calc.ts = port internal/calc
```

## Konvence

- Peníze `int64` v haléřích, částka řádku zaokrouhlená na celé Kč (`calc.LineAmount`), množství na 2 desetinná místa,
  rozměry v metrech, data `YYYY-MM-DD`. `web/src/lib/calc.ts` musí počítat stejně jako `internal/calc` (testy na stejná čísla).
- Všechna data firmy přes `s.scoped(ctx)` / `tx.Scopes(inAccount(ctx))`. Cizí záznam = 404.
- Každá operace deklaruje role: `auth.ForManagers` (vlastník, kancelář — ceny, nabídky, faktury, ceník) nebo `auth.ForAll`
  (i parťák — zakázky bez cen; handler nuluje ceny přes `isManager(ctx)`).
- Řádek s `measure` má množství počítané ze zaměření (`buildLines`); ruční množství = `measure: ""`.
- Rozhodnutá nabídka (přijatá/odmítnutá) je zamčená; zaplacenou fakturu nelze měnit ani smazat.
- Faktury a zálohy sdílí jednu číselnou řadu (unikátní VS), zálohy mají prefix ZF.
- SQLite má jedno spojení: uvnitř `Transaction(func(tx…))` používejte jen `tx`.
- MCP (`internal/api/mcp.go`, SPEC §9): nástroj = položka v `mcpTools` (operace REST API, tělo v argumentu `body`).
  Jen čtení a bezpečný zápis — nic nemaže a neposílá zákazníkům. Popisy anglicky.
- E-mail jen přes `s.sendEmail` mimo transakci; testovací instance (`TILECRAFT_ENV=test`) nikdy neodesílá.
- Frontend: `useFirm()` (slug, account, isManager, isWorker), `useFirmMutation`, chyby česky v `web/src/api/errors.ts`
  (nový kód chyby = nový text). UI texty česky, mobile-first.
- Repo je veřejné: `podklady/` (data zákazníků) se necommituje.
