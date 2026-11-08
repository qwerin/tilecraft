// Formulář poštovního serveru (Správa aplikace, nastavení firmy): stav a převod pro API.
import type { components } from "@/api/schema.gen";

export type MailServerInput = components["schemas"]["MailServerInput"];
export type Stored = {
  mode: MailServerInput["mode"];
  host: string;
  port: number;
  tls: string;
  user: string;
  password_set: boolean;
  from: string;
  dkim_domain: string;
  dkim_selector: string;
  dkim_key_set: boolean;
};

export type MailServerState = {
  mode: MailServerInput["mode"];
  host: string;
  port: string;
  tls: string;
  user: string;
  password: string;
  from: string;
  dkimDomain: string;
  dkimSelector: string;
  dkimKey: string;
};

export function mailServerState(m: Stored): MailServerState {
  return {
    mode: m.mode,
    host: m.host,
    port: m.port ? String(m.port) : "",
    tls: m.tls || "starttls",
    user: m.user,
    password: "",
    from: m.from,
    dkimDomain: m.dkim_domain,
    dkimSelector: m.dkim_selector,
    dkimKey: "",
  };
}

/** Hodnoty formuláře pro API; prázdná hesla a klíč = ponechat uložené. */
export function mailServerInput(v: MailServerState): MailServerInput {
  return {
    mode: v.mode,
    host: v.host,
    port: Number(v.port) || 0,
    tls: v.tls as MailServerInput["tls"],
    user: v.user,
    password: v.password || undefined,
    from: v.from,
    dkim_domain: v.dkimDomain,
    dkim_selector: v.dkimSelector,
    dkim_key: v.dkimKey || undefined,
  };
}
