// Návody k jednotlivým částem aplikace (stránka Návody). Obsah je jen data — upravujte texty tady.
// Popisky tlačítek a polí pište do [[dvojitých hranatých závorek]]: vykreslí se jako „tlačítko“ (s ikonou z `uiIcons`).
// Texty musí odpovídat skutečnému UI (komponenty v web/src/components a routes/a/$slug); `managers: true` = jen vlastník
// a kancelář (parťák to neuvidí). Odkazy `to` kontroluje test proti routeTree.gen.ts.
import {
  BanknoteIcon,
  BotIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckCheckIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FileDownIcon,
  FileTextIcon,
  HardHatIcon,
  ImagePlusIcon,
  ImageUpIcon,
  ListIcon,
  MailIcon,
  MessageCircleIcon,
  NavigationIcon,
  NotebookPenIcon,
  PackageCheckIcon,
  PencilIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  ReceiptTextIcon,
  RocketIcon,
  RotateCcwIcon,
  RulerIcon,
  SaveIcon,
  SendIcon,
  Settings2Icon,
  SettingsIcon,
  Share2Icon,
  SparklesIcon,
  SquareDashedIcon,
  TagsIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import type { FileRoutesByTo } from '@/routeTree.gen'

export type GuideId = 'zaciname' | 'zamereni' | 'nabidka' | 'odeslani' | 'zakazka' | 'partaci' | 'faktury' | 'cenik' | 'emaily' | 'claude'

/** Stránky aplikace firmy bez dalších parametrů (detail konkrétní nabídky apod. se odkázat nedá). */
export type AppPath = Exclude<Extract<keyof FileRoutesByTo, '/a/$slug' | `/a/$slug/${string}`>, `/a/$slug/${string}$${string}`>

export interface AppLink {
  to: AppPath
  label: string
  search?: Record<string, string>
  /** Jen vlastník a kancelář. */
  managers?: boolean
}

export interface GuideExample {
  title: string
  intro?: string
  rows: { paper: string; app: string }[]
  note?: string
}

export interface GuideSection {
  /** Kotva (#id) na stránce návodu. */
  id: string
  title: string
  managers?: boolean
  text?: string
  steps?: string[]
  tips?: string[]
  warnings?: string[]
  code?: string[]
  example?: GuideExample
}

export interface Guide {
  id: GuideId
  title: string
  /** Jedna věta na kartu v přehledu. */
  summary: string
  icon: LucideIcon
  managers?: boolean
  /** K čemu to je. */
  purpose: string
  /** K čemu to je pro parťáka, když z návodu vidí jen část. */
  workerPurpose?: string
  sections: GuideSection[]
  links: AppLink[]
  related?: GuideId[]
}

/** Ikony vedle popisků [[…]] (stejné jako na tlačítkách v aplikaci). */
export const uiIcons: Record<string, LucideIcon> = {
  '+ Zaměřit': PlusIcon,
  'Nové zaměření': RulerIcon,
  'Nastavení': SettingsIcon,
  'Ceník': TagsIcon,
  'E-maily': MailIcon,
  'Zakázky': HardHatIcon,
  'Přidat místnost': PlusIcon,
  '+ Podlaha': PlusIcon,
  '+ Stěna': PlusIcon,
  '+ Délka': PlusIcon,
  '+ Kusy': PlusIcon,
  'Stěny dokola': PlusIcon,
  'Zadat plochu': SquareDashedIcon,
  'Zadat rozměry': SquareDashedIcon,
  'Duplikovat místnost': CopyIcon,
  'Smazat místnost': Trash2Icon,
  'Uložit': SaveIcon,
  'Uložit nabídku': SaveIcon,
  'Uložit změny': SaveIcon,
  'Přidat obvyklé položky': SparklesIcon,
  'Z ceníku': TagsIcon,
  'Vlastní řádek': PlusIcon,
  '⚙': Settings2Icon,
  'Dodá zákazník (0 Kč)': PackageCheckIcon,
  'Duplikovat': CopyIcon,
  'Odebrat řádek': Trash2Icon,
  'PDF': FileDownIcon,
  '⋮': EllipsisVerticalIcon,
  'Více': EllipsisIcon,
  'Odeslat': SendIcon,
  'Odeslat zákazníkovi': SendIcon,
  'Poslat znovu': SendIcon,
  'E-mailem': MailIcon,
  'Odeslat e-mail': MailIcon,
  'WhatsApp, SMS…': MessageCircleIcon,
  'Označit jako odeslanou': CheckIcon,
  'Kopírovat': CopyIcon,
  'Poslat přes WhatsApp': MessageCircleIcon,
  'Poslat SMS': MessageCircleIcon,
  'Sdílet…': Share2Icon,
  'Stáhnout PDF': FileDownIcon,
  'Přijímám nabídku': ThumbsUpIcon,
  'Odmítám': ThumbsDownIcon,
  'Zákazník přijal': ThumbsUpIcon,
  'Zákazník odmítl': ThumbsDownIcon,
  'Přijato': ThumbsUpIcon,
  'Odmítnuto': ThumbsDownIcon,
  'Vrátit do rozpracovaných': RotateCcwIcon,
  'Stránka pro zákazníka': ExternalLinkIcon,
  'Vytvořit zakázku': HardHatIcon,
  'Zakázka': HardHatIcon,
  'Otevřít zakázku': HardHatIcon,
  'Upravit': PencilIcon,
  'Upravit zakázku': PencilIcon,
  'Upravit položky': PencilIcon,
  'Zahájit práci': PlayIcon,
  'Hotovo': CheckCheckIcon,
  'Vyfakturovat': ReceiptTextIcon,
  'Vrátit na domluvenou': RotateCcwIcon,
  'Vrátit do realizace': RotateCcwIcon,
  'Obnovit zakázku': RotateCcwIcon,
  'Smazat zakázku': Trash2Icon,
  'Vyfotit': CameraIcon,
  'Nahrát': ImagePlusIcon,
  'Zapsat': NotebookPenIcon,
  'Navigovat': NavigationIcon,
  'Zavolat': PhoneIcon,
  'Kalendář': CalendarDaysIcon,
  'Kalendář zakázek': CalendarDaysIcon,
  'Seznam': ListIcon,
  'Zaplaceno': BanknoteIcon,
  'Úhrada': BanknoteIcon,
  'Odeslat e-mailem': MailIcon,
  'Smazat': Trash2Icon,
  'Nová faktura': PlusIcon,
  'Přidat řádek': PlusIcon,
  'Vystavit fakturu': SaveIcon,
  'Nová položka': PlusIcon,
  'Přidat': PlusIcon,
  'Nový zákazník': PlusIcon,
  'Nová nabídka': PlusIcon,
  'Smazat zákazníka': Trash2Icon,
  'Přidat uživatele': PlusIcon,
  'Nahrát logo': ImageUpIcon,
  'Nainstalovat': DownloadIcon,
  'Nainstalovat aplikaci': DownloadIcon,
  'Poslat zkušební e-mail': SendIcon,
  'Zkušební e-mail': SendIcon,
  'Nový token': PlusIcon,
}

export const guides: Guide[] = [
  {
    id: 'zaciname',
    title: 'Začínáme',
    summary: 'Údaje firmy, logo, ceník, parta a aplikace na telefonu.',
    icon: RocketIcon,
    purpose:
      'Než pošlete první nabídku, nastavte jednou údaje firmy (tisknou se na nabídky a faktury), zkontrolujte ceník a přidejte lidi z party. Pak si dejte aplikaci na plochu telefonu — na stavbě se otevře jedním klepnutím.',
    workerPurpose: 'Přihlašovací e-mail a heslo vám dá kancelář. Pak si dejte aplikaci na plochu telefonu — na stavbě se otevře jedním klepnutím jako běžná aplikace.',
    sections: [
      {
        id: 'prihlaseni',
        title: 'Přihlášení a nová firma',
        managers: true,
        steps: [
          'Na přihlašovací stránce zadejte E-mail a Heslo.',
          'Nová firma: klepněte na „Zaregistrujte se“ a vyplňte Registrační kód (pošle ho správce aplikace), Název firmy, Vaše jméno, E-mail a Heslo (aspoň 8 znaků).',
          'Po přihlášení jste na Přehledu. Když patříte do víc firem, přepnete je nahoře v menu (název firmy se šipkami).',
        ],
      },
      {
        id: 'firma',
        title: 'Údaje firmy, účet a DPH',
        managers: true,
        steps: [
          'Otevřete [[Nastavení]] → záložka [[Firma]].',
          'Vyplňte Název firmy, IČO, adresu (Ulice a č. p., Město, PSČ), Telefon, E-mail a případně Web. DIČ jen když jste plátce DPH.',
          'Logo: [[Nahrát logo]] (PNG, JPEG, WebP nebo GIF do 2 MB). Logo se uloží hned a tiskne se na nabídky a faktury.',
          'Bankovní spojení: vyplňte Číslo účtu (např. 123456789/0100) nebo IBAN — stačí jedno. Z něj se na fakturách tvoří QR Platba.',
          'DPH: přepínač [[Jsem plátce DPH]] nechte vypnutý, pokud plátce nejste (doklady pak mají text „Nejsem plátce DPH.“). Plátce zvolí Výchozí sazbu DPH nových nabídek: 12 % (byty a rodinné domy), 21 % nebo 0 % (PDP).',
          'Dole stiskněte [[Uložit změny]].',
        ],
        tips: [
          'Na E-mail firmy chodí zprávy, že zákazník nabídku přijal nebo odmítl. Vyplňte adresu, kterou čtete.',
          'Ve stejné stránce nastavíte i platnost nabídek, úvodní text, podmínky a splatnost faktur — viz návod E-maily a nastavení.',
        ],
        warnings: ['Plátce DPH: ceny v ceníku a v nabídkách se zadávají bez DPH, daň se přičte v součtu.'],
      },
      {
        id: 'cenik',
        title: 'Zkontrolujte ceník',
        managers: true,
        steps: [
          'Nová firma dostane hotový výchozí ceník (práce, materiál, cestovné) s cenami z papírových nabídek.',
          'Otevřete [[Ceník]], klepněte na položku a upravte Prodejní cenu na své ceny. Uložte tlačítkem [[Uložit]].',
          'Co nepoužíváte, smažte nebo vypněte přepínač „Aktivní (nabízí se v nabídkách)“.',
        ],
        tips: ['Položky s „ze zaměření“ dostanou v nabídce množství samy — podrobně v návodu Ceník a zákazníci.'],
      },
      {
        id: 'lide',
        title: 'Parta a kancelář',
        managers: true,
        steps: [
          '[[Nastavení]] → záložka [[Uživatelé]] → [[Přidat uživatele]].',
          'Zvolte Roli, vyplňte E-mail (přihlašovací jméno), Heslo, Jméno, Příjmení a Telefon a potvrďte [[Přidat uživatele]].',
          'E-mail a heslo předejte parťákovi — přihlásí se jimi na svém telefonu.',
          'Kdo už v TileCraftu účet má, dostane pozvánku a do firmy se dostane, až ji přijme.',
        ],
        text: 'Role: Vlastník — vše. Kancelář — vše kromě odebrání vlastníka (nabídky, zakázky, faktury, ceník, nastavení). Parťák — vidí zakázky bez cen, nahrává fotky, píše deník a mění stav zakázky; nabídky, faktury, ceník, zákazníky ani nastavení nevidí.',
        tips: ['Telefon člena party se ukazuje u zakázky, kde je v partě — kancelář mu pak zavolá jedním klepnutím.'],
      },
      {
        id: 'instalace',
        title: 'Aplikace na telefonu',
        text: 'TileCraft se instaluje z prohlížeče (bez obchodu s aplikacemi). Pak se otevírá z ikony na ploše přes celou obrazovku, bez adresního řádku.',
        steps: [
          'Android (Chrome): otevřete tilecraft.svobo.cz a přihlaste se. Dole klepněte na [[Více]] → [[Nainstalovat]] a potvrďte. Když tlačítko chybí, otevřete menu prohlížeče (tři tečky) a zvolte Instalovat aplikaci nebo Přidat na plochu.',
          'iPhone (jen Safari): klepněte dole na Sdílet, sjeďte níž, zvolte Přidat na plochu a potvrďte Přidat.',
          'Počítač: dole v levém menu klepněte na své jméno → [[Nainstalovat aplikaci]] (jen když to prohlížeč umí).',
          'Aplikaci pak otevírejte z ikony na ploše.',
        ],
        tips: ['Když už aplikaci nainstalovanou máte, tlačítko Nainstalovat se neukazuje.', 'Nové verze se stahují samy, nic nemusíte aktualizovat.'],
      },
    ],
    links: [
      { to: '/a/$slug/settings/company', label: 'Nastavení firmy', managers: true },
      { to: '/a/$slug/settings/users', label: 'Uživatelé', managers: true },
      { to: '/a/$slug/catalog', label: 'Ceník', managers: true },
      { to: '/a/$slug/account', label: 'Můj účet' },
    ],
    related: ['cenik', 'emaily', 'partaci'],
  },

  {
    id: 'zamereni',
    title: 'Zaměření na stavbě',
    summary: 'Místnosti, podlahy, stěny, lišty a kusy — plochy se spočítají samy.',
    icon: RulerIcon,
    managers: true,
    purpose:
      'Místo náčrtu na papíře zapíšete rozměry rovnou do telefonu. Aplikace spočítá m² podlah a stěn, obvody a délky v bm i kusy a z těchto čísel pak vezme množství do nabídky. Zaměření je první část nové nabídky.',
    sections: [
      {
        id: 'zacatek',
        title: 'Nové zaměření',
        steps: [
          'Na telefonu klepněte dole uprostřed na [[+ Zaměřit]], na počítači na [[Nové zaměření]] v levém menu.',
          'Otevře se výběr zákazníka: napište jméno nebo telefon a klepněte na něj, nebo zvolte [[Nový zákazník]].',
          'Název nabídky můžete nechat prázdný (doplní se např. „Koupelna — Novák“). Adresa stavby se předvyplní z adresy zákazníka.',
        ],
      },
      {
        id: 'mistnosti',
        title: 'Místnosti',
        steps: [
          'V panelu Zaměření klepněte na [[Přidat místnost]] nebo na rychlou volbu (+ Koupelna, + WC, + Kuchyň…).',
          'Název místnosti přepíšete klepnutím na něj. Každá místnost musí mít jiný název.',
          'Menu [[⋮]] u místnosti: [[Duplikovat místnost]] (třeba dvě stejné koupelny) nebo [[Smazat místnost]].',
        ],
      },
      {
        id: 'plochy',
        title: 'Plochy: podlaha, stěna, délka, kusy',
        text: 'Nová místnost začíná podlahou. Další plochy přidáte tlačítky dole v místnosti [[+ Podlaha]], [[+ Stěna]], [[+ Délka]], [[+ Kusy]]. Druh plochy jde změnit přepínačem Podlaha / Stěna / Délka / Kusy u každé plochy, název plochy přepíšete.',
        steps: [
          'Podlaha: Délka × Šířka (× Počet) → m².',
          'Stěna: Šířka × Výška obkladu (× Počet stejných stěn) → m².',
          'Délka: lišty, sokl, hrany — Délka × Počet → bm.',
          'Kusy: Počet kusů — vykružování, rohy, atypické prvky → ks.',
        ],
        tips: ['Číslo vpravo u plochy je výsledek (m², bm nebo ks) a počítá se hned při psaní.'],
      },
      {
        id: 'cm',
        title: 'Rozměry v metrech i centimetrech',
        text: 'Pole s rozměry berou metry i centimetry. Celé číslo od 10 výš je v centimetrech: 295 → 2,95 m, 80 → 0,80 m. Desetinné číslo nebo číslo pod 10 jsou metry: 2,95 nebo 2.95 → 2,95 m, 3 → 3 m.',
        warnings: ['Pozor na krátké rozměry: 30 znamená 0,30 m (30 cm), ne 30 m. A 5 cm napište jako 0,05.'],
      },
      {
        id: 'steny-dokola',
        title: 'Stěny dokola',
        steps: [
          'Vyplňte u podlahy Délku a Šířku.',
          'Klepněte na [[Stěny dokola]] a zadejte Výšku obkladu (předvyplněno 2,1 m).',
          'Potvrďte [[Přidat stěny]] — přidají se stěny po obvodu podlahy, každý rozměr 2× (u čtvercové podlahy jeden řádek 4×).',
          'Okna, dveře a vanu pak odečtěte u stěn.',
        ],
        tips: ['Když se obkládá jen část stěn (např. jen za vanou), přidejte stěny ručně přes [[+ Stěna]].'],
      },
      {
        id: 'odpocty',
        title: 'Odpočty: dveře, okno, vana',
        steps: [
          'Pod podlahou nebo stěnou je řádek „Odečíst:“ s volbami Dveře (0,8 × 1,97), Okno (0,9 × 1,2), Vana (1,7 × 0,55) a Jiné.',
          'Klepněte na volbu a přepište rozměry na skutečné; Počet = kolik takových otvorů.',
          'Odečtená plocha se ukáže červeně (−1,58 m²) a hned se odečte. Odpočet odeberete tlačítkem s mínusem.',
        ],
        tips: ['Vana = pás stěny, který zakryje vana a neobkládá se. Výšku zadejte podle skutečnosti.'],
      },
      {
        id: 'nepravidelne',
        title: 'Nepravidelný tvar',
        steps: [
          'U podlahy nebo stěny klepněte na [[Zadat plochu]].',
          'Do pole „Plocha (nepravidelný tvar)“ napište m², které jste spočítali sami.',
          'Zpátky na délku × šířku se vrátíte tlačítkem [[Zadat rozměry]].',
        ],
        warnings: [
          'Odpočty se od ručně zadané plochy odečítají dál — zadejte plochu před odečtením otvorů, nebo odpočty smažte.',
          'Podlaha zadaná plochou nemá obvod (nejsou rozměry). Lišty nebo pásku pak změřte jako [[+ Délka]].',
        ],
      },
      {
        id: 'souhrn',
        title: 'Co znamenají čísla v souhrnu',
        text: 'Pod každou místností (a při víc místnostech i „Celkem za všechny místnosti“) je souhrn:',
        steps: [
          'Podlahy — m² všech podlah (po odpočtech).',
          'Stěny — m² všech stěn (po odpočtech oken, dveří, vany).',
          'Obvod podlah — bm po obvodu podlah, 2 × (délka + šířka). Hodí se na hydroizolační pásku, sokl, lišty u podlahy.',
          'Délky — součet ploch druhu Délka v bm (lišty, hrany).',
          'Kusy — součet ploch druhu Kusy.',
        ],
        tips: ['Z těchto čísel berou množství řádky nabídky „ze zaměření“. Když zaměření opravíte, množství se přepočítají.'],
      },
      {
        id: 'ulozit',
        title: 'Uložení',
        steps: [
          'Na telefonu je dole lišta s cenou celkem a tlačítkem [[Uložit]]; na počítači vpravo [[Uložit nabídku]].',
          'Zaměření se uloží jako rozpracovaná nabídka s číslem (NA…). Pak doplníte položky — viz návod Nabídka.',
        ],
        warnings: ['Když chcete odejít bez uložení, aplikace se zeptá. Na stavbě ukládejte průběžně.'],
      },
    ],
    links: [
      { to: '/a/$slug/quotes/new', label: 'Nové zaměření' },
      { to: '/a/$slug/quotes', label: 'Nabídky' },
    ],
    related: ['nabidka', 'cenik'],
  },

  {
    id: 'nabidka',
    title: 'Nabídka',
    summary: 'Položky z ceníku, množství ze zaměření, slevy, součty, PDF.',
    icon: FileTextIcon,
    managers: true,
    purpose:
      'Nabídka = zaměření + řádky Práce, Materiál a Ostatní. Ceny se berou z ceníku, množství ze zaměření, součty a slevy jsou vždy správně. Hotovou nabídku pošlete zákazníkovi odkazem nebo jako PDF.',
    sections: [
      {
        id: 'hlavicka',
        title: 'Zákazník a stavba',
        steps: [
          'Panel Zákazník a stavba: Zákazník, Název nabídky, Adresa stavby.',
          'Rozbalte „Datum, platnost, sleva“ (u plátce „…, DPH“): Vystaveno, Platnost do, Sleva na celou nabídku a u plátce Sazba DPH (12 % byty a domy / 21 % / 0 % přenesená daň.).',
        ],
        tips: ['Platnost do se předvyplní podle nastavení firmy (výchozí 30 dní).'],
      },
      {
        id: 'polozky',
        title: 'Položky z ceníku a vlastní řádky',
        steps: [
          'Když je zaměření hotové, objeví se nahoře v Položkách nabídka [[Přidat obvyklé položky]] — přidá všechny položky ceníku „ze zaměření“, jejichž plochu jste změřili (obklad, dlažba, páska…). Jedno klepnutí a většina nabídky je hotová.',
          'Další položky: v sekci Práce, Materiál nebo Ostatní klepněte na [[Z ceníku]], vyhledejte položku a klepněte na ni (jde přidat víc najednou), pak [[Hotovo]].',
          'Co v ceníku není: [[Vlastní řádek]] a vyplňte název, Množství, Jedn., Cenu / jedn. a případně Slevu.',
        ],
      },
      {
        id: 'mnozstvi',
        title: 'Množství ze zaměření, nebo ručně',
        text: 'Řádek „ze zaměření“ má u množství ikonu pravítka a podbarvené pole. Množství se počítá ze zaměření a přepočítá se při každé jeho změně.',
        steps: [
          'Když do takového pole napíšete jiné číslo, řádek se přepne na ruční množství a zaměření už nesleduje.',
          'Zpátky (nebo jinak) to nastavíte v podrobnostech řádku: tlačítko [[⚙]] → Množství: „Zadané ručně“ nebo „Ze zaměření: podlahy / stěny / podlahy + stěny / obvod podlah / délky / kusy“.',
          'Při víc místnostech vyberete v „Z místností“, ze kterých místností se má počítat (Všechny nebo jen některé).',
        ],
        warnings: ['Přepsané množství se už se zaměřením nemění. Aby se zase počítalo, zvolte v [[⚙]] znovu „Ze zaměření“.'],
      },
      {
        id: 'prorez',
        title: 'Prořez',
        text: 'U řádku ze zaměření nastavíte v [[⚙]] Prořez v % — přičte se k změřenému množství (obklad a dlažba typicky +10 %). Výchozí prořez se bere z ceníku.',
      },
      {
        id: 'slevy',
        title: 'Slevy a „dodá zákazník“',
        steps: [
          'Sleva u řádku (v %) — např. sleva dodavatele na lepidlo −25 %. Výchozí slevu má položka v ceníku.',
          'V [[⚙]] zapněte [[Dodá zákazník (0 Kč)]] u materiálu, který si kupuje zákazník — řádek zůstane v nabídce s textem „dodá zákazník“ a za 0 Kč.',
          'Sleva na celou nabídku (v %) je v hlavičce v „Datum, platnost, sleva“.',
        ],
      },
      {
        id: 'soucty',
        title: 'Sekce a součty',
        text: 'Každá sekce (Práce, Materiál, Ostatní) má svůj mezisoučet. Na počítači je vpravo panel Součty, na telefonu dole lišta „Celkem · rozpis“ — klepnutím ji rozbalíte. Rozpis: Práce, Materiál, Ostatní, při slevě Mezisoučet a Sleva, u plátce Základ bez DPH a DPH, nakonec Celkem (s DPH).',
        tips: [
          'Částka řádku se zaokrouhluje na celé koruny jako na papíře (14,11 m² × 650 = 9 172 Kč).',
          'Pořadí řádků změníte v [[⚙]] tlačítky Nahoru / Dolů, řádek zkopírujete [[Duplikovat]], smažete [[Odebrat řádek]].',
        ],
      },
      {
        id: 'texty',
        title: 'Texty nabídky',
        text: 'Panel Texty nabídky: Úvod (tiskne se nad položkami), Poznámka (termín, co zajistí zákazník…) a Podmínky (záruka, platba). Úvod a Podmínky se předvyplní z nastavení firmy.',
      },
      {
        id: 'pdf',
        title: 'Zaměření pro zákazníka, PDF a varianty',
        steps: [
          'Přepínač [[Ukázat zákazníkovi]] v panelu Zaměření přidá rozměry místností na stránku pro zákazníka i do PDF.',
          '[[PDF]] otevře nabídku k tisku nebo stažení (na telefonu v menu [[⋮]]). Neuložené změny se nejdřív uloží.',
          '[[Duplikovat]] vytvoří novou rozpracovanou kopii — varianta s dražším obkladem, bez materiálu apod.',
        ],
      },
      {
        id: 'priklad',
        title: 'Příklad: koupelna z papíru',
        example: {
          title: 'Jak papírová nabídka koupelny vypadá v aplikaci',
          intro: 'Papírová nabídka (zaměření, Práce, Materiál, Cestovné) a kde je to samé v TileCraftu:',
          rows: [
            { paper: 'Náčrt koupelny, stěna 2,95 × 2,1 = 6,2 m²', app: 'Místnost Koupelna, plocha Stěna: Šířka 295, Výška 210 → 6,2 m² (nebo [[Stěny dokola]] z podlahy)' },
            { paper: 'Podlaha 4,6 m²', app: 'Plocha Podlaha s délkou a šířkou → v souhrnu Podlahy 4,6 m²' },
            { paper: 'Lišta 7,96 + 1,85 + 2,06 + 0,98 bm', app: 'Čtyři plochy druhu Délka (Lišta) → Délky 12,85 bm' },
            { paper: '14 vykružování', app: 'Plocha Kusy, Počet kusů 14' },
            { paper: 'Montáž pancéřového pletiva 4,6 m² × 150 = 690 Kč', app: 'Řádek z ceníku „Montáž pancéřového pletiva“ — ze zaměření: podlahy' },
            { paper: 'Obklad 14,11 m² × 650 = 9 172 Kč', app: '„Montáž obkladu, spárování, silikon“ — ze zaměření: stěny (po odpočtu dveří a vany)' },
            { paper: 'Vykružování 14 × 85 = 1 190 Kč', app: '„Vykružování otvorů“ — ze zaměření: kusy' },
            { paper: 'Stržení korku 7 hod × 400 = 2 800 Kč', app: '„Bourání, stržení původní krytiny…“ — ručně zadané množství 7 hod' },
            { paper: 'Práce celkem 22 256 Kč', app: 'Mezisoučet sekce Práce' },
            { paper: 'Lepidlo 3 388 − 25 % = 2 541 Kč', app: '„Lepidlo Codex CX9 25 kg“ 2 bal × 1 694 Kč, Sleva 25 %' },
            { paper: 'Hydrostop 6,6 m² = 2 244 Kč', app: '„Hydroizolační stěrka Codex Hydrostop“ 6,6 m² × 340 Kč (ručně)' },
            { paper: 'Adhezní můstek = 0 Kč', app: 'Řádek s [[Dodá zákazník (0 Kč)]] — tiskne se „dodá zákazník“' },
            { paper: 'Materiál celkem 16 088 Kč', app: 'Mezisoučet sekce Materiál' },
            { paper: 'Cestovné 2 100 Kč', app: 'Ostatní: „Cestovné“ 175 km × 12 Kč' },
            { paper: 'Součet ručně, opravy přeškrtáním', app: 'Celkem 40 444 Kč spočítá aplikace; opravíte číslo a vše se přepočítá' },
          ],
          note: 'Nejrychlejší postup: změřit místnost, klepnout na [[Přidat obvyklé položky]], doplnit bourání, lepidlo, hydrostop a cestovné přes [[Z ceníku]], u materiálu od zákazníka zapnout „dodá zákazník“.',
        },
      },
    ],
    links: [
      { to: '/a/$slug/quotes', label: 'Nabídky' },
      { to: '/a/$slug/quotes/new', label: 'Nové zaměření' },
      { to: '/a/$slug/catalog', label: 'Ceník' },
    ],
    related: ['zamereni', 'odeslani', 'cenik'],
  },

  {
    id: 'odeslani',
    title: 'Odeslání a přijetí nabídky',
    summary: 'E-mail nebo odkaz přes WhatsApp, zákazník přijme jedním klepnutím.',
    icon: SendIcon,
    managers: true,
    purpose:
      'Zákazník dostane odkaz na svou nabídku. Prohlédne si ji na telefonu, stáhne PDF a klepnutím ji přijme nebo odmítne — vy to hned vidíte v aplikaci. Domluvu po telefonu zapíšete ručně.',
    sections: [
      {
        id: 'email',
        title: 'Odeslat e-mailem',
        steps: [
          'V nabídce klepněte na [[Odeslat]] (na telefonu menu [[⋮]] → [[Odeslat zákazníkovi]]).',
          'Zvolte [[E-mailem]], zkontrolujte Komu a případně napište Zprávu (nepovinné).',
          'Klepněte na [[Odeslat e-mail]]. Zákazník dostane PDF v příloze a odkaz s cenou a platností. Nabídka je teď Odeslaná.',
        ],
        warnings: ['Když je odesílání e-mailů vypnuté, okno to napíše: e-mail se jen uloží na stránku E-maily a zákazníkovi nepřijde. Pošlete pak odkaz přes WhatsApp nebo SMS.'],
      },
      {
        id: 'odkaz',
        title: 'Poslat odkaz přes WhatsApp nebo SMS',
        steps: [
          '[[Odeslat]] → záložka [[WhatsApp, SMS…]].',
          'U rozpracované nabídky nejdřív [[Označit jako odeslanou]] — odkaz začne fungovat až potom.',
          'Pak [[Poslat přes WhatsApp]], [[Sdílet…]] (na telefonu, nabídne všechny aplikace) nebo [[Poslat SMS]]. Text zprávy s cenou a odkazem se předvyplní. Odkaz jde i [[Kopírovat]].',
          'Okno zavřete [[Hotovo]]. Odkaz najdete později v liště nabídky ([[Poslat znovu]]) nebo v „Odkaz: stránka pro zákazníka“.',
        ],
      },
      {
        id: 'zakaznik',
        title: 'Co vidí a dělá zákazník',
        steps: [
          'Odkaz otevře stránku bez přihlášení: vaše logo a kontakt, položky po sekcích, součty, Poznámka, Podmínky a (když jste zapnuli) Zaměření.',
          'Tlačítkem [[Stáhnout PDF]] si stáhne nabídku. V PDF je QR kód, který vede na stejnou stránku.',
          'Dole má [[Odmítám]] a [[Přijímám nabídku]]. Vyplní Vaše jméno a Vzkaz nebo Důvod (nepovinné) a potvrdí.',
        ],
        tips: ['Jak stránka vypadá, uvidíte v nabídce přes [[⋮]] → [[Stránka pro zákazníka]].'],
      },
      {
        id: 'rozhodnuti',
        title: 'Když zákazník rozhodne',
        steps: [
          'Nabídka se přepne na Přijatá nebo Odmítnutá, nahoře uvidíte kdy, jméno a vzkaz.',
          'Na E-mail firmy (Nastavení → Firma) přijde zpráva — pokud odesílání e-mailů funguje.',
          'Rozhodnutá nabídka je zamčená, nejde měnit. U přijaté klepněte na [[Vytvořit zakázku]].',
        ],
      },
      {
        id: 'telefon',
        title: 'Zákazník souhlasil po telefonu',
        steps: [
          'V nabídce menu [[⋮]] → [[Zákazník přijal]] (nebo [[Zákazník odmítl]]).',
          'Napište Poznámku (např. „Domluveno telefonicky“) a potvrďte [[Přijato]] / [[Odmítnuto]].',
        ],
        tips: ['[[Vytvořit zakázku]] jde i rovnou z neodeslané nebo odeslané nabídky — nabídka se tím sama označí jako přijatá.'],
      },
      {
        id: 'zpet',
        title: 'Změna po rozhodnutí',
        steps: [
          '[[Vrátit do rozpracovaných]] vrátí rozhodnutou (i odeslanou) nabídku do rozpracovaných — jde jen, dokud z ní není zakázka.',
          'Nebo [[Duplikovat]] a poslat zákazníkovi novou nabídku.',
          'Když už zakázka existuje, změny (vícepráce, jiná množství) dělejte v zakázce.',
        ],
        warnings: ['Rozpracovaná nabídka nemá funkční odkaz. Po vrácení ji zákazníkovi pošlete znovu.'],
      },
      {
        id: 'platnost',
        title: 'Platnost nabídky',
        text: 'Platnost do = datum vystavení + počet dní z nastavení firmy. Odeslaná nabídka po tomto dni je v seznamu „Propadlá“ a zákazník ji už nemůže přijmout (vidí „Platnost nabídky vypršela“).',
        steps: ['Prodloužení: otevřete nabídku, v „Datum, platnost, sleva“ změňte Platnost do a [[Uložit]]. Stejný odkaz pak zase funguje.'],
        warnings: ['Odeslanou nabídku můžete dál upravovat a zákazník na odkazu uvidí vždy aktuální verzi. Po větší změně mu dejte vědět.'],
      },
    ],
    links: [
      { to: '/a/$slug/quotes', label: 'Odeslané nabídky', search: { state: 'sent' } },
      { to: '/a/$slug/emails', label: 'E-maily' },
    ],
    related: ['nabidka', 'zakazka', 'emaily'],
  },

  {
    id: 'zakazka',
    title: 'Zakázka',
    summary: 'Termín, parta, stav, fotky, deník a skutečná množství.',
    icon: HardHatIcon,
    managers: true,
    purpose:
      'Zakázka je práce, kterou zákazník objednal. Vzniká z nabídky a má termín, partu, fotky ze stavby a deník. Položky upravíte podle skutečnosti a z hotové zakázky vystavíte fakturu.',
    sections: [
      {
        id: 'vznik',
        title: 'Zakázka z nabídky',
        steps: [
          'V přijaté nabídce klepněte na [[Vytvořit zakázku]] (na telefonu dole [[Zakázka]] nebo v menu [[⋮]]).',
          'Zakázka převezme zákazníka, adresu stavby, zaměření i položky a dostane číslo ZA….',
          'Z nabídky se do zakázky dostanete tlačítkem [[Otevřít zakázku]].',
        ],
        tips: ['Zakázka se v aplikaci zakládá jen z nabídky. I pro malou práci udělejte krátkou nabídku.'],
      },
      {
        id: 'termin',
        title: 'Termín a parta',
        steps: [
          'V zakázce [[Upravit]] (nebo [[⋮]] → [[Upravit zakázku]]).',
          'Vyplňte Začátek a Konec, v Partě klepnutím vyberte lidi, doplňte Kontakt na místě (kdo otevře, klíče u souseda…) a Poznámku.',
          'Potvrďte [[Uložit]].',
        ],
        tips: ['Když klepnete na [[Zahájit práci]] a zakázka nemá začátek, doplní se dnešní datum.'],
      },
      {
        id: 'kalendar',
        title: 'Kalendář',
        steps: [
          'V Zakázkách přepněte [[Seznam]] / [[Kalendář]].',
          'Kalendář ukazuje měsíc po týdnech; zakázka je v každém dni, kdy běží. Šipkami a tlačítkem Dnes se posouváte.',
          'Klepnutím na zakázku ji otevřete. Zakázky bez termínu jsou pod kalendářem.',
          'Záložky nahoře (Otevřené, Domluvené, Probíhá, Hotové, Vyfakturované, Zrušené, Vše) a hledání fungují v seznamu i v kalendáři.',
        ],
      },
      {
        id: 'stavy',
        title: 'Stavy zakázky',
        text: 'Průběh nahoře v zakázce i štítky v seznamu: Domluvená → Probíhá → Hotová → Vyfakturovaná.',
        steps: [
          'Velké tlačítko vždy nabízí další krok: [[Zahájit práci]] → [[Hotovo]] → [[Vyfakturovat]].',
          'Omyl vrátíte malým tlačítkem [[Vrátit na domluvenou]] nebo [[Vrátit do realizace]].',
          'Do stavu Vyfakturováno se zakázka dostane sama po vystavení konečné faktury.',
          'Zrušení: [[⋮]] → Zrušit zakázku; zpět [[Obnovit zakázku]]. [[Smazat zakázku]] jde jen bez faktur (smaže fotky a deník, nabídka zůstane).',
        ],
      },
      {
        id: 'fotky',
        title: 'Fotky ze stavby',
        steps: [
          '[[Vyfotit]] otevře fotoaparát telefonu, [[Nahrát]] vybere fotky z galerie (i video nebo PDF).',
          'Klepnutím na fotku ji zvětšíte přes celou obrazovku.',
          'Smazat jde přes ikonu koše na fotce (parťák jen své fotky).',
        ],
        tips: ['Foťte stav před, během a po práci — hodí se při reklamaci i jako ukázka práce.'],
      },
      {
        id: 'denik',
        title: 'Deník',
        text: 'Do panelu Deník napište, co se udělalo, co chybí, co dovézt; datum je předvyplněné dnešní (jde změnit). Potvrďte [[Zapsat]]. Zápisy jsou seřazené po dnech a se jménem autora — píšou i parťáci.',
      },
      {
        id: 'skutecnost',
        title: 'Skutečná množství a srovnání s nabídkou',
        steps: [
          'V panelu Položky klepněte na [[Upravit položky]].',
          'Upravte zaměření i řádky stejně jako v nabídce (víc m², vícepráce, další materiál). Dole vidíte Celkem a rozdíl „proti uloženému“.',
          'Potvrďte [[Uložit položky]].',
          'Panel Srovnání s nabídkou ukáže Nabídka / Skutečnost / Rozdíl po sekcích. Fakturuje se podle skutečnosti.',
        ],
        warnings: ['Po vyfakturování už položky upravit nejdou.'],
      },
      {
        id: 'kontakt',
        title: 'Na cestě: volat a navigovat',
        text: 'Nahoře v zakázce je tlačítko s telefonem zákazníka (klepnutím voláte) a [[Navigovat]] (otevře mapy s adresou stavby). Telefonní čísla v Kontaktu na místě a u lidí z party jsou také klikací.',
      },
    ],
    links: [
      { to: '/a/$slug/jobs', label: 'Zakázky' },
      { to: '/a/$slug/jobs', label: 'Kalendář zakázek', search: { view: 'calendar' } },
    ],
    related: ['partaci', 'faktury'],
  },

  {
    id: 'partaci',
    title: 'Pro parťáky',
    summary: 'Dnešní práce, zahájení a dokončení, fotky a deník z telefonu.',
    icon: UsersIcon,
    purpose:
      'Parťák má v telefonu, kde se dnes dělá, adresu, telefon na zákazníka a co se má položit. Zapíše začátek a konec práce, nafotí stav a napíše do deníku. Ceny ani faktury nevidí.',
    sections: [
      {
        id: 'dnes',
        title: 'Co mám dnes',
        steps: [
          'Na Přehledu je nahoře „Dnes“ — zakázky, které právě probíhají nebo mají termín na dnešek. Pod tím „Další dny“.',
          'Na kartě zakázky je [[Navigovat]] (mapy na stavbu) a [[Zavolat]] (zákazníkovi).',
          '[[Kalendář zakázek]] ukáže, co je naplánované dál. Všechny zakázky firmy najdete v [[Zakázky]].',
        ],
      },
      {
        id: 'prace',
        title: 'Začít a skončit práci',
        steps: [
          'Otevřete zakázku a klepněte na velké tlačítko [[Zahájit práci]].',
          'Když je hotovo, klepněte na [[Hotovo]]. Fakturu vystaví kancelář.',
          'Spletli jste se? Malým tlačítkem [[Vrátit na domluvenou]] nebo [[Vrátit do realizace]] to vrátíte.',
        ],
        tips: ['Zrušit zakázku nebo měnit termín a partu může jen kancelář.'],
      },
      {
        id: 'fotky',
        title: 'Fotky',
        text: '[[Vyfotit]] otevře fotoaparát, [[Nahrát]] vybere fotky z galerie. Foťte stav před, během a po práci. Své fotky můžete smazat ikonou koše.',
      },
      {
        id: 'denik',
        title: 'Deník',
        text: 'Napište, co se dnes udělalo a co chybí (např. „chybí 2 lišty, dovézt silikon“), a klepněte na [[Zapsat]]. Kancelář to hned vidí.',
      },
      {
        id: 'ceny',
        title: 'Co parťák vidí a nevidí',
        text: 'Vidíte položky zakázky s množstvím (kolik m² obkladu, dlažby, kolik bm lišt) a zaměření po místnostech. Nevidíte ceny, nabídky, faktury, ceník ani zákazníky. Položky měnit nemůžete — když se něco liší, napište to do deníku.',
      },
    ],
    links: [
      { to: '/a/$slug', label: 'Přehled' },
      { to: '/a/$slug/jobs', label: 'Zakázky' },
      { to: '/a/$slug/jobs', label: 'Kalendář zakázek', search: { view: 'calendar' } },
    ],
    related: ['zaciname'],
  },

  {
    id: 'faktury',
    title: 'Faktury a zálohy',
    summary: 'Zálohová a konečná faktura, QR Platba, úhrady a splatnost.',
    icon: ReceiptTextIcon,
    managers: true,
    purpose:
      'Fakturu nemusíte psát znovu: ze zakázky ji vystavíte jedním klepnutím s položkami i odečtem zaplacených záloh. Faktura má QR Platbu a pošlete ji e-mailem. Ručně napíšete fakturu i bez zakázky.',
    sections: [
      {
        id: 'zaloha',
        title: 'Zálohová faktura',
        steps: [
          'V zakázce v panelu Faktury klepněte na [[Zálohová faktura]].',
          'V okně Vystavit fakturu je nahoře zvolená Zálohová faktura. Vyberte [[Procentem]] (rychlé volby 30 % a 50 %) nebo [[Částkou]] v Kč.',
          'Zkontrolujte „Záloha k úhradě“ a Datum vystavení a klepněte na [[Vystavit]].',
        ],
        tips: [
          'Záloha má číslo ZF… a je to výzva k platbě, ne daňový doklad (u plátce bez DPH).',
          'Zálohu jde vystavit kdykoli před konečnou fakturou, i u domluvené zakázky.',
        ],
      },
      {
        id: 'konecna',
        title: 'Konečná faktura',
        steps: [
          'Když je zakázka Hotovo, klepněte na [[Vyfakturovat]] a zvolte [[Konečná faktura]].',
          'Položky faktury: [[Rozepsat po položkách]] (každý řádek zakázky s cenou; „dodá zákazník“ se vynechá) nebo [[Souhrnně po sekcích]] (jeden řádek za Práci, Materiál a Ostatní).',
          'Klepněte na [[Vystavit]]. Zakázka se přepne do stavu Vyfakturovaná.',
        ],
        warnings: [
          'Odečtou se jen ZAPLACENÉ zálohy (záporný řádek „Odečet zálohy … (zaplacené …)“). Záloha označená „zatím nezaplaceno“ se neodečte, i když je v okně vypsaná — nejdřív u ní zapište úhradu.',
          'Zakázka může mít jen jednu konečnou fakturu.',
        ],
      },
      {
        id: 'rucni',
        title: 'Ruční faktura',
        steps: [
          'Faktury → [[Nová faktura]].',
          'Druh (Faktura / Zálohová faktura), Zákazník, Zakázka (nepovinné), Datum vystavení, DUZP a Splatnost (prázdné = podle nastavení).',
          'Položky: [[Přidat řádek]] — Text, Množství, jednotka, cena (u plátce i sazba DPH). Záporná cena = odpočet.',
          'Poznámka na faktuře se předvyplní z nastavení. Klepněte na [[Vystavit fakturu]].',
        ],
      },
      {
        id: 'cisla',
        title: 'Číslování',
        text: 'Faktury i zálohy mají jednu číselnou řadu: rok + pořadí (26001, 26002…), zálohy s předponou ZF (ZF26002). Variabilní symbol = číslice čísla, proto se nikdy neopakuje. Počet číslic pořadí nastavíte v Nastavení → Firma → Faktury.',
      },
      {
        id: 'qr',
        title: 'QR Platba',
        text: 'Neuhrazená faktura má na náhledu i v PDF QR Platbu (částka, účet, variabilní symbol) — zákazník ji naskenuje v bankovní aplikaci. Když QR chybí, doplňte Číslo účtu nebo IBAN v Nastavení → Firma.',
      },
      {
        id: 'email',
        title: 'Odeslání e-mailem',
        steps: [
          'Ve faktuře klepněte na [[Odeslat e-mailem]].',
          'Zkontrolujte Komu, případně Zprávu (nepovinná) a klepněte na [[Odeslat]]. PDF jde v příloze, v e-mailu je částka, splatnost, účet a VS.',
          'Pod názvem faktury pak uvidíte „Odesláno … na …“; kopie je na stránce E-maily.',
        ],
      },
      {
        id: 'uhrada',
        title: 'Úhrada a splatnost',
        steps: [
          'Když přijdou peníze, klepněte na [[Zaplaceno]], zadejte Zaplaceno dne a [[Uložit]].',
          'Stav faktury: Neuhrazeno, Po splatnosti (červeně), Uhrazeno s datem.',
          'V seznamu faktur filtrujte Vše / Neuhrazené / Po splatnosti / Uhrazené, Všechny / Faktury / Zálohy a rok. Přehled ukazuje Neuhrazeno a Po splatnosti.',
          'Úhradu zapsanou omylem opravíte přes [[Úhrada]] → Zrušit úhradu.',
        ],
      },
      {
        id: 'zmeny',
        title: 'Úpravy a mazání',
        steps: [
          'Neuhrazenou fakturu můžete [[Upravit]] nebo [[Smazat]].',
          'Uhrazenou fakturu nejde měnit ani smazat.',
          'Smazáním konečné faktury se zakázka vrátí do stavu Hotovo. Zálohu odečtenou na jiné faktuře smazat nejde.',
        ],
        warnings: ['Smazaná faktura nechá v číselné řadě mezeru. Mažte jen fakturu vystavenou omylem, která ještě neodešla zákazníkovi — jinak ji raději upravte.'],
      },
    ],
    links: [
      { to: '/a/$slug/invoices', label: 'Faktury' },
      { to: '/a/$slug/invoices', label: 'Po splatnosti', search: { state: 'overdue' } },
      { to: '/a/$slug/invoices/new', label: 'Nová faktura' },
      { to: '/a/$slug/settings/company', label: 'Účet a číslování' },
    ],
    related: ['zakazka', 'emaily'],
  },

  {
    id: 'cenik',
    title: 'Ceník a zákazníci',
    summary: 'Položky ceníku, množství ze zaměření, prořez; adresář zákazníků.',
    icon: TagsIcon,
    managers: true,
    purpose:
      'Z ceníku se skládají nabídky: jednou nastavená cena, sleva a „odkud vzít množství“ ušetří psaní u každé nabídky. Zákazníci jsou adresář s jejich nabídkami, zakázkami a fakturami.',
    sections: [
      {
        id: 'polozka',
        title: 'Položka ceníku',
        steps: [
          'Ceník → [[Nová položka]] (nebo [[Přidat]] u sekce Práce, Materiál, Ostatní). Existující položku otevřete klepnutím.',
          'Druh, Kód (nepovinné), Název, Jednotka (m², bm, ks, hod, kpl, bal, kg, l, km).',
          'Prodejní cena za jednotku (u plátce bez DPH). Nákupní cena je jen pro vás — ukáže marži, zákazník ji nevidí.',
          'Sleva = výchozí sleva řádku (např. sleva dodavatele u materiálu).',
          'Množství v nabídce: „Zadává se ručně“ nebo „Ze zaměření: …“. Prořez (%) jde nastavit jen u položek ze zaměření.',
          'Potvrďte [[Přidat]] nebo [[Uložit]].',
        ],
      },
      {
        id: 'mereni',
        title: 'Odkud brát množství',
        steps: [
          'Obklad, montáž obkladu → ze zaměření: stěny.',
          'Dlažba, montáž dlažby, pancéřové pletivo → podlahy.',
          'Penetrace, adhezní můstek → podlahy + stěny.',
          'Hydroizolační páska, sokl → obvod podlah.',
          'Ukončovací lišty → délky.',
          'Vykružování otvorů → kusy.',
        ],
        tips: ['Položky ze zaměření se v nabídce nabídnou v [[Přidat obvyklé položky]], jakmile je daná plocha změřená.'],
      },
      {
        id: 'vyrazeni',
        title: 'Vyřazení a změna cen',
        steps: [
          'Vypnutý přepínač „Aktivní (nabízí se v nabídkách)“ položku schová z výběru v nabídkách.',
          'Vyřazené položky v ceníku ukáže přepínač Vyřazené (počet).',
          '[[Smazat]]: položka použitá v nabídkách se jen vyřadí.',
        ],
        tips: ['Změna ceny v ceníku nemění už vytvořené nabídky — cena se do nabídky kopíruje.'],
      },
      {
        id: 'zakaznici',
        title: 'Zákazníci',
        steps: [
          'Zákazníci → hledání podle jména, telefonu, e-mailu nebo obce.',
          '[[Nový zákazník]]: Jméno / firma, Telefon, E-mail, Ulice a číslo, PSČ, Obec, u firmy IČO, DIČ a Kontaktní osoba, Poznámka.',
          'Zákazníka založíte i rovnou při novém zaměření.',
        ],
      },
      {
        id: 'detail',
        title: 'Detail zákazníka',
        steps: [
          'Kontakt, seznam nabídek a v Další doklady odkazy na Nabídky, Zakázky a Faktury zákazníka.',
          '[[Nová nabídka]] založí zaměření rovnou pro tohoto zákazníka. [[Upravit]] změní údaje.',
          '[[Smazat zákazníka]] jde jen u zákazníka bez dokladů.',
        ],
        tips: ['Faktura si údaje zákazníka kopíruje v době vystavení — pozdější změna adresy starou fakturu nezmění.'],
      },
    ],
    links: [
      { to: '/a/$slug/catalog', label: 'Ceník' },
      { to: '/a/$slug/customers', label: 'Zákazníci' },
    ],
    related: ['nabidka', 'zamereni'],
  },

  {
    id: 'emaily',
    title: 'E-maily a nastavení',
    summary: 'Kdy e-maily opravdu odcházejí, vlastní Gmail/SMTP, texty a podmínky.',
    icon: MailIcon,
    managers: true,
    purpose:
      'Nabídky a faktury jdou zákazníkům e-mailem z aplikace. Tady zjistíte, jestli opravdu odcházejí, jak je posílat z vlastní adresy a kde nastavit výchozí texty.',
    sections: [
      {
        id: 'kdy',
        title: 'Odchází e-mail opravdu?',
        steps: [
          'Otevřete stránku [[E-maily]]. Pod nadpisem je napsáno, jestli se e-maily zákazníkům odesílají, nebo jen ukládají.',
          'U každého e-mailu je stav: Odesláno, Jen uloženo (odesílání je vypnuté — zákazníkovi nic nepřišlo) nebo Neodesláno (chyba; najetím uvidíte důvod).',
          'Tlačítkem [[Zkušební e-mail]] si pošlete zkoušku.',
        ],
        warnings: ['Dokud e-maily nechodí, posílejte nabídky odkazem přes WhatsApp nebo SMS a faktury jako PDF.'],
      },
      {
        id: 'vlastni',
        title: 'Vlastní Gmail nebo SMTP',
        steps: [
          '[[Nastavení]] → záložka [[E-mail]] → Odesílat přes: Gmail nebo Vlastní SMTP server (výchozí je server aplikace).',
          'Gmail: Gmail účet a Heslo aplikace (Účet Google → Zabezpečení → Dvoufázové ověření → Hesla aplikací, 16 znaků), Odesílatel prázdné = Gmail účet.',
          'SMTP: SMTP server, Port, Šifrování, Uživatel, Heslo a Odesílatel (např. Obklady Novák <info@example.cz>).',
          'Zapněte [[Ostré odesílání]] a klepněte na [[Uložit změny]].',
          'Po uložení vyzkoušejte [[Poslat zkušební e-mail]].',
        ],
        tips: ['Odpovědi zákazníků chodí na E-mail firmy ze záložky Firma.'],
      },
      {
        id: 'texty',
        title: 'Texty nabídek a faktur',
        steps: [
          '[[Nastavení]] → [[Firma]] → panel Nabídky: Platnost nabídky (dní), Úvodní text nabídky, Podmínky (záruka, platba, záloha, co není v ceně).',
          'Panel Faktury: Splatnost (dní), Číslice pořadí v čísle faktury, Poznámka na fakturu (např. zápis v živnostenském rejstříku).',
          '[[Uložit změny]].',
        ],
        tips: ['Výchozí texty se použijí jen u nových nabídek a faktur. Text jedné nabídky upravíte v ní, v panelu Texty nabídky.'],
      },
    ],
    links: [
      { to: '/a/$slug/emails', label: 'E-maily' },
      { to: '/a/$slug/settings/email', label: 'Nastavení e-mailu' },
      { to: '/a/$slug/settings/company', label: 'Nastavení firmy' },
    ],
    related: ['odeslani', 'faktury', 'zaciname'],
  },

  {
    id: 'claude',
    title: 'Claude a automatické nabídky',
    summary: 'Vyfoťte náčrt nebo nadiktujte rozměry — Claude založí nabídku.',
    icon: BotIcon,
    managers: true,
    purpose:
      'Claude (AI asistent) se připojí k vaší firmě v TileCraftu. Pošlete mu fotku papírového náčrtu nebo nadiktujte rozměry a on založí rozpracovanou nabídku z vašeho ceníku. Vy ji zkontrolujete a odešlete.',
    sections: [
      {
        id: 'pripojeni',
        title: 'Připojení v claude.ai, Claude Desktop nebo mobilu',
        steps: [
          'V Claudovi otevřete Nastavení → Konektory → Přidat vlastní konektor.',
          'Jako URL zadejte https://tilecraft.svobo.cz/api/mcp (stejná adresa je v Můj účet → AI asistent (MCP), tlačítko [[Kopírovat]]).',
          'Přihlaste se do TileCraftu a povolte přístup.',
          'Připojené aplikace uvidíte v Můj účet → Připojené aplikace, odpojíte je tlačítkem Odpojit.',
        ],
      },
      {
        id: 'claude-code',
        title: 'Claude Code (příkazová řádka)',
        text: 'Přihlášení přes prohlížeč:',
        code: [
          'claude mcp add --transport http tilecraft https://tilecraft.svobo.cz/api/mcp',
          '# nebo s osobním tokenem (Můj účet → API tokeny):',
          'claude mcp add --transport http tilecraft https://tilecraft.svobo.cz/api/mcp --header "Authorization: Bearer tc_…"',
        ],
      },
      {
        id: 'priklady',
        title: 'Co Claudovi napsat',
        steps: [
          '(fotka papírového náčrtu) „Udělej nabídku pro paní Novákovou, Lipová 8 Brno. Koupelna 2,95 × 1,56, obklad do 2,1, dveře 80 × 197, okno 90 × 60. Obklad a dlažbu si kupuje sama, lepidlo Codex 2 pytle, cestovné 175 km.“',
          '„Co mám tento týden za zakázky?“',
          '„Které faktury jsou po splatnosti?“',
          '„Zapiš do deníku zakázky u Dvořáka, že chybí lišty.“',
          '„Udělej z nabídky NA26003 variantu bez materiálu.“',
        ],
        tips: ['Claude najde nebo založí zákazníka, popíše místnosti jako plochy s odpočty, vezme položky z ceníku (množství ze zaměření dopočítá aplikace) a pošle odkaz na nabídku.'],
      },
      {
        id: 'umi',
        title: 'Co Claude umí a neumí',
        steps: [
          'Umí: číst ceník, zákazníky, nabídky, zakázky, faktury a přehled; zakládat a upravovat zákazníky, položky ceníku a nabídky, dělat kopie nabídek; vytvořit zakázku z nabídky, upravit ji, změnit její stav, zapsat do deníku; zapsat úhradu faktury.',
          'Neumí: nic nemaže, nic neposílá zákazníkům (nabídku odešlete vy), nevystavuje faktury, nemění uživatele ani nastavení.',
        ],
        warnings: ['Nabídku od Clauda vždy otevřete a zkontrolujte rozměry, množství a součty, než ji odešlete.'],
      },
      {
        id: 'tokeny',
        title: 'API tokeny',
        steps: [
          'Můj účet → API tokeny → [[Nový token]].',
          'Název (např. AI asistent na notebooku) a Platnost (dní) — prázdné = neomezeně.',
          'Token (začíná tc_) si hned zkopírujte, znovu už zobrazit nejde.',
          'Nepotřebný token smažte ikonou koše.',
        ],
        warnings: ['Token má stejná oprávnění jako vy ve všech vašich firmách. Nikomu ho neposílejte.'],
      },
    ],
    links: [{ to: '/a/$slug/account', label: 'Můj účet (MCP a tokeny)' }],
    related: ['nabidka', 'zamereni'],
  },
]

/** Návody, oddíly a odkazy podle role: parťák vidí jen to, co není `managers`. */
export function guidesFor(isManager: boolean, list: Guide[] = guides): Guide[] {
  if (isManager) return list
  const visible = list.filter((g) => !g.managers)
  const ids = new Set(visible.map((g) => g.id))
  return visible.map((g) => {
    const sections = g.sections.filter((s) => !s.managers)
    const partial = sections.length < g.sections.length
    return {
      ...g,
      summary: partial ? sections.map((s) => s.title).join(', ') + '.' : g.summary,
      purpose: (partial && g.workerPurpose) || g.purpose,
      sections,
      links: g.links.filter((l) => !l.managers),
      related: g.related?.filter((r) => ids.has(r)),
    }
  })
}

export const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function sectionText(s: GuideSection): string {
  const ex = s.example ? [s.example.title, s.example.intro, s.example.note, ...s.example.rows.flatMap((r) => [r.paper, r.app])] : []
  return [s.title, s.text, ...(s.steps ?? []), ...(s.tips ?? []), ...(s.warnings ?? []), ...ex].filter(Boolean).join(' ')
}

export interface GuideMatch {
  guide: Guide
  /** Oddíly, ve kterých je hledaný text (prázdné = shoda v názvu nebo popisu návodu). */
  sections: GuideSection[]
}

/** Hledání v návodech bez ohledu na diakritiku; všechna slova dotazu musí být v návodu. */
export function searchGuides(list: Guide[], query: string): GuideMatch[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return list.map((guide) => ({ guide, sections: [] }))
  const has = (t: string) => words.every((w) => fold(t).includes(w))
  const out: GuideMatch[] = []
  for (const guide of list) {
    const head = `${guide.title} ${guide.summary} ${guide.purpose}`
    const sections = guide.sections.filter((s) => has(sectionText(s)))
    if (sections.length > 0 || has(head + ' ' + guide.sections.map(sectionText).join(' '))) out.push({ guide, sections })
  }
  return out
}

/** Rozdělí text na obyčejné části a popisky tlačítek: „Klepněte na [[Uložit]]“. */
export function splitLabels(text: string): { text: string; label?: boolean }[] {
  return text.split(/\[\[(.+?)\]\]/).map((t, i) => (i % 2 === 1 ? { text: t, label: true } : { text: t })).filter((p) => p.text !== '')
}
