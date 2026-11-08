import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  Database,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";

import { FiltersCtx, SEEDED_KEY, seedWarehouse } from "@/components/console/context";
import { DEFAULT_FILTERS, type Filters } from "@/warehouse/queries";
import { useWarehouse } from "@/warehouse/store";

export const Route = createFileRoute("/console")({
  head: () => ({
    meta: [
      { title: "Console dati — Fieldsight" },
      {
        name: "description",
        content:
          "Console aziendale: ingestione, qualità del dato, KPI di compliance e privacy dei report di audit.",
      },
    ],
  }),
  component: ConsoleLayout,
});

const NAV = [
  { to: "/console", label: "Panoramica", icon: LayoutDashboard },
  { to: "/console/ingestione", label: "Ingestione", icon: Activity },
  { to: "/console/revisione", label: "Revisione", icon: ShieldCheck, badge: true },
  { to: "/console/punti-vendita", label: "Punti vendita", icon: Building2 },
  { to: "/console/privacy", label: "Privacy", icon: Lock },
  { to: "/console/dati", label: "Dati & API", icon: Database },
] as const;

function ConsoleLayout() {
  const filters = useState<Filters>(DEFAULT_FILTERS);
  const { reports } = useWarehouse();
  const [seeding, setSeeding] = useState(false);
  const pending = reports.filter(
    (r) => r.disposition === "QUARANTINED" && r.review.status === "pending",
  ).length;

  // Primo accesso: popola il warehouse con lo storico sintetico, passando dalla pipeline reale.
  useEffect(() => {
    if (localStorage.getItem(SEEDED_KEY)) return;
    setSeeding(true);
    seedWarehouse().finally(() => setSeeding(false));
  }, []);

  return (
    <FiltersCtx.Provider value={filters}>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
          <Link to="/" className="flex items-center gap-2.5 px-5 py-5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <div>
              <p className="text-sm font-semibold leading-tight">Fieldsight</p>
              <p className="text-xs text-muted-foreground">Console dati</p>
            </div>
          </Link>
          <nav className="flex-1 space-y-0.5 px-3">
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/console" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{
                  className: "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {"badge" in rest && pending > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground tabular">
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="m-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Ambiente demo</p>
            <p className="mt-1">
              Il warehouse vive nel tuo browser: puoi modificarlo e resettarlo senza effetti per
              altri.
            </p>
            <Link
              to="/app"
              className="mt-2 inline-flex items-center gap-1 font-medium text-primary"
            >
              <Smartphone className="h-3.5 w-3.5" /> Apri app auditor
            </Link>
          </div>
        </aside>

        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              <span className="text-sm font-semibold">Fieldsight · Console</span>
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/console" }}
                activeProps={{ className: "bg-secondary text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground" }}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            {seeding ? (
              <div className="grid place-items-center py-32 text-center">
                <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-4 text-sm font-medium">Generazione dello storico sintetico…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  180 report simulati attraversano la pipeline di ingestione reale.
                </p>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </FiltersCtx.Provider>
  );
}
