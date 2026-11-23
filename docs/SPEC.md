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
- `tier_labels` — názvy 3 cenových tarifů podle velikosti dlažby (§4): výchozí „Malý formát (do 30×30)“, „Standard (do 60×60)“,
  „Velký formát (nad 60×60)“; prázdný název = výchozí.
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
| `tier_prices` | volitelně 3 ceny podle **velikosti dlažby** (tarif 1 malý formát, 2 standard, 3 velký formát; názvy v nastavení §2) — buď žádná, nebo všechny 3 |
| `quick` | **rychlá volba**: položka se nabízí v editoru řádků jako tlačítko „Doplňkové práce“ (přidání jedním klepnutím na mobilu) |
| `active`, `position` | vyřazené položky se v nabídce nenabízejí |

**Velikost dlažby.** Cena pokládky závisí na formátu (mozaika a malé formáty víc spár, velký formát těžší manipulace a rovinnost).
Položka s `tier_prices` dostane v řádku volbu tarifu (§5.3); `price` je cena bez zvolené velikosti (výchozí ceník: standard).
Výchozí ceník: montáž dlažby i obkladu 750 / 650 / 850 Kč/m².

**Doplňkové práce** (výchozí ceník, rychlá volba): vykružování otvorů (ks, ze zaměření kusy), kamenický roh — broušení hrany 45° (bm, ručně),
nika — obklad výklenku (ks, ručně), hydroizolační stěrka (m², ručně), betonování / vyrovnání podlahy (m², podlahy), samostatné spárování
(m², podlahy + stěny). Výchozí ceník dostává jen nová firma (a demo); stávající firmy si položky doplní v ceníku.

## 5. Nabídka (`Quote`)

Stavy: `draft` (rozpracovaná) → `sent` (odeslaná) → `accepted` / `rejected`; `sent` po `valid_until` je v seznamu
„propadlá“ (odvozeno, ne stav). Přijatou nabídku nelze měnit (změna = nová nabídka nebo úprava zakázky).

Pole: číslo, zákazník, název („Koupelna — Novákovi“), adresa stavby, datum vystavení, platnost do,
úvod, poznámka, **zaměření** (§5.1), **řádky** (§5.3), sazba DPH, veřejný token, odesláno/rozhodnuto kdy,
vyjádření zákazníka, vytvořená zakázka, **fotky a kladečský plán** (§6.1 — při navedení zakázky: fotky původního stavu
a kladečský plán, nahrává kancelář).

### 5.1 Zaměření

`rooms[]` → `{name, surfaces[]}`, plocha `surface = {name, kind, width, height, count, area, deductions[], layout?}`
(`layout` = kladečský plán, §5.6):

- `kind`: `floor` (podlaha), `wall` (stěna), `length` (délkový prvek: lišta, sokl, hrana — jen `width` = délka v m),
  `piece` (kusy: vykružování, rohy — `count`).
- Plocha = `width × height × count − Σ odpočty` (okna, dveře, vana: `{name, width, height, count, x?, y?}`), zaokrouhleno na 0,01 m².
  `x`, `y` = poloha odpočtu pro náčrt a kladečský plán (§5.6), na plochu nemají vliv.
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

`{section, catalog_item_id?, name, unit, quantity, unit_price, discount, customer_supplied, measure, rooms, waste, tier, note}`

- `section`: `work` / `material` / `other` — tisk a součty po sekcích (Práce, Materiál, Ostatní).
- Částka řádku = `quantity × unit_price × (1 − discount/100)` **zaokrouhlená na celé Kč** (jako na papíře: 11,52 bm × 60 = 691 Kč),
  `customer_supplied` → 0 Kč (řádek se tiskne s „dodá zákazník“, aby bylo jasné, že s ním počítáme).
- Množství na 2 desetinná místa, peníze v haléřích (`int64`), jednotkové ceny mohou mít haléře.
- `tier`: velikost dlažby 1–3 (0 = bez rozlišení). U položky ceníku s `tier_prices` se jednotková cena bere z tarifu
  (server doplní, když `unit_price` chybí; editor ji přepíše při volbě velikosti), jinak je tarif jen popisek.
  Řádek si ukládá název tarifu v době uložení (`tier_label`) a tiskne ho: v nabídce (PDF, `/n/{token}`) šedým druhým řádkem,
  na faktuře za názvem („Montáž dlažby — Velký formát (nad 60×60)“). Velikost je u řádku, ne u nabídky — podlaha a stěny
  mívají různý formát.
- Editor nabízí nad sekcemi **Doplňkové práce** (položky ceníku s `quick`) — klepnutí přidá řádek z ceníku.
- Součty: práce, materiál, ostatní, základ, DPH (plátce), **celkem**. Volitelná sleva na celou nabídku v %.

### 5.4 Odeslání a přijetí

- Odeslání e-mailem (PDF v příloze + odkaz) nebo jen zkopírování odkazu (WhatsApp/SMS) → stav `sent`.
- Veřejná stránka `/n/{token}` (bez přihlášení): nabídka v podobě tisku, tlačítka **Přijímám** / **Odmítám**
  s poznámkou a jménem. Přijetí: stav `accepted`, firmě e-mail, nabídka se zamkne. Token je náhodný (128 bit).
- **Kladečský plán pro zákazníka**: příloha nabídky v kategorii `plan` s volbou „Ukázat zákazníkovi“ (`shared`) se zobrazí
  na `/n/{token}` (obrázek přes celou šířku, PDF jako odkaz) a v PDF nabídky (každý obrázek na vlastní straně „Kladečský plán“,
  PDF plánu jen jménem s odkazem na online nabídku). Soubor se servíruje přes token: `/api/public/quotes/{token}/files/{id}`
  vrátí jen sdílený plán této (odeslané) nabídky, cokoli jiného (fotky, nesdílený plán, cizí nabídka, rozpracovaná) = 404.
- Tisk / PDF: `/print/{slug}/quotes/{id}` (A4, logo, zaměření volitelně, sekce, podmínky, sdílený kladečský plán).
- **Upravená nabídka** (§6.2) se posílá a přijímá stejně; stránka i PDF ji nadepíšou „Upravená cenová nabídka“,
  uvedou „Aktualizace nabídky NA26001 (částka)“ a řádky navíc označí „navíc“. Přijetí upravené nabídky **nevytváří
  zakázku** (zakázku z ní nejde vytvořit, `revision_quote`), jen zapíše souhlas zákazníka do deníku zakázky
  („Zákazník Jan Novák přijal upravenou nabídku NA26005 (12 345 Kč).“) a firmě přijde e-mail jako u každé nabídky.

### 5.5 Kopie

„Duplikovat“ udělá novou rozpracovanou nabídku (varianta: dražší obklad, bez materiálu…). Fotky a plán se nekopírují.

### 5.6 Kladečský plán (nakreslený)

Obkladač si u podlahy nebo stěny (zadané rozměry, ne plochou) nakreslí rozložení dlaždic. Plán je součást zaměření
(`surface.layout`, ukládá se s nabídkou i zakázkou, kopíruje se s nimi); server ho jen validuje, kreslí a počítá web
(`web/src/lib/tile-layout.ts`, výkres `doc-editor/laying-plan.ts`).

`layout = {tile_w, tile_h (cm), grout (mm), pattern, align_x, align_y, offset_x, offset_y (cm), waste (%), box_m2}`:

- **Dlaždice** šířka × výška ve výkresu (otočení = prohození, žádné zvláštní pole), předvolby 10×10 … 60×120, 20×120.
- **Spára** v mm jen mezi dlaždicemi (u kraje / u otvoru žádná — tam je silikon).
- **Vzor** `straight` (rovně), `half` (na vazbu ½), `third` (na vazbu ⅓); posun vazby je vždy po řadách (vodorovně).
  Diagonála ani rybí kost zatím nejsou.
- **Začátek kladení**: celá „počáteční“ dlaždice (modře) zleva / na střed / zprava a od podlahy / na střed / od stropu
  (podlaha: nahoře / na střed / dole ve výkresu); výchozí stěna na střed od podlahy, podlaha na střed. `offset_x` (doprava)
  a `offset_y` (nahoru) dolaďují v cm.
- **Vycentrovat**: na střed v obou směrech, dlaždice nebo spára na ose — co dá širší krajní řezy (stejné na obou stranách).
  **Optimalizovat řezy**: posun, při kterém je nejužší řez u krajů i u hran otvorů co nejširší (krok 5 mm), pak méně řezů,
  pak souměrnost. Hrana otvoru blíž ke kraji než dlaždice (nadpraží dveří) se nezohlední — zbytek je daný rozměry.
- **Otvory** (odpočty) se kreslí šrafovaně a neobkládají se: dlaždice celá pod otvorem se nepočítá, částečně zakrytá je řezaná.
  Poloha je automatická (dveře a vana dole, vana vlevo, okno s parapetem 0,9 m, jinak na střed) nebo zadaná (`x` zleva,
  `y` od podlahy / u podlahy od horního okraje výkresu) — jen u odpočtu s jedním kusem.
- **Výsledek**: celé / řezané dlaždice na výkresu, nejužší řez, **úzký řez** = zbytek užší než ⅓ dlaždice v daném směru
  (červeně + upozornění). Zbytek mezi otvorem a krajem užší než dlaždice (pruh nad dveřmi) se za úzký nepovažuje.
  Krajní řezy jsou okótované v cm. Nákup: čistá plocha × (1 + prořez; výchozí 10 %, na vazbu 15 %) → m² → kusy dlaždic
  → balení (když je zadané m² v balení). Stěna „× 2“ se kreslí jako dvě stěny (do 4), podlaha × N jednou a počty se násobí.
- **Uložit jako kladečský plán**: uloží zaměření (nabídku / zakázku) a nahraje list celé místnosti jako PNG do příloh,
  kategorie `plan`, soubor `kladecsky-plan-<místnost>.png`; předchozí obrázek téže místnosti se smaže (u zakázky jen vlastní,
  ne soubor převzatý z nabídky). U nabídky přepínač **Ukázat zákazníkovi** (výchozí jako předchozí verze, jinak ano) —
  obrázek se pak ukáže na `/n/{token}` a v PDF nabídky jako každý sdílený plán (§5.4). Přijatá nabídka: jen obrázek.
- Plán kreslí kancelář (editor nabídky, „Upravit položky“ zakázky); parťák vidí obrázek ve fotkách zakázky.
- MCP: `create_quote` / `update_quote` přijímají `layout` a `x`, `y` (schéma z `rooms`), popis zmiňuje, že se nemění plochy.

## 6. Zakázka (`Job`)

Vzniká **z přijaté nabídky** (zkopíruje zákazníka, adresu, zaměření a řádky; fotky a plán nabídky **připojí** — stejné soubory,
nekopírují se) nebo ručně.
Stavy: `planned` (domluvená) → `in_progress` (realizace) → `done` (hotovo) → `invoiced`; kdykoli `cancelled`.

**Etapy** (tak, jak je popisuje obkladač; nahoře na detailu zakázky jako stepper s kontrolním seznamem a tlačítky dalšího kroku,
odvozené ze stavu, nic dalšího se neukládá):

| etapa | stav | kontrolní seznam |
|---|---|---|
| 1. Navedení | `planned` | zaměření, nabídka přijatá (jen kancelář), termín, fotky |
| 2. Zhotovení | `in_progress` | zahájeno, práce a náklady navíc (kolik, „k nacenění“), deník |
| 3. Ukončení | `done` | hotovo, cestovné, upravená nabídka odeslaná / přijatá (jen kancelář), fotky hotové zakázky |
| 4. Faktura | `invoiced` | zálohy, faktura vystavená / zaplacená |

- Termín od–do (kalendář zakázek), adresa stavby, kontakt na místě, poznámka, přiřazení parťáci.
- **Skutečnost**: řádky zakázky jsou kopie nabídky a upravují se podle reality (víc m², vícepráce).
  Zobrazí se rozdíl proti nabídce.
- **Fotky a soubory** po fázích (§6.1), z mobilu přímo fotoaparátem.
- **Deník**: krátké poznámky s datem (co se udělalo, co chybí) — i od parťáků.
- **Zálohy**: zálohová faktura z části ceny (např. 50 % materiálu předem).

### 6.1 Fotky, kladečský plán a soubory (`Attachment`)

Fotky provázejí celou zakázku: navedení (nabídka) → zhotovení → ukončení.

| `category` | | kdy |
|---|---|---|
| `before` | Před | původní stav (navedení zakázky, u nabídky) |
| `during` | Během | foto během zhotovení |
| `after` | Hotovo | foto hotové zakázky |
| `plan` | Kladečský plán | obrázek nebo PDF (u nabídky, lze ukázat zákazníkovi — §5.4) |
| `other` | Ostatní | doklady, cokoli dalšího (i soubory nahrané před zavedením kategorií) |

- Příloha patří k nabídce (`quote_id`), k zakázce (`job_id`) nebo k oběma: vytvoření zakázky z nabídky připojí přílohy nabídky
  k zakázce (tentýž řádek a soubor). Soubor nahraný k nabídce, která už zakázku má, je rovnou i u zakázky. Soubor nahraný
  k zakázce patří jen zakázce (na nabídce se neukazuje).
- Nahrání: `POST …/quotes/{id}/attachments` (jen kancelář, výchozí `before`) a `POST …/jobs/{id}/attachments` (všichni, výchozí
  podle stavu zakázky: `planned` → `before`, `in_progress` → `during`, `done`/`invoiced` → `after`, jinak `other`);
  kategorie v `?category=`. Změna kategorie / sdílení: `PATCH …/attachments/{id}` (parťák jen u vlastních souborů, sdílet
  zákazníkovi smí jen kancelář a jen plán nabídky; přesun mimo `plan` sdílení zruší). Seznam: `GET …/attachments?quote_id=&job_id=&category=`.
- Parťák vidí a nahrává jen soubory zakázek (soubory nabídky bez zakázky jsou pro něj 404), maže jen vlastní; kancelář vše.
- Smazání zakázky smaže její vlastní soubory, soubory nabídky zůstanou u nabídky. Smazání nabídky (bez zakázky) smaže její soubory.
- Na stránce zakázky jsou fotky seskupené po kategoriích, nahrání volí kategorii (předvolená podle stavu); na stránce nabídky
  sekce „Fotky a kladečský plán“ (Před / Kladečský plán / Ostatní).

### 6.2 Práce a náklady navíc, cestovné, upravená nabídka

- **Navíc** = řádek zakázky s `extra: true` (práce, materiál nebo jiný náklad, který v nabídce nebyl). Na zakázce je
  zvlášť ve skupině „Práce a náklady navíc“ (editor položek má dvě skupiny: podle nabídky / navíc), v součtech zakázky
  a na faktuře je normálně. `extras` v detailu zakázky = počet, nenaceněné, částka bez DPH (parťák 0).
- Rychlé zapsání `POST /jobs/{id}/extras` (`{section, name, quantity, unit, unit_price?, note}`) může i **parťák**:
  jeho cena se ignoruje (řádek má cenu 0, do poznámky „zapsal …“, kancelář ho vidí jako „k nacenění“ a nacení v editoru).
  Parťák řádky navíc jen přidává; mění a maže je kancelář. Vyfakturovanou ani zrušenou zakázku měnit nejde.
- **Cestovné** `PUT /jobs/{id}/travel` (kancelář): km jedné cesty × počet cest × cena za km (výchozí z položky ceníku
  „Cestovné“, jinak z dosavadního řádku) nebo paušál (`lump_sum`, 1 kpl); vytvoří nebo přepíše jeden řádek „Cestovné…“
  v sekci Ostatní (`remove` ho odebere). Nový řádek cestovného u zakázky z nabídky je navíc.
- **Upravená nabídka** `POST /jobs/{id}/revised-quote` (kancelář) = nová nabídka (`Quote.job_id` = zakázka) se zaměřením
  a řádky zakázky (příznaky navíc zůstanou), názvem „… – upravená nabídka (vícepráce)“, úvodem „aktualizace nabídky NA…“
  a podmínkami původní nabídky. Rozpracovanou upravenou nabídku další volání jen aktualizuje podle zakázky. Odesílá se
  běžně (§5.4); přijetí nevytváří zakázku. Faktura se dál vystavuje ze zakázky (§7).

## 7. Faktury (`Invoice`)

- Druh: `invoice` (faktura — daňový doklad), `advance` (zálohová faktura — výzva k platbě, není daňový doklad).
- Vystavení ze zakázky: řádky = řádky zakázky (sekce zachovány; volitelně souhrnně „Práce dle nabídky NA26001“),
  **odečet zaplacených záloh** záporným řádkem (nezaplacená záloha se neodečítá). Ruční faktura bez zakázky také.
- Číslování: faktury `26001`, zálohové faktury `ZF26002` — **jedna řada**, takže variabilní symbol (číslice čísla) je unikátní.
- Pole: číslo (= VS), zákazník (kopie údajů v době vystavení), datum vystavení, DUZP, splatnost, řádky
  `{text, unit, quantity, unit_price, vat_rate}`, celkem, rekapitulace DPH (plátce), zaplaceno dne, poznámka.
- PDF (Go, `internal/invoicepdf`) s QR Platbou (SPAYD), e-mail s PDF, ISDOC export.
- **Odkaz pro zákazníka** `/f/{token}` (bez přihlášení, i u zálohové faktury): doklad v podobě tisku, stav úhrady
  (uhrazeno dne / k úhradě do / po splatnosti), velká QR Platba, platební údaje ke zkopírování (účet, VS, částka)
  a „Stáhnout PDF“ (`/api/public/invoices/{token}/pdf`). Token je náhodný (128 bit), každá faktura ho má od vystavení
  (starší faktury ho dostaly migrací); špatný token = 404, smazaná faktura = 404. Stránka neukazuje nic jiného z firmy
  než údaje dodavatele z faktury. E-mail s fakturou obsahuje odkaz (PDF dál v příloze); v detailu faktury
  „Odkaz pro zákazníka“ — kopírovat, WhatsApp, SMS, sdílet. První otevření zákazníkem se zapíše (`viewed_at`,
  „Zákazník otevřel …“); otevření přihlášeným členem firmy se nepočítá.
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
`create_job_from_quote`, `update_job`, `add_job_note`, `list_invoices`, `get_invoice`, `list_attachments` (fotky a plány podle
nabídky/zakázky a kategorie), `get_attachment` (ukáže soubor), `upload_attachment` (nahraje soubor k nabídce nebo zakázce s kategorií;
zákazníkovi ho ukázat neumí),
`add_job_extra`, `set_job_travel`, `create_revised_quote` (jen vytvoří koncept, neodesílá).
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
8. Tarify velikosti dlažby: stačí 3 pevné tarify s přejmenovatelnými názvy, nebo chce obkladač počet a hranice (30×30, 60×60, 120×60…)
   volit sám? Platí tarif i pro obklad, nebo jen pro dlažbu? Výchozí ceny 750 / 650 / 850 Kč/m² jsou odhad — upřesnit.
   Výchozí velikost pro celou nabídku zatím není (každý řádek zvlášť); chtěl by ji?
9. Doplňkové práce: jednotky a ceny (kamenický roh bm, nika ks, betonování m²) jsou odhad; počítá se nika kusem, nebo m² obkladu
   + kamenické rohy? Betonování podle m² podlahy, nebo podle tloušťky (m³)?
10. Kladečský plán ve formátu PDF se do PDF nabídky nevkládá (jen jméno a odkaz na online nabídku) — stačí to, nebo převádět
   na obrázek? Sdílení zákazníkovi je po souborech (`shared`), ne přepínač celé nabídky.
11. Fotky zakázky (během / hotovo) zákazníkovi zatím nijak neukazujeme (např. předávací protokol, odkaz na hotovou práci).
12. Práce navíc (§6.2): má zákazník upravenou nabídku vždy odsouhlasit před fakturou, nebo stačí, že ji dostane? (Teď je to
   jen bod kontrolního seznamu, faktura jde vystavit i bez přijetí.) Mají parťáci zapisovat i hodiny / cenu navíc, nebo jen
   co a kolik? Může parťák své zápisy navíc opravit nebo smazat (teď jen kancelář)?
13. Cestovné: počítá obkladač km tam i zpět za každý den na stavbě, nebo paušál za zakázku? (Teď obojí, km × počet cest.)
   Patří cestovné do první nabídky (pak není „navíc“), nebo se doplňuje až při ukončení?
14. Přijetí upravené nabídky zapisujeme do deníku zakázky pod autorem upravené nabídky (deník potřebuje uživatele).
15. Kladečský plán (§5.6) — otázky na obkladače:
   - Úzký řez: platí pravidlo „ne užší než ⅓ dlaždice“, nebo spíš pevná hranice (např. 5 cm) / ½ dlaždice u velkých formátů?
   - Stěny: chce obvykle celou řadu u podlahy (soklová řada), nebo celou nahoře u stropu / u horní hrany obkladu?
     „Optimalizovat řezy“ teď rozdělí řez nahoru i dolů.
   - Kladení od osy okna / dveří / vany (dlaždice souměrně podle otvoru) — teď jen přes posun nebo optimalizaci.
   - Je potřeba diagonála, rybí kost, vazba na výšku (svislé posuny) nebo dekor / listela v určité výšce?
   - Navazování spár mezi stěnami v rohu (stejná výška řad na všech stěnách) a podlaha ↔ stěna — teď se každá plocha
     nastavuje zvlášť (nová plocha převezme dlaždici z poslední nastavené stejného druhu).
   - Mají se kusy / m² z plánu propsat do řádku materiálu (obklad, dlažba), nebo stačí informace v plánu?
   - Ukazovat plán zákazníkovi po místnostech (teď jeden obrázek na místnost), nebo po plochách?
