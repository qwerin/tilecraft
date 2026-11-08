# TileCraft — specifikace

Software pro obkladače: **zaměření → nabídka → zakázka → faktura**, na mobilu na stavbě i na PC v kanceláři,
s MCP serverem, přes který Claude (claude.ai, Claude Code, Claude Desktop) zakládá a upravuje nabídky.
Produkce: https://tilecraft.svobo.cz. Odchylky a nerozhodnuté věci patří do [Otevřených otázek](#11-otevřené-otázky).

## 0. Výchozí stav (papír)

Dnešní nabídka (podklady, koupelna):

1. **Zaměření** — náčrt místností, každá plocha s rozměry (2,95 × 2,1 → 6,2 m²), podlaha 4,6 m², obvody
   a délky v bm (lišta 7,96 + 1,85 + 2,06 + 0,98 bm), kusy (14 vykružování).
2. **Práce** — řádky „název — množství × jednotková cena = částka“, jednotky m², bm, ks, hod:
   montáž pancéřového pletiva 4,6 m² × 150 = 690 Kč, obklad 14,11 m² × 650 = 9 172 Kč, vykružování 14 × 85 = 1 190 Kč,
   stržení korku 7 hod × 400 = 2 800 Kč … **práce celkem 22 256 Kč**.
3. **Materiál** — řádky s cenou, **slevou dodavatele** (−25 %, −35 %) a s položkami, které **dodává zákazník** (= 0 Kč):
   lepidlo 3 388 − 25 % = 2 541 Kč, hydrostop 6,6 m² = 2 244 Kč, adhezní můstek = 0 Kč … **materiál celkem 16 088 Kč**.
4. **Cestovné** 2 100 Kč.
5. Součet ručně, opravy přeškrtáním, žádná kopie u zákazníka, faktura se píše znovu.

Aplikace dělá totéž, ale plochy počítá sama, ceny bere z ceníku, součty a slevy jsou vždy správně, zákazník dostane
odkaz na nabídku, kterou jedním klikem přijme, z přijaté nabídky je zakázka a ze zakázky faktura s QR platbou.

## 1. Účty, uživatelé, role

- **Firma** (`Account`, tenant) = obkladač nebo parta; jeden uživatel může být ve více firmách (přepínač).
  Data firmy jen přes `s.scoped(ctx)` / `inAccount`; cizí záznam = 404.
- Role: `owner` (vlastník), `admin` (kancelář — vše kromě odebrání vlastníka), `worker` (parťák — vidí zakázky
  bez cen, nahrává fotky, mění stav zakázky; nevidí nabídky, faktury, ceník).
- Přihlášení e-mailem a heslem (cookie session), osobní API tokeny `tc_…`, OAuth pro MCP klienty.
- Registrace firmy kódem (`TILECRAFT_SIGNUP_CODE` nebo jednorázový kód od superadmina na `/admin`).

## 2. Firma — nastavení

IČO, DIČ, adresa, telefon, e-mail, bankovní účet/IBAN, logo, vlastní SMTP/Gmail.
- `vat_payer` — plátce DPH (výchozí **ne**). Neplátce: ceny jsou konečné, doklady bez DPH s textem „Nejsem plátce DPH.“
- `default_vat_rate` — výchozí sazba pro plátce: **12 %** (oprava a údržba bytů a rodinných domů), lze 21 % / 0 % (PDP).
- `quote_valid_days` (30), `quote_intro` (úvodní text nabídky), `quote_terms` (podmínky — záruka, platba, …).
- `invoice_due_days` (14), `invoice_text` (poznámka na fakturu).
- Číselné řady: nabídky `NA26001`, zakázky `ZA26001`, faktury `26001` (`Counter`, per firma a rok).

## 3. Zákazníci (`Customer`)

Jméno / firma, IČO, DIČ, e-mail, telefon, fakturační adresa, poznámka. Adresa stavby je u nabídky/zakázky
(zákazník může mít víc stavenišť). Zákazník se nepřihlašuje — dostává odkazy (§5.4).

## 4. Ceník (`CatalogItem`)

Položky, ze kterých se skládá nabídka:

| pole | význam |
|---|---|
| `kind` | `work` (práce), `material` (materiál), `other` (doprava, likvidace odpadu, pronájem…) |
| `code`, `name` | kód a název („Montáž obkladu“, „Lepidlo Codex CX9 25 kg“) |
| `unit` | `m2`, `bm`, `ks`, `hod`, `kpl`, `bal`, `kg`, `l`, `km` |
| `price` | prodejní cena za jednotku (haléře; u plátce bez DPH) |
| `purchase_price` | nákupní cena (pro marži, volitelně) |
| `discount` | výchozí sleva v % (sleva dodavatele u materiálu, 25 = −25 %) |
| `measure` | odkud se bere množství ze zaměření (§5.2): `""` ručně, `floor`, `wall`, `area` (podlahy + stěny), `perimeter` (obvod podlah), `length` (délkové prvky) |
| `waste` | prořez v % přičtený k množství ze zaměření (obklad +10 %) |
| `active`, `position` | vyřazené položky se v nabídce nenabízejí |

## 5. Nabídka (`Quote`)

Stavy: `draft` (rozpracovaná) → `sent` (odeslaná) → `accepted` / `rejected`; `sent` po `valid_until` je v seznamu
„propadlá“ (odvozeno, ne stav). Přijatou nabídku nelze měnit (změna = nová nabídka nebo úprava zakázky).

Pole: číslo, zákazník, název („Koupelna — Novákovi“), adresa stavby, datum vystavení, platnost do,
úvod, poznámka, **zaměření** (§5.1), **řádky** (§5.3), sazba DPH, veřejný token, odesláno/rozhodnuto kdy,
vyjádření zákazníka, vytvořená zakázka.

### 5.1 Zaměření

`rooms[]` → `{name, surfaces[]}`, plocha `surface = {name, kind, width, height, count, area, deductions[]}`:

- `kind`: `floor` (podlaha), `wall` (stěna), `length` (délkový prvek: lišta, sokl, hrana — jen `width` = délka v m),
  `piece` (kusy: vykružování, rohy — `count`).
- Plocha = `width × height × count − Σ odpočty` (okna, dveře, vana: `{name, width, height, count}`), zaokrouhleno na 0,01 m².
  `area` vyplněné ručně má přednost (nepravidelný tvar).
- Obvod podlahy = `2 × (width + height) × count` (pro lišty / sokl / hydroizolační pásku).
- Rozměry v metrech s přesností na cm; mobilní formulář bere i centimetry (`295` → 2,95).

Souhrn zaměření: podlahy m², stěny m², obvod podlah bm, délky bm, kusy — za místnost i celkem.

### 5.2 Množství ze zaměření

Řádek s `measure` (zděděným z ceníku nebo nastaveným ručně) má množství **počítané** ze zaměření:
`floor` / `wall` / `area` / `perimeter` / `length` / `piece`, volitelně jen z vybraných místností (`rooms` = jména místností,
prázdné = všechny), plus `waste` %. Při každé změně zaměření se počítaná množství přepočtou; ruční přepsání
množství `measure` zruší.

### 5.3 Řádky

`{section, catalog_item_id?, name, unit, quantity, unit_price, discount, customer_supplied, measure, rooms, waste, note}`

- `section`: `work` / `material` / `other` — tisk a součty po sekcích (Práce, Materiál, Ostatní).
- Částka řádku = `quantity × unit_price × (1 − discount/100)` **zaokrouhlená na celé Kč** (jako na papíře: 11,52 bm × 60 = 691 Kč),
  `customer_supplied` → 0 Kč (řádek se tiskne s „dodá zákazník“, aby bylo jasné, že s ním počítáme).
- Množství na 2 desetinná místa, peníze v haléřích (`int64`), jednotkové ceny mohou mít haléře.
- Součty: práce, materiál, ostatní, základ, DPH (plátce), **celkem**. Volitelná sleva na celou nabídku v %.

### 5.4 Odeslání a přijetí

- Odeslání e-mailem (PDF v příloze + odkaz) nebo jen zkopírování odkazu (WhatsApp/SMS) → stav `sent`.
- Veřejná stránka `/n/{token}` (bez přihlášení): nabídka v podobě tisku, tlačítka **Přijímám** / **Odmítám**
  s poznámkou a jménem. Přijetí: stav `accepted`, firmě e-mail, nabídka se zamkne. Token je náhodný (128 bit).
- Tisk / PDF: `/print/{slug}/quotes/{id}` (A4, logo, zaměření volitelně, sekce, podmínky).

### 5.5 Kopie

„Duplikovat“ udělá novou rozpracovanou nabídku (varianta: dražší obklad, bez materiálu…).

## 6. Zakázka (`Job`)

Vzniká **z přijaté nabídky** (zkopíruje zákazníka, adresu, zaměření a řádky) nebo ručně.
Stavy: `planned` (domluvená) → `in_progress` (realizace) → `done` (hotovo) → `invoiced`; kdykoli `cancelled`.

- Termín od–do (kalendář zakázek), adresa stavby, kontakt na místě, poznámka, přiřazení parťáci.
- **Skutečnost**: řádky zakázky jsou kopie nabídky a upravují se podle reality (víc m², vícepráce).
  Zobrazí se rozdíl proti nabídce.
- **Fotky a soubory** (před / během / po, z mobilu přímo fotoaparátem).
- **Deník**: krátké poznámky s datem (co se udělalo, co chybí) — i od parťáků.
- **Zálohy**: zálohová faktura z části ceny (např. 50 % materiálu předem).

## 7. Faktury (`Invoice`)

- Druh: `invoice` (faktura — daňový doklad), `advance` (zálohová faktura — výzva k platbě, není daňový doklad).
- Vystavení ze zakázky: řádky = řádky zakázky (sekce zachovány; volitelně souhrnně „Práce dle nabídky NA26001“),
  **odečet zaplacených záloh** záporným řádkem (nezaplacená záloha se neodečítá). Ruční faktura bez zakázky také.
- Číslování: faktury `26001`, zálohové faktury `ZF26002` — **jedna řada**, takže variabilní symbol (číslice čísla) je unikátní.
- Pole: číslo (= VS), zákazník (kopie údajů v době vystavení), datum vystavení, DUZP, splatnost, řádky
  `{text, unit, quantity, unit_price, vat_rate}`, celkem, rekapitulace DPH (plátce), zaplaceno dne, poznámka.
- PDF (Go, `internal/invoicepdf`) s QR Platbou (SPAYD), e-mail s PDF, ISDOC export.
- Vystavení konečné faktury → zakázka `invoiced` (smazání faktury vrátí `done`). Zaplacení ručně (datum).

## 8. Přehled (dashboard)

Rozpracované a odeslané nabídky (propadající), zakázky tento a příští týden, neuhrazené a po splatnosti faktury,
tržby měsíce. Na mobilu nahoře velké „+ Nové zaměření“.

## 9. MCP — automatické nabídky s Claudem

`POST /api/mcp` (Streamable HTTP, stateless), OAuth 2.1 (dynamická registrace + PKCE) nebo osobní token.
Nástroj = kurátorovaná operace REST API (stejná práva, validace a role). Popisy nástrojů anglicky.

Typické použití: obkladač vyfotí papírový náčrt nebo nadiktuje „koupelna 2,95 na 1,56, obklad do 2,1, vana 1,7…“
a Claude:
1. `list_catalog` — ceník firmy (ceny, jednotky, `measure`),
2. `find_customers` / `create_customer`,
3. `create_quote` se zaměřením (místnosti, plochy, odpočty) a řádky s odkazy na ceník — množství s `measure`
   dopočítá server, ceny doplní z ceníku,
4. `get_quote` — kontrola součtů, případně `update_quote`,
5. vrátí odkaz na nabídku v aplikaci; odeslání zákazníkovi dělá člověk (Claude nabídky neodesílá).

Nástroje: `list_accounts`, `get_account`, `list_catalog`, `create_catalog_item`, `update_catalog_item`,
`list_customers`, `get_customer`, `create_customer`, `update_customer`, `list_quotes`, `get_quote`, `create_quote`,
`update_quote`, `duplicate_quote`, `preview_measurements` (spočítá plochy bez uložení), `list_jobs`, `get_job`,
`create_job_from_quote`, `update_job`, `add_job_note`, `list_invoices`, `get_invoice`.
Bez mazání, odesílání e-mailů, změn členů a nastavení.

## 10. Technika

Převzato z qwersoft: Go 1.26 (huma v2 na chi, GORM; SQLite lokálně, Postgres v produkci), React 19 + TanStack Router/Query,
Tailwind 4 + shadcn (base-ui), PWA (instalace na telefon), openapi-typescript. Docker image na ghcr.io, nasazení Portainer
+ Traefik (`deploy/docker-compose.yml`), denní zálohy. Konvence v `CLAUDE.md`.

## 11. Otevřené otázky

1. Plátce DPH? (výchozí neplátce; 12 % / 21 % / přenesená daňová povinnost u firem ve stavebnictví — kód CZ-CPA 41–43
   → PDP, pokud je zákazník plátce a jde o stavební práce.)
2. Parťáci: mají vidět ceny? Evidovat odpracované hodiny pro mzdy?
3. Sklad materiálu (zbytky obkladů, lepidla) — zatím ne.
4. Napojení na účetnictví (Fakturoid/UOL z qwersoft) — zatím ne, ISDOC export stačí?
5. Vzhled nabídky — chce obkladač zaměření (náčrt) v nabídce pro zákazníka, nebo jen řádky? (Teď přepínač „Zobrazit zaměření“.)
6. Odpočet zálohy u plátce: zálohová faktura je výzva k platbě (bez DPH); konečná faktura odečte základ zálohy přepočtený
   sazbou zakázky. Pokud bude potřeba daňový doklad k přijaté platbě, doplnit.
7. Nabídka pro zákazníka-plátce ve stavebnictví (PDP, sazba 0 %) — sazba se volí ručně, text „daň odvede zákazník“ zatím chybí.
