import { FormRow, NativeSelect } from "@/components/common";
import type {
  MailServerState,
  Stored,
} from "@/components/settings/mail-server";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Pole poštovního serveru (Gmail nebo SMTP, odesílatel, DKIM) — Správa aplikace i nastavení firmy. */
export function MailServerFields({
  value: v,
  onChange,
  stored,
  noneLabel,
  disabled,
}: {
  value: MailServerState;
  onChange: (v: MailServerState) => void;
  stored: Stored;
  noneLabel: string;
  disabled?: boolean;
}) {
  const set = <K extends keyof MailServerState>(
    k: K,
    val: MailServerState[K],
  ) => onChange({ ...v, [k]: val });
  const secretHint = (isSet: boolean) =>
    isSet ? "Uloženo. Vyplňte jen pokud ho chcete změnit." : undefined;
  return (
    <div className="grid grid-cols-6 gap-x-4 gap-y-3 max-md:grid-cols-1 max-md:*:col-span-1 max-md:[&>div:empty]:hidden">
      <FormRow label="Odesílat přes" htmlFor="m-mode" className="col-span-2">
        <NativeSelect
          id="m-mode"
          value={v.mode}
          disabled={disabled}
          onChange={(e) =>
            set("mode", e.target.value as MailServerState["mode"])
          }
        >
          <option value="">{noneLabel}</option>
          <option value="gmail">Gmail</option>
          <option value="smtp">Vlastní SMTP server</option>
        </NativeSelect>
      </FormRow>
      {v.mode === "smtp" && (
        <>
          <FormRow label="SMTP server" htmlFor="m-host" className="col-span-2">
            <Input
              id="m-host"
              value={v.host}
              disabled={disabled}
              placeholder="smtp.example.cz"
              onChange={(e) => set("host", e.target.value)}
            />
          </FormRow>
          <FormRow label="Port" htmlFor="m-port">
            <Input
              id="m-port"
              type="number"
              value={v.port}
              disabled={disabled}
              placeholder={v.tls === "tls" ? "465" : "587"}
              onChange={(e) => set("port", e.target.value)}
            />
          </FormRow>
          <FormRow label="Šifrování" htmlFor="m-tls">
            <NativeSelect
              id="m-tls"
              value={v.tls}
              disabled={disabled}
              onChange={(e) => set("tls", e.target.value)}
            >
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS (port 465)</option>
              <option value="none">Bez šifrování</option>
            </NativeSelect>
          </FormRow>
        </>
      )}
      {v.mode !== "" && (
        <>
          <FormRow
            label={v.mode === "gmail" ? "Gmail účet" : "Uživatel"}
            htmlFor="m-user"
            className="col-span-2 col-start-1"
            hint={v.mode === "smtp" ? "Prázdné = bez přihlášení." : undefined}
          >
            <Input
              id="m-user"
              value={v.user}
              disabled={disabled}
              placeholder={v.mode === "gmail" ? "obklady.novak@gmail.com" : ""}
              onChange={(e) => set("user", e.target.value)}
            />
          </FormRow>
          <FormRow
            label={v.mode === "gmail" ? "Heslo aplikace" : "Heslo"}
            htmlFor="m-pw"
            className="col-span-2"
            hint={
              secretHint(stored.password_set) ??
              (v.mode === "gmail"
                ? "Účet Google → Zabezpečení → Dvoufázové ověření → Hesla aplikací (16 znaků)."
                : undefined)
            }
          >
            <Input
              id="m-pw"
              type="password"
              autoComplete="new-password"
              value={v.password}
              disabled={disabled}
              placeholder={stored.password_set ? "••••••••" : ""}
              onChange={(e) => set("password", e.target.value)}
            />
          </FormRow>
          <FormRow
            label="Odesílatel"
            htmlFor="m-from"
            className="col-span-2"
            hint={
              v.mode === "gmail"
                ? "Prázdné = Gmail účet. Jiná adresa musí být v Gmailu nastavená jako alias."
                : "Např. Obklady Novák <info@example.cz>"
            }
          >
            <Input
              id="m-from"
              value={v.from}
              disabled={disabled}
              onChange={(e) => set("from", e.target.value)}
            />
          </FormRow>
        </>
      )}
      {v.mode === "smtp" && !disabled && (
        <>
          <h3 className="col-span-6 mt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            DKIM podpis (nepovinné)
          </h3>
          <FormRow label="Doména" htmlFor="m-dd" className="col-span-2">
            <Input
              id="m-dd"
              value={v.dkimDomain}
              placeholder="example.cz"
              onChange={(e) => set("dkimDomain", e.target.value)}
            />
          </FormRow>
          <FormRow label="Selektor" htmlFor="m-ds" className="col-span-2">
            <Input
              id="m-ds"
              value={v.dkimSelector}
              placeholder="tilecraft"
              onChange={(e) => set("dkimSelector", e.target.value)}
            />
          </FormRow>
          <FormRow
            label="Soukromý klíč (PEM)"
            htmlFor="m-dk"
            className="col-span-6"
            hint={
              secretHint(stored.dkim_key_set) ??
              "RSA alespoň 2048 bitů nebo Ed25519. Všechny tři údaje, nebo žádný."
            }
          >
            <Textarea
              id="m-dk"
              rows={3}
              className="font-mono text-xs"
              value={v.dkimKey}
              placeholder={
                stored.dkim_key_set ? "••••••••" : "-----BEGIN PRIVATE KEY-----"
              }
              onChange={(e) => set("dkimKey", e.target.value)}
            />
          </FormRow>
        </>
      )}
    </div>
  );
}
