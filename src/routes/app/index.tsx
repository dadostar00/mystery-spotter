import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, ClipboardList, MapPin, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { ACTIVITY_TYPES } from "@/domain/questionnaire";
import { loadActivities, todayISO, type Activity } from "@/lib/audit-storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Audit di Oggi — Fieldsight" },
      {
        name: "description",
        content: "Dashboard degli audit odierni pronti da compilare.",
      },
      { property: "og:title", content: "Audit di Oggi — Fieldsight" },
    ],
  }),
  component: AuditDashboard,
});

function StatusBadge({ status }: { status: Activity["status"] }) {
  const cls =
    status === "Completata"
      ? "bg-success/15 text-success"
      : status === "Audit Interrotto"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", cls)}>{status}</span>;
}

function AuditDashboard() {
  const navigate = useNavigate();
  const [todayActivities, setTodayActivities] = useState<Activity[]>([]);

  useEffect(() => {
    const today = todayISO();
    setTodayActivities(loadActivities().filter((a) => a.date === today));
  }, []);

  const pending = todayActivities.filter((a) => a.status === "Pianificata");
  const done = todayActivities.filter((a) => a.status !== "Pianificata");

  return (
    <div className="space-y-5">
      {/* Quick start banner */}
      <section className="rounded-2xl bg-card p-5 text-card-foreground shadow-sm ring-1 ring-border/60">
        <h2 className="text-lg font-medium text-foreground">Audit di Oggi</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length > 0
            ? `Hai ${pending.length} audit da compilare`
            : "Nessun audit pianificato per oggi"}
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/app/audit" })}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Avvia nuovo audit
        </button>
      </section>

      {/* Pending audits */}
      {pending.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Pronti da compilare</h3>
          <div className="space-y-2">
            {pending.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate({ to: "/app/audit", search: { activity: a.id } })}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border/60 transition-colors hover:bg-secondary/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.activityType}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {a.store ? `${a.store.code} — ${a.store.city}` : "Punto vendita n/d"}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.time}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Completed audits */}
      {done.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Già compilati</h3>
          <div className="space-y-2">
            {done.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.activityType}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.store ? `${a.store.code} — ${a.store.city}` : "Punto vendita n/d"}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={a.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {todayActivities.length === 0 && (
        <section className="rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nessuna attività per oggi. Avvia un audit o pianificane uno dal calendario.
          </p>
        </section>
      )}
    </div>
  );
}
