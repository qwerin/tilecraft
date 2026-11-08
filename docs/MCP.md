# Claude a TileCraft (MCP)

TileCraft má MCP server na `https://tilecraft.svobo.cz/api/mcp` (Streamable HTTP). Claude přes něj čte ceník a zákazníky
a zakládá nabídky ze zaměření. Nic nemaže a nic neposílá zákazníkům — nabídku zkontrolujete a odešlete v aplikaci.

## Připojení

**claude.ai / Claude Desktop / mobil** — Nastavení → Konektory → Přidat vlastní konektor → URL
`https://tilecraft.svobo.cz/api/mcp`. Přihlásíte se do TileCraftu a povolíte přístup (OAuth). Připojené aplikace
uvidíte a odpojíte v *Můj účet*.

**Claude Code** — s OAuth:

```bash
claude mcp add --transport http tilecraft https://tilecraft.svobo.cz/api/mcp
```

nebo s osobním tokenem (*Můj účet → API tokeny*, začíná `tc_`):

```bash
claude mcp add --transport http tilecraft https://tilecraft.svobo.cz/api/mcp --header "Authorization: Bearer tc_…"
```

Lokální vývoj: `http://localhost:8080/api/mcp` (demo data, token z demo účtu).

## Jak se s tím pracuje

> *(fotka papírového náčrtu)* Udělej nabídku pro paní Novákovou, Lipová 8 Brno. Koupelna 2,95 × 1,56, obklad do 2,1,
> dveře 80 × 197, okno 90 × 60. Obklad a dlažbu si kupuje sama, lepidlo Codex 2 pytle, cestovné 175 km.

Claude:
1. načte ceník (`list_catalog`) a najde nebo založí zákazníka,
2. popíše místnosti jako plochy (podlaha, každá obkládaná stěna = délka × výška obkladu, odpočty dveří/oken/vany),
3. ověří výpočet (`preview_measurements`) a založí rozpracovanou nabídku (`create_quote`) s řádky z ceníku —
   množství obkladu, dlažby, lišt, pásky dopočítá server ze zaměření (včetně prořezu),
4. shrne součty Práce / Materiál / Ostatní a pošle odkaz do aplikace, kde nabídku zkontrolujete a odešlete.

Další dotazy: *„Co mám tento týden za zakázky?“*, *„Které faktury jsou po splatnosti?“*, *„Zapiš do deníku zakázky
u Dvořáka, že chybí lišty“*, *„Udělej z nabídky NA26003 variantu bez materiálu“*.

## Nástroje

`list_accounts`, `get_account`, `list_members`, `list_catalog`, `create_catalog_item`, `update_catalog_item`,
`list_customers`, `get_customer`, `create_customer`, `update_customer`, `preview_measurements`, `list_quotes`, `get_quote`,
`create_quote`, `update_quote`, `duplicate_quote`, `list_jobs`, `get_job`, `create_job_from_quote`, `update_job`,
`set_job_state`, `add_job_note`, `list_invoices`, `get_invoice`, `mark_invoice_paid`, `get_dashboard`,
`get_attachment`, `upload_attachment` (fotka ke zakázce).
