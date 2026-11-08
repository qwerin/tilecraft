import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { SaveIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { api, unwrap } from "@/api/client";
import { useFirmMail, useFirmMutation } from "@/api/queries";
import { emailMutations } from "@/api/emails";
import type { LabMailSettings } from "@/api/types";
import { Panel } from "@/components/common";
import {
  mailServerInput,
  mailServerState,
  type MailServerInput,
} from "@/components/settings/mail-server";
import { MailServerFields } from "@/components/settings/mail-server-fields";
import { Hint, SwitchRow } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { useFirm } from "@/hooks/use-firm";

export const Route = createFileRoute("/a/$slug/settings/email")({
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const { slug } = useFirm();
  const { data } = useFirmMail(slug);
  if (!data) return null;
  return <MailForm key={JSON.stringify(data)} slug={slug} st={data} />;
}

function deliveryText(st: LabMailSettings) {
  if (st.test)
    return "Testovací instance: e-maily se nikam neodesílají, jen se uloží na stránku E-maily.";
  if (!st.live)
    return st.mode
      ? "Ostré odesílání je vypnuté: e-maily se jen ukládají na stránku E-maily. Zkušební e-mail přes vlastní server odejde i tak."
      : "Ostré odesílání přes server aplikace zatím zapnuté není (zapíná ho správce aplikace): e-maily se jen ukládají na stránku E-maily. S vlastním Gmailem nebo SMTP serverem si ho můžete zapnout sami.";
  return "E-maily (nabídky a faktury) se zákazníkům opravdu odesílají.";
}

// Vlastní e-mailový server firmy (Gmail nebo SMTP); bez něj se posílá přes server aplikace.
function MailForm({ slug, st }: { slug: string; st: LabMailSettings }) {
  const qc = useQueryClient();
  const [server, setServer] = useState(() => mailServerState(st));
  const [live, setLive] = useState(st.own_live);
  const dirty =
    JSON.stringify(server) !== JSON.stringify(mailServerState(st)) ||
    live !== st.own_live;
  const save = useFirmMutation(
    slug,
    (body: MailServerInput & { live: boolean }) =>
      unwrap(
        api.PUT("/api/accounts/{slug}/mail", {
          params: { path: { slug } },
          body,
        }),
      ),
    [["emails"]],
  );
  const test = useFirmMutation(slug, emailMutations.test(slug), [["emails"]]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ ...mailServerInput(server), live }, {
      onSuccess: (r) => {
        qc.setQueryData([slug, "mail"], r);
        toast.success("Uloženo");
      },
    });
  };
  const appServer = st.app_sender
    ? `Server aplikace (${st.app_sender})`
    : "Server aplikace (není nastavený)";

  return (
    <form onSubmit={submit} className="flex max-w-5xl flex-col gap-4">
      <Panel title="Odesílání e-mailů">
        <p className="-mt-1 mb-4 text-xs text-muted-foreground">
          Odkud firma posílá e-maily zákazníkům (nabídky, faktury). S vlastním
          Gmailem nebo SMTP serverem přijdou z vaší adresy; odpovědi jdou na
          e-mail firmy ze stránky Firma.
        </p>
        <MailServerFields
          value={server}
          onChange={setServer}
          stored={st}
          noneLabel={appServer}
        />
        {server.mode && !st.test && (
          <SwitchRow
            className="mt-3"
            label="Ostré odesílání"
            hint={
              st.app_live
                ? "Zapnuté pro celou aplikaci správcem aplikace."
                : "E-maily přes vlastní server se zákazníkům opravdu odesílají. Vypnuto = jen se uloží na stránku E-maily."
            }
            checked={live || st.app_live}
            onChange={(v) => !st.app_live && setLive(v)}
          />
        )}
        <Hint className="mt-4">{deliveryText(st)}</Hint>
      </Panel>
      <div className="flex flex-wrap justify-end gap-2 pb-6">
        {!st.test && (
          <Button
            type="button"
            variant="outline"
            disabled={dirty || test.isPending}
            title={
              dirty
                ? "Nejdřív uložte změny"
                : "Pošle zkušební e-mail na vaši adresu"
            }
            onClick={() =>
              test.mutate("", {
                onSuccess: (e) =>
                  toast.success(
                    e.status === "sent"
                      ? `Zkušební e-mail odeslán na ${e.to}`
                      : "Zkušební e-mail uložen (odesílání je vypnuté)",
                  ),
              })
            }
          >
            <SendIcon /> Poslat zkušební e-mail
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          <SaveIcon /> Uložit změny
        </Button>
      </div>
    </form>
  );
}
