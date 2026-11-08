// Jednotná chyba API. Backend vrací RFC 9457 problem+json s `code` (internal/api/helpers.go);
// hlášky pro uživatele se odvozují z kódu, ne z anglického `detail`.

export interface ProblemDetail {
  location?: string
  message?: string
}

export interface Problem {
  title?: string
  status?: number
  detail?: string
  code?: string
  errors?: ProblemDetail[] | null
}

export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem

  constructor(status: number, problem: Problem) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }

  get code(): string {
    return this.problem.code ?? ''
  }
}

export const codeMessages: Record<string, string> = {
  already_exists: 'Záznam se stejným označením už existuje.',
  email_taken: 'Tento e-mail už je zaregistrovaný.',
  signup_disabled: 'Zakládání nových firem je vypnuté.',
  signup_code_required: 'Pro založení firmy je potřeba registrační kód.',
  signup_code_invalid: 'Registrační kód není platný, už byl použit nebo vypršel.',
  superadmin_only: 'Tohle může jen správce aplikace.',
  wrong_password: 'Současné heslo není správné.',
  referenced: 'Záznam se používá jinde (např. záloha odečtená na faktuře), nelze ho smazat.',
  quote_locked: 'Nabídka už je rozhodnutá a nejde měnit. Vraťte ji do rozpracovaných nebo ji zduplikujte.',
  job_exists: 'Z nabídky už je vytvořená zakázka.',
  not_accepted: 'Nabídka nebyla přijata, zakázku z ní vytvořit nejde.',
  invoiced: 'Už vyfakturováno: zakázka už má fakturu, nebo je faktura uhrazená (pak ji nejde měnit ani smazat).',
  nothing_to_bill: 'Zakázka nemá žádné položky s cenou, není co fakturovat.',
  conflict: 'Akci teď nejde provést, záznam je v jiném stavu.',
  last_owner: 'Firma musí mít alespoň jednoho vlastníka.',
  password_not_managed: 'Uživatel patří i do jiné firmy nebo ještě nepřijal pozvánku, heslo si mění sám.',
  number_taken: 'Toto číslo dokladu už je použité.',
  quote_expired: 'Platnost nabídky vypršela. Požádejte o novou.',
  no_email: 'Zákazník nemá vyplněný e-mail. Doplňte ho nebo zadejte adresu.',
  email_not_configured: 'Odesílání e-mailů není na serveru nastavené.',
  email_failed: 'E-mail se nepodařilo odeslat. Důvod najdete na stránce E-maily.',
  email_stored: 'E-mail je uložený na stránce E-maily (odesílání je vypnuté).',
  empty_invoice: 'Faktura nemá žádné položky.',
  set_on_server: 'Toto nastavení je dané v prostředí serveru (.env) a tady ho změnit nejde.',
  forbidden: 'K této akci nemáte oprávnění.',
  not_found: 'Záznam nebyl nalezen.',
  too_large: 'Soubor je příliš velký (max. 50 MB).',
  unsupported_media_type: 'Nepodporovaný formát souboru.',
  rate_limited: 'Příliš mnoho pokusů, zkuste to za chvíli.',
  internal: 'Na serveru došlo k chybě. Zkuste to prosím znovu.',
  oauth_invalid_client: 'Aplikace není registrovaná. Zkuste ji připojit znovu.',
  oauth_invalid_redirect: 'Návratová adresa aplikace není povolená.',
  oauth_session_required: 'Aplikace se povolují jen po přihlášení v prohlížeči.',
}

const fieldNames: Record<string, string> = {
  host: 'SMTP server',
  user: 'Uživatel',
  from: 'Odesílatel',
  live: 'Ostré odesílání',
  dkim_domain: 'DKIM',
  dkim_selector: 'Selektor DKIM',
  dkim_key: 'Klíč DKIM',
  password: 'Heslo',
  email: 'E-mail',
  name: 'Název',
  customer_id: 'Zákazník',
  title: 'Název',
  rooms: 'Zaměření',
  surfaces: 'Plocha',
  deductions: 'Odečet',
  catalog_item_id: 'Položka ceníku',
  measure: 'Množství ze zaměření',
  waste: 'Prořez',
  valid_until: 'Platnost do',
  issued_on: 'Datum vystavení',
  taxable_on: 'DUZP',
  due_on: 'Splatnost',
  paid_on: 'Datum úhrady',
  lines: 'Položky',
  quantity: 'Množství',
  unit: 'Jednotka',
  unit_price: 'Jednotková cena',
  price: 'Cena',
  discount: 'Sleva',
  width: 'Šířka',
  height: 'Výška',
  date: 'Datum',
  amount: 'Částka',
  description: 'Popis',
  text: 'Text položky',
  vat_rate: 'Sazba DPH',
  percent: 'Procento',
  job_id: 'Zakázka',
  advance_id: 'Záloha',
  web: 'Web',
  quote_valid_days: 'Platnost nabídky',
  invoice_due_days: 'Splatnost faktur',
  invoice_digits: 'Číslice v čísle faktury',
  default_vat_rate: 'Výchozí sazba DPH',
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/** Česká hláška pro uživatele. */
export function errorMessage(err: unknown): string {
  if (!isApiError(err)) return 'Něco se nepovedlo.'
  if (err.status === 0) return 'Server je nedostupný. Zkontrolujte připojení.'
  if (err.status === 401) return 'Nesprávný e-mail nebo heslo.'
  const fe = err.problem.errors?.find((e) => e.location?.startsWith('body.'))
  if (err.status === 422 && fe) {
    const field = fe.location!.replace(/^body\./, '').replace(/\[\d+\]/g, '')
    const name = fieldNames[field.split('.').pop() ?? ''] ?? field
    return `${name}: ${translate(fe.message ?? '')}`
  }
  const msg = codeMessages[err.code]
  return msg ?? err.problem.detail ?? 'Něco se nepovedlo.'
}

function translate(msg: string): string {
  const t: Record<string, string> = {
    'invalid date range': 'neplatné období',
    'a new user needs a password of at least 8 characters': 'nový uživatel potřebuje heslo (min. 8 znaků)',
    'validity is in the past': 'je v minulosti',
    'invalid e-mail': 'neplatná adresa',
    required: 'je povinné',
    'unknown job': 'neznámá zakázka',
    'unknown advance invoice': 'neznámá zálohová faktura',
    'enter an amount or a percentage': 'zadejte částku nebo procento',
    'YYYY-MM-DD': 'neplatné datum',
    'at least one line': 'zadejte aspoň jednu položku',
    'date YYYY-MM-DD required': 'je povinné',
    'date YYYY-MM-DD expected': 'neplatné datum',
    'invalid date': 'neplatné datum',
    'live sending needs an e-mail server': 'zapněte až s nastaveným serverem pro odesílání',
    'enter the Gmail address': 'zadejte adresu Gmail účtu',
    'enter the SMTP server name': 'zadejte název SMTP serveru',
    'enter the sender, e.g. Obklady Novák <info@example.cz>': 'zadejte odesílatele, např. Obklady Novák <info@example.cz>',
    'invalid private key (PEM, RSA ≥ 2048 bits or Ed25519)': 'neplatný klíč (PEM, RSA alespoň 2048 bitů nebo Ed25519)',
    "invalid DKIM selector (letters, digits, '.', '-', '_')": 'jen písmena, číslice, tečka, pomlčka a podtržítko',
    'fill in the DKIM domain, selector and key together, or none of them': 'vyplňte doménu, selektor i klíč, nebo nic',
    'room names must be unique': 'místnosti musí mít různé názvy',
    'floor, wall, length or piece': 'neznámý druh plochy',
    'dimensions must be positive metres': 'rozměry musí být kladné (v metrech)',
    'a line needs a name or a catalog item': 'řádek potřebuje název',
    'unknown catalog item': 'položka ceníku neexistuje',
    'unknown measure': 'neznámý zdroj množství',
    'required without a measure': 'zadejte množství',
    'out of range': 'mimo rozsah',
    'unknown customer': 'vyberte zákazníka',
    'must not be before issued_on': 'nesmí být před datem vystavení',
    'unknown unit': 'neznámá jednotka',
  }
  return t[msg] ?? msg
}
