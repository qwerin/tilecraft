import { useRef, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap, uploadLogo } from "@/api/client";
import type { Account } from "@/api/types";
import { FormRow, Panel } from "@/components/common";
import { CompanySettings, SettingsForm } from "@/components/settings/company-form";
import { useCompanyForm, type Company, type NumberSetting } from "@/components/settings/use-company-form";
import { Hint, SwitchRow } from "@/components/settings/shared";
import { Segmented } from "@/components/invoices/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/a/$slug/settings/company")({
  component: () => <CompanySettings>{(p) => <CompanyPage {...p} />}</CompanySettings>,
});

function CompanyPage({ slug, account }: { slug: string; account: Account }) {
  const { c, setCo, s, set, nums, setNum, save } = useCompanyForm(slug, account);
  const number = (k: NumberSetting, label: string, suffix: string, hint?: string) => (
    <FormRow label={label} htmlFor={k} hint={hint}>
      <div className="flex items-center gap-2">
        <Input id={k} inputMode="numeric" className="w-24" value={nums[k]} onChange={(e) => setNum(k, e.target.value)} />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </FormRow>
  );
  const year = String(new Date().getFullYear() % 100);
  const digits = Math.min(6, Math.max(3, Number(nums.invoice_digits) || 3));
  const text = (
    k: keyof Company,
    label: string,
    opts: {
      hint?: string;
      className?: string;
      type?: string;
      placeholder?: string;
    } = {},
  ) => (
    <FormRow
      label={label}
      htmlFor={k}
      hint={opts.hint}
      className={opts.className}
    >
      <Input
        id={k}
        type={opts.type}
        value={c[k]}
        placeholder={opts.placeholder}
        onChange={(e) => setCo(k, e.target.value)}
      />
    </FormRow>
  );

  return (
    <SettingsForm onSubmit={() => save.mutate(undefined)} pending={save.isPending}>
      <Panel title="Firma">
        <p className="-mt-1 mb-4 text-xs text-muted-foreground">
          Údaje se tisknou na nabídky a faktury.
        </p>
        <LogoField slug={slug} logo={account.logo} />
        <div className="grid grid-cols-6 gap-x-4 gap-y-3 max-md:grid-cols-1 max-md:*:col-span-1 max-md:[&>div:empty]:hidden">
          {text("name", "Název firmy", { className: "col-span-4" })}
          <div className="col-span-2" />
          {text("registration_no", "IČO", { className: "col-span-2" })}
          {text("vat_no", "DIČ", {
            className: "col-span-2",
            hint: "Jen u plátce DPH",
          })}
          <div className="col-span-2" />
          {text("street", "Ulice a č. p.", { className: "col-span-3" })}
          {text("city", "Město", { className: "col-span-2" })}
          {text("zip", "PSČ", { className: "col-span-1" })}
          {text("phone", "Telefon", { className: "col-span-2", type: "tel" })}
          {text("email", "E-mail", { className: "col-span-2", type: "email" })}
          {text("web", "Web", { className: "col-span-2", placeholder: "www.obklady-novak.cz" })}
        </div>
      </Panel>

      <Panel title="Bankovní spojení">
        <div className="grid grid-cols-6 gap-x-4 gap-y-3 max-md:grid-cols-1 max-md:*:col-span-1 max-md:[&>div:empty]:hidden">
          {text("bank_account", "Číslo účtu", {
            className: "col-span-2",
            placeholder: "123456789/0100",
          })}
          {text("iban", "IBAN", { className: "col-span-3" })}
          {text("swift", "SWIFT / BIC", { className: "col-span-1" })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Z čísla účtu (nebo IBAN) se na fakturách tvoří QR Platba. Stačí vyplnit jedno z nich.
        </p>
      </Panel>

      <Panel title="DPH">
        <SwitchRow
          label="Jsem plátce DPH"
          hint={
            s.vat_payer
              ? "Ceny v ceníku a nabídkách jsou bez DPH, doklady obsahují DPH a rekapitulaci."
              : "Neplátce: ceny jsou konečné, doklady jsou bez DPH s textem „Nejsem plátce DPH.“"
          }
          checked={s.vat_payer}
          onChange={(v) => set("vat_payer", v)}
        />
        {s.vat_payer && (
          <div className="mt-3 flex flex-col gap-3">
            <FormRow label="Výchozí sazba DPH nových nabídek">
              <Segmented
                className="w-full max-w-md"
                value={String(s.default_vat_rate)}
                onChange={(v) => set("default_vat_rate", Number(v))}
                options={[
                  { value: "12", label: "12 %" },
                  { value: "21", label: "21 %" },
                  { value: "0", label: "0 % (PDP)" },
                ]}
              />
            </FormRow>
            <Hint>
              <b className="font-medium text-foreground">12 %</b> — oprava a údržba bytů a rodinných domů (typická koupelna u
              soukromníka). <b className="font-medium text-foreground">21 %</b> — základní sazba (nebytové prostory: kanceláře,
              provozovny, obchody). <b className="font-medium text-foreground">0 % — přenesená daňová
              povinnost</b>: stavební práce pro jiného plátce DPH (CZ-CPA 41–43); daň přizná odběratel, na faktuře je text o
              přenesení. Sazbu lze změnit u každé nabídky.
            </Hint>
          </div>
        )}
      </Panel>

      <Panel title="Nabídky">
        <div className="flex flex-col gap-3">
          {number("quote_valid_days", "Platnost nabídky", "dní", "Datum „platnost do“ nové nabídky.")}
          <FormRow label="Úvodní text nabídky" htmlFor="quote_intro" hint="Předvyplní se do každé nové nabídky.">
            <Textarea
              id="quote_intro"
              rows={3}
              value={s.quote_intro}
              placeholder="Dobrý den, na základě zaměření Vám posíláme nabídku na obklady a dlažbu…"
              onChange={(e) => set("quote_intro", e.target.value)}
            />
          </FormRow>
          <FormRow label="Podmínky" htmlFor="quote_terms" hint="Tisknou se pod nabídku: záruka, platba, záloha, co není v ceně…">
            <Textarea
              id="quote_terms"
              rows={6}
              value={s.quote_terms}
              placeholder={"Záruka na práci 24 měsíců.\nZáloha 50 % na materiál před zahájením prací.\nCena nezahrnuje…"}
              onChange={(e) => set("quote_terms", e.target.value)}
            />
          </FormRow>
        </div>
      </Panel>

      <Panel title="Faktury">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1">
            {number("invoice_due_days", "Splatnost", "dní", "Od data vystavení.")}
            {number(
              "invoice_digits",
              "Číslice pořadí v čísle faktury",
              "(3–6)",
              `Číslo faktury = rok + pořadí, např. ${year}${"1".padStart(digits, "0")}; zálohy ZF${year}${"2".padStart(digits, "0")}.`,
            )}
          </div>
          <FormRow label="Poznámka na fakturu" htmlFor="invoice_text" hint="Předvyplní se do každé nové faktury (např. zápis v živnostenském rejstříku).">
            <Textarea
              id="invoice_text"
              rows={3}
              value={s.invoice_text}
              placeholder="Fyzická osoba zapsaná v živnostenském rejstříku."
              onChange={(e) => set("invoice_text", e.target.value)}
            />
          </FormRow>
        </div>
      </Panel>

    </SettingsForm>
  );
}

/** Logo firmy: ukládá se hned (mimo formulář), tiskne se na nabídky a faktury. */
function LogoField({ slug, logo }: { slug: string; logo: string }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const done = (msg: string) => async () => {
    await qc.invalidateQueries({ queryKey: [slug, "account"] });
    toast.success(msg);
  };
  const upload = useMutation({
    mutationFn: (f: File) => uploadLogo(slug, f),
    onSuccess: done("Logo nahráno"),
  });
  const remove = useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/api/accounts/{slug}/logo", { params: { path: { slug } } }),
      ),
    onSuccess: done("Logo odebráno"),
  });
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Logo může mít nejvýš 2 MB.");
      return;
    }
    upload.mutate(f);
  };
  return (
    <div className="mb-5 flex items-center gap-4">
      <div className="flex h-20 w-48 items-center justify-center rounded-lg border border-dashed bg-white p-2">
        {logo ? (
          <img
            src={logo}
            alt="Logo firmy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-neutral-500">Bez loga</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={pick}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={upload.isPending}
            onClick={() => file.current?.click()}
          >
            <ImageUpIcon /> {logo ? "Změnit logo" : "Nahrát logo"}
          </Button>
          {logo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2Icon /> Odebrat
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP nebo GIF do 2 MB; tiskne se na nabídky a faktury.
        </p>
      </div>
    </div>
  );
}
