import { createFileRoute } from "@tanstack/react-router";
import { Boxes, ClipboardCheck, CloudUpload, Euro, Gauge, Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useOutbox } from "@/field/outbox";
import { loadReports, type SavedReport } from "@/lib/audit-storage";

export const Route = createFileRoute("/app/statistiche")({
  head: () => ({
    meta: [
      { title: "Statistiche — Fieldsight" },
      {
        name: "description",
        content: "Tracciamento attività eseguite, inventario dispositivi e campioni distribuiti.",
      },
      { property: "og:title", content: "Statistiche — Fieldsight" },
    ],
  }),
  component: StatsPage,
});

function StatCard({
  icon,
  label,
  value,
  sublabel,
  accent = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: "primary" | "success" | "accent" | "muted";
}) {
  const accentCls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    accent: "bg-accent/20 text-accent-foreground",
    muted: "bg-secondary text-muted-foreground",
  }[accent];

  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
      <div className="flex items-center gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${accentCls}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold text-foreground">{value}</p>
          {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
        </div>
      </div>
    </section>
  );
}

function StatsPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const { queue, receipts } = useOutbox();
  const scores = Object.values(receipts)
    .map((r) => r.score)
    .filter((x): x is number => x !== null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;

  useEffect(() => setReports(loadReports()), []);

  const completed = useMemo(() => reports.filter((r) => r.status === "Completato"), [reports]);

  const stats = useMemo(() => {
    let totalDevices = 0;
    let totalSpend = 0;
    let totalSticks = 0;
    const byModel: Record<string, number> = {};

    for (const r of completed) {
      const a = r.answers;
      if (a["d0_acquisto"] === "Sì") {
        totalDevices++;
        const model = (a["e1_modello"] as string) ?? "Non specificato";
        byModel[model] = (byModel[model] ?? 0) + 1;
        const price = parseFloat(String(a["e1_prezzo"] ?? "0").replace(",", "."));
        if (!isNaN(price)) totalSpend += price;

        const bundleSticks = parseInt(String(a["e1_bundle_stick"] ?? "0"), 10);
        if (!isNaN(bundleSticks)) totalSticks += bundleSticks;
      }
    }

    return { totalDevices, totalSpend, totalSticks, byModel };
  }, [completed]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Statistiche</h2>
        <p className="text-sm text-muted-foreground">Riepilogo attività e inventario</p>
      </div>

      <StatCard
        icon={<ClipboardCheck className="h-6 w-6" />}
        label="Attività Svolte"
        value={completed.length}
        sublabel="Audit conclusi"
      />

      <StatCard
        icon={<Boxes className="h-6 w-6" />}
        label="Dispositivi Acquistati"
        value={stats.totalDevices}
        sublabel="Totale acquisti"
      />

      {Object.keys(stats.byModel).length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Dettaglio per modello</p>
          <div className="space-y-2">
            {Object.entries(stats.byModel).map(([model, count]) => (
              <div key={model} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{model}</span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <StatCard
        icon={<Euro className="h-6 w-6" />}
        label="Spesa Totale Dispositivi"
        value={`€ ${stats.totalSpend.toFixed(2)}`}
        accent="success"
      />

      <StatCard
        icon={<Package className="h-6 w-6" />}
        label="Stick / Pacchetti Tabacco"
        value={stats.totalSticks}
        sublabel="Ricevuti in bundle"
        accent="accent"
      />

      <StatCard
        icon={<Gauge className="h-6 w-6" />}
        label="Compliance media rilevata"
        value={avgScore === null ? "—" : `${avgScore}/100`}
        sublabel={`Calcolata dalla pipeline su ${scores.length} report sincronizzati`}
        accent="muted"
      />

      <StatCard
        icon={<CloudUpload className="h-6 w-6" />}
        label="Report in coda di invio"
        value={queue.length}
        sublabel={
          queue.length ? "Verranno inviati al ritorno della connessione" : "Tutto sincronizzato"
        }
        accent="muted"
      />

      {completed.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessun dato disponibile. Completa un audit per popolare le statistiche.
        </p>
      )}
    </div>
  );
}
