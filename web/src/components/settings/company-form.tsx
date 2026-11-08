// Podstránky Nastavení → Firma: obal formuláře (stav a uložení v use-company-form.ts).
import type { FormEvent, ReactNode } from "react";
import { SaveIcon } from "lucide-react";
import type { Account } from "@/api/types";
import { Button } from "@/components/ui/button";
import { useFirm } from "@/hooks/use-firm";

/** Formulář se znovu inicializuje po uložení (nová data účtu); logo se ukládá samostatně a rozepsaný formulář neresetuje. */
export function CompanySettings({
  children,
}: {
  children: (p: { slug: string; account: Account }) => ReactNode;
}) {
  const { slug, account } = useFirm();
  return (
    <div key={JSON.stringify({ ...account, logo: "" })}>
      {children({ slug, account })}
    </div>
  );
}

/** Formulář podstránky s tlačítkem Uložit pod panely. */
export function SettingsForm({
  onSubmit,
  pending,
  children,
}: {
  onSubmit: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex max-w-5xl flex-col gap-4">
        {children}
        <div className="flex justify-end pb-6">
          <Button type="submit" disabled={pending}>
            <SaveIcon /> Uložit změny
          </Button>
        </div>
      </div>
    </form>
  );
}
