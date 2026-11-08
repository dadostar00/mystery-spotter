import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Database,
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fieldsight — dal rilievo sul campo al dato decisionale" },
      {
        name: "description",
        content:
          "Concept end-to-end per audit retail: app PWA offline-first, API di ingestione con contratto dati, pipeline di qualità e privacy, console KPI per l'azienda.",
      },
      { property: "og:title", content: "Fieldsight — retail audit data platform" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: Workflow,
    title: "Contratto dati e API",
    text: "Ogni report è un payload versionato e validato con lo stesso schema su client e server. Idempotenza nativa: i retry dall'offline non creano duplicati.",
  },
  {
    icon: Database,
    title: "Pipeline di qualità",
    text: "Otto stage tracciati: integrità referenziale, rami condizionali ricalcolati, regole di business, outlier statistici, seriali duplicati. Ciò che è dubbio va in quarantena, non nei KPI.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by design",
    text: "I contatti dei consumatori non toccano mai il warehouse: token HMAC, cifratura per record, retention automatica e cancellazione per crypto-shredding.",
  },
  {
    icon: LayoutDashboard,
    title: "Dati che guidano decisioni",
    text: "Score di compliance ponderato, trend, classifica punti vendita, funnel di visita e non conformità ricorrenti. Export aperti verso BI e notebook.",
  },
];

const STACK = [
  "TypeScript",
  "React 19",
  "TanStack Start",
  "Zod",
  "Web Crypto",
  "Cloudflare Workers",
  "PostgreSQL",
  "Python · DuckDB",
  "Vitest",
  "GitHub Actions",
];

function Landing() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">Fieldsight</span>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/app"
            className="rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            App auditor
          </Link>
          <Link
            to="/console"
            className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            Console
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
          <p className="text-sm font-medium text-primary">Retail audit data platform</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Dal rilievo sul campo al dato su cui decidere.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Fieldsight raccoglie gli audit mystery nei punti vendita e li trasforma in informazioni
            affidabili: ogni report viene validato, controllato, ripulito dei dati personali e
            misurato prima di arrivare in dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/console"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
            >
              Apri la console aziendale <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/app"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-medium"
            >
              <Smartphone className="h-4 w-4" /> Prova l'app dell'auditor
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Demo: alla prima apertura la console genera 8 settimane di audit sintetici e li fa
            passare dalla pipeline reale. L'app auditor si installa direttamente dal browser (PWA).
          </p>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-card p-6">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="mt-4 text-base font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Il percorso di un report</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              [
                "Raccolta",
                "L'auditor compila sul telefono, anche offline. I contatti del cliente e le foto vengono separati già sul device.",
              ],
              [
                "Ingestione",
                "L'API riceve il payload, verifica il contratto e restituisce un esito: accettato, in quarantena o rifiutato con motivazioni.",
              ],
              [
                "Controllo",
                "Le anomalie vengono confrontate con lo storico; un operatore decide sui casi dubbi e ogni decisione resta nell'audit log.",
              ],
              [
                "Analisi",
                "Solo i dati validi alimentano KPI, classifiche ed export verso gli strumenti del team dati.",
              ],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-border bg-card p-5">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <h3 className="mt-2 font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 className="text-sm font-semibold text-muted-foreground">Stack</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {STACK.map((s) => (
              <li key={s} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
                {s}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>Fieldsight · concept progettuale. I dati mostrati sono sintetici.</span>
          <span>
            API: <code className="font-mono">POST /api/v1/reports</code>
          </span>
        </div>
      </footer>
    </div>
  );
}
