import { createFileRoute } from "@tanstack/react-router";
import { Eye, Timer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button, Code, Kpi, PageHeader, Panel, fmtDateTime } from "@/components/console/ui";
import { decryptPii } from "@/domain/pipeline/privacy";
import type { PiiVaultEntry } from "@/domain/pipeline/types";
import {
  CONSOLE_OPERATOR,
  appendAudit,
  erasePii,
  getVaultKey,
  useWarehouse,
} from "@/warehouse/store";

export const Route = createFileRoute("/console/privacy")({
  component: Privacy,
});

const DAY = 86_400_000;

function daysLeft(v: PiiVaultEntry, now: number) {
  return Math.ceil((new Date(v.retentionUntil).getTime() - now) / DAY);
}

function Privacy() {
  const { vault, audit } = useWarehouse();
  const [revealed, setRevealed] = useState<
    Record<string, { email: string | null; phone: string | null }>
  >({});
  const now = Date.now();
  const active = vault.filter((v) => v.status === "active");
  const expired = active.filter((v) => daysLeft(v, now) <= 0);
  const soon = active.filter((v) => daysLeft(v, now) > 0 && daysLeft(v, now) <= 7);
  const privacyLog = useMemo(
    () =>
      audit
        .filter(
          (a) =>
            a.action === "PII_REVEAL" || a.action === "PII_ERASE" || a.action === "RETENTION_JOB",
        )
        .slice(0, 12),
    [audit],
  );

  async function reveal(v: PiiVaultEntry) {
    const jwk = getVaultKey(v.keyId);
    if (!jwk) {
      toast.error("Chiave non disponibile");
      return;
    }
    const plain = await decryptPii<{ email: string | null; phone: string | null }>(
      v.ciphertext,
      v.iv,
      jwk,
    );
    appendAudit({
      actor: CONSOLE_OPERATOR,
      action: "PII_REVEAL",
      target: v.token,
      detail: "Accesso in chiaro per evasione pratica",
    });
    setRevealed((r) => ({ ...r, [v.token]: plain }));
    setTimeout(() => setRevealed(({ [v.token]: _, ...rest }) => rest), 15_000);
  }

  function erase(v: PiiVaultEntry) {
    if (
      !window.confirm(`Cancellare definitivamente i dati di ${v.token}? La chiave verrà distrutta.`)
    )
      return;
    erasePii([v.token], "richiesta interessato / pratica chiusa");
    toast.success("Dati cancellati (crypto-shredding)");
  }

  function runRetention() {
    if (!expired.length) {
      toast.info("Nessun record oltre la retention");
      return;
    }
    erasePii(
      expired.map((v) => v.token),
      "retention",
      "job.retention@scheduler",
    );
    toast.success(`${expired.length} record cancellati dal job di retention`);
  }

  const rows = [...vault].sort((a, b) =>
    a.status === b.status
      ? a.retentionUntil.localeCompare(b.retentionUntil)
      : a.status === "active"
        ? -1
        : 1,
  );

  return (
    <>
      <PageHeader
        title="Privacy"
        description="I contatti dei consumatori raccolti con le promo bundle non entrano mai nel data warehouse: il fact contiene solo un token pseudonimo. Il dato è cifrato con una chiave per record; cancellare la chiave lo rende irrecuperabile anche nei backup."
        actions={
          <Button variant="primary" onClick={runRetention}>
            <Timer className="h-4 w-4" /> Esegui job di retention
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Record attivi" value={String(active.length)} hint="cifrati AES-256-GCM" />
        <Kpi label="In scadenza (≤ 7 gg)" value={String(soon.length)} />
        <Kpi
          label="Oltre retention"
          value={String(expired.length)}
          hint="da cancellare"
          tone={expired.length ? "bad" : undefined}
        />
        <Kpi
          label="Cancellati"
          value={String(vault.length - active.length)}
          hint="crypto-shredding"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Vault contatti"
          description="Visualizzazione mascherata; l'accesso in chiaro dura 15 secondi ed è registrato"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Token</th>
                  <th className="pb-2 pr-3 font-medium">PV</th>
                  <th className="pb-2 pr-3 font-medium">Contatto</th>
                  <th className="pb-2 pr-3 font-medium">Retention</th>
                  <th className="pb-2 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const d = daysLeft(v, now);
                  const plain = revealed[v.token];
                  return (
                    <tr
                      key={v.token + v.submissionId}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs" title={v.token}>
                        {v.token.slice(0, 14)}…
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs">{v.storeCode}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        {v.status === "erased" ? (
                          <span className="text-muted-foreground">
                            cancellato {v.erasedAt ? fmtDateTime(v.erasedAt) : ""}
                          </span>
                        ) : plain ? (
                          <span className="inline-flex flex-col rounded bg-secondary px-1.5 py-0.5">
                            {plain.email && <span>{plain.email}</span>}
                            {plain.phone && <span>{plain.phone}</span>}
                          </span>
                        ) : (
                          <span className="flex flex-col">
                            {v.emailMasked && <span>{v.emailMasked}</span>}
                            {v.phoneMasked && (
                              <span className="text-muted-foreground">{v.phoneMasked}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs tabular">
                        {v.status === "erased" ? (
                          "—"
                        ) : d <= 0 ? (
                          <span className="font-medium text-destructive">scaduta da {-d} gg</span>
                        ) : (
                          `${d} gg`
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {v.status === "active" && (
                          <div className="inline-flex gap-1">
                            <Button variant="ghost" onClick={() => void reveal(v)}>
                              <Eye className="h-4 w-4" />{" "}
                              <span className="sr-only sm:not-sr-only">Mostra</span>
                            </Button>
                            <Button variant="ghost" onClick={() => erase(v)}>
                              <Trash2 className="h-4 w-4" />{" "}
                              <span className="sr-only sm:not-sr-only">Cancella</span>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vault.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nessun dato personale acquisito.
              </p>
            )}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Audit log privacy"
            description="Chi ha visto o cancellato cosa (art. 30 GDPR)"
          >
            {privacyLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun accesso registrato.</p>
            ) : (
              <ul className="space-y-2.5">
                {privacyLog.map((a) => (
                  <li key={a.id} className="text-xs">
                    <p>
                      <Code>{a.action}</Code>{" "}
                      <span className="text-muted-foreground">{fmtDateTime(a.at)}</span>
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {a.actor}
                      {a.target ? ` → ${a.target}` : ""} · {a.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Come funziona">
            <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>L'app separa i contatti dalle risposte già sul device.</li>
              <li>
                La pipeline calcola <Code>HMAC-SHA256(pepper, contatto)</Code>: token stabile, non
                reversibile.
              </li>
              <li>
                Il contatto è cifrato con una chiave AES dedicata, salvata in un keystore separato.
              </li>
              <li>Alla scadenza (30 gg) o su richiesta, la chiave viene distrutta.</li>
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
