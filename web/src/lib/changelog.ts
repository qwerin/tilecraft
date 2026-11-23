// Novinky pro uživatele (stránka Novinky). Nový záznam patří NAHORU; `id` se už nikdy nemění
// (podle něj se pamatuje přečtení). Položka bez `for` je pro všechny členy firmy,
// 'managers' = jen vlastník a kancelář (parťák ji neuvidí).

export type Audience = 'managers'

export type ChangelogItem = { text: string; for?: Audience }

export type ChangelogEntry = {
  id: string
  date: string // YYYY-MM-DD
  title: string
  items: ChangelogItem[]
}

export const changelog: ChangelogEntry[] = [
  {
    id: '2026-11-23-kladecsky-plan',
    date: '2026-11-23',
    title: 'Kladečský plán nakreslí aplikace',
    items: [
      {
        text: 'U podlahy nebo stěny v zaměření je tlačítko „Kladečský plán“: zadáte formát dlaždic, spáru, vzor (rovně, na vazbu) a odkud se klade — aplikace nakreslí dlaždice s řezy, dveřmi, oknem a vanou a spočítá celé a řezané kusy i kolik koupit.',
        for: 'managers',
      },
      {
        text: 'Úzké řezy (pod ⅓ dlaždice) jsou červeně; „Optimalizovat řezy“ posune dlaždice tak, aby u krajů i kolem otvorů zbyly co nejširší kusy.',
        for: 'managers',
      },
      {
        text: '„Uložit jako kladečský plán“ přidá obrázek celé místnosti do příloh nabídky — zákazník ho uvidí v nabídce i v PDF. U zakázky se plán uloží do fotek a uvidí ho i parťák.',
        for: 'managers',
      },
      { text: 'Nakreslený kladečský plán najdete ve fotkách zakázky v kategorii Kladečský plán.' },
    ],
  },
  {
    id: '2026-11-23-zakazka-od-zamereni-po-fakturu',
    date: '2026-11-23',
    title: 'Zakázka krok za krokem: fotky, práce navíc, upravená nabídka',
    items: [
      { text: 'Nahoře na zakázce je přehled fází Navedení → Zhotovení → Ukončení → Faktura: co je hotové a co zbývá, s tlačítkem na další krok.' },
      {
        text: 'Fotky po fázích: Před, Během, Hotovo, Kladečský plán. „Vyfotit“ otevře rovnou fotoaparát a fotka se uloží podle stavu zakázky (domluvená → Před, probíhá → Během, hotová → Hotovo). Fotky z nabídky se při vzniku zakázky převezmou.',
      },
      { text: 'Práce a náklady navíc: tlačítka „Práce navíc“ a „Materiál / náklad navíc“ na zakázce. Parťák zapíše co a kolik, cenu doplní kancelář.' },
      {
        text: 'Velikost dlažby — 3 cenové tarify (malý formát, standard, velký formát). Ceny tarifů zadáte u položky v Ceníku, názvy v Nastavení → Firma; v nabídce pak velikost vyberete jedním klepnutím u řádku.',
        for: 'managers',
      },
      {
        text: 'Doplňkové práce (vykružování, kamenický roh, nika, hydroizolace, betonování, spárování) přidáte do nabídky jedním klepnutím. Které položky se tam nabízejí, určíte v Ceníku přepínačem „Rychlá volba“ — chybějící položky si do ceníku doplňte.',
        for: 'managers',
      },
      { text: 'Kladečský plán (obrázek nebo PDF) nahrajete k nabídce; přepínačem „Ukázat zákazníkovi“ se zobrazí na jeho stránce i v PDF nabídky.', for: 'managers' },
      {
        text: 'Cestovné na zakázce jedním tlačítkem (km × počet cest, nebo paušál) a upravená nabídka s pracemi navíc: pošlete ji zákazníkovi odkazem, a když ji přijme, zapíše se to do deníku zakázky.',
        for: 'managers',
      },
      {
        text: 'Faktura odkazem: zákazník ji otevře v telefonu, zaplatí přes QR Platbu a stáhne si PDF. Odkaz je v e-mailu s fakturou a tlačítkem „Odkaz pro zákazníka“ ho pošlete i přes WhatsApp nebo SMS; uvidíte, kdy ho zákazník otevřel.',
        for: 'managers',
      },
    ],
  },
  {
    id: '2026-11-08-prvni-verze',
    date: '2026-11-08',
    title: 'První verze TileCraft',
    items: [
      { text: 'Zakázky přehledně na telefonu i na počítači: stav, adresa stavby, fotky z místa.' },
      {
        text: 'Zaměření místností přímo na stavbě, nabídka s cenami z ceníku, odkaz pro zákazníka k přijetí nabídky a faktura s QR platbou.',
        for: 'managers',
      },
      { text: 'Návody k jednotlivým částem aplikace: krok za krokem, s tlačítky tak, jak je vidíte (menu Návody a odkaz „Návod“ v hlavičce stránek).' },
      { text: 'Náčrt místností ze zaměření: podlaha v půdorysu, stěny rozvinuté s dveřmi a okny — kreslí se samo podle zadaných rozměrů.' },
    ],
  },
]

export function changelogFor(isManager: boolean, entries: ChangelogEntry[] = changelog): ChangelogEntry[] {
  const visible = (it: ChangelogItem) => !it.for || isManager
  return entries.map((e) => ({ ...e, items: e.items.filter(visible) })).filter((e) => e.items.length > 0)
}

const SEEN_KEY = 'tilecraft-news-seen'

/** Přečtené novinky (v prohlížeči; bez localStorage se nic nepamatuje). */
export function seenNews(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function markNewsSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seenNews(), ...ids])]))
  } catch {
    // localStorage nedostupný (privátní režim)
  }
}
