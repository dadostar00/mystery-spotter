import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TriangleAlert as AlertTriangle,
  ArrowLeft,
  CircleCheck as CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudOff,
  LoaderCircle,
  Save,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { QuestionField } from "@/components/audit/QuestionField";
import { PII_QUESTIONS } from "@/domain/catalog";
import { flush, enqueue, useOutbox } from "@/field/outbox";
import { buildSubmission } from "@/field/submission";
import { maskEmail, maskPhone } from "@/domain/pipeline/privacy";
import {
  ACTIVITY_TYPES,
  QUALI_QUESTIONS,
  REPORT_TYPES,
  STORES,
  computeAge,
  isAgeVerificationEnabled,
  isQuestionVisible,
  visibleModules,
  type Answers,
  type ReportType,
  type Store,
} from "@/domain/questionnaire";
import {
  type Activity,
  addActivity,
  addContact,
  loadActivities,
  saveReport,
  updateActivity,
  useProfile,
  type SavedReport,
  type TrackedContact,
} from "@/lib/audit-storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/audit")({
  head: () => ({
    meta: [
      { title: "Nuovo Audit — Fieldsight" },
      {
        name: "description",
        content:
          "Avvia una nuova rilevazione: tipologia attività, punto vendita e compilazione del report.",
      },
      { property: "og:title", content: "Nuovo Audit — Fieldsight" },
      {
        property: "og:description",
        content:
          "Avvia una nuova rilevazione mystery nei punti vendita e compila la checklist di compliance.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { activity?: string } =>
    typeof search["activity"] === "string" ? { activity: search["activity"] } : {},
  component: AuditFlow,
});

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60", className)}>
      {children}
    </section>
  );
}

function SectionTitle({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{step}</p>
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
    </div>
  );
}

function ListButton({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-secondary"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function CollapsibleGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-border/70 bg-card px-4 pb-2">{children}</div>}
    </div>
  );
}

function AuditFlow() {
  const { activity: activityId } = Route.useSearch();
  const { profile } = useProfile();
  const age = computeAge(profile.birthDate);
  const ageVerificationEnabled = isAgeVerificationEnabled(profile.birthDate, profile.appearsOver18);

  const [step, setStep] = useState(1);
  const [activityType, setActivityType] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [collaborating, setCollaborating] = useState<boolean | null>(null);
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const { receipts, queue, syncing } = useOutbox();
  const receipt = saved ? receipts[submissionId] : undefined;
  const queued = saved && queue.some((q) => q.submissionId === submissionId);
  const [autoActivityId, setAutoActivityId] = useState<string | undefined>(undefined);
  const effectiveActivityId = activityId ?? autoActivityId;

  useEffect(() => {
    if (!activityId) return;
    const a = loadActivities().find((x) => x.id === activityId);
    if (!a) return;
    setActivityType(a.activityType);
    setStore(a.store);
    setStep(3);
  }, [activityId]);

  const ctx = useMemo(() => ({ ageVerificationEnabled }), [ageVerificationEnabled]);
  const modules = useMemo(() => visibleModules(answers), [answers]);
  const showQuant = reportType === "quantitativo" || reportType === "completo";
  const showQuali = reportType === "qualitativo" || reportType === "completo";

  const allQuestions = useMemo(() => {
    const qs = showQuant
      ? modules.flatMap((m) => m.questions.filter((q) => isQuestionVisible(q, answers, ctx)))
      : [];
    return showQuali ? [...qs, ...QUALI_QUESTIONS] : qs;
  }, [modules, answers, showQuant, showQuali, ctx]);

  const hasContact = [...PII_QUESTIONS].some((id) => String(answers[id] ?? "").trim() !== "");
  const answered = allQuestions.filter((q) => {
    if (PII_QUESTIONS.has(q.id)) return hasContact; // basta almeno un contatto
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  }).length;
  const progress = allQuestions.length ? Math.round((answered / allQuestions.length) * 100) : 0;

  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  const filteredStores = STORES.filter((s) =>
    `${s.code} ${s.address} ${s.city}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function persist(status: SavedReport["status"]) {
    // 1) payload conforme al contratto v1 → 2) outbox durevole → 3) sync verso l'API
    const payload = await buildSubmission({
      submissionId,
      auditorId: profile.auditorId,
      ageVerificationEligible: ageVerificationEnabled,
      activityId: effectiveActivityId,
      activityType: activityType ?? ACTIVITY_TYPES[0],
      storeCode: store?.code ?? "PV-0000",
      startedAt,
      outcome: status === "Completato" ? "completed" : "interrupted",
      storeCollaborating: collaborating === true,
      reportType: status === "Completato" ? reportType : null,
      answers: status === "Completato" ? answers : {},
    });
    enqueue(payload);
    void flush(profile.auditorId || "auditor");

    const report: SavedReport = {
      id: submissionId,
      createdAt: new Date().toISOString(),
      activityType: activityType ?? "",
      store,
      collaborating: collaborating === true,
      status,
      reportType,
      ageVerificationEnabled,
      answers,
    };
    saveReport(report);

    if (
      status === "Completato" &&
      answers["c1_bundle"] === "Sì" &&
      answers["d0_acquisto"] === "Sì"
    ) {
      const stickCount = parseInt((answers["e1_bundle_stick"] as string) ?? "0", 10);
      if (stickCount > 0) {
        const email = (answers["e1_email"] as string) ?? "";
        const phone = (answers["e1_phone"] as string) ?? "";
        if (email.trim() || phone.trim()) {
          const contact: TrackedContact = {
            id: submissionId,
            reportId: report.id,
            createdAt: report.createdAt,
            storeCode: store?.code ?? null,
            // sul device restano solo valori mascherati (minimizzazione)
            email: email.trim() ? maskEmail(email) : "",
            phone: phone.trim() ? maskPhone(phone) : "",
            status: "Pratica in corso",
          };
          addContact(contact);
        }
      }
    }

    const actId = effectiveActivityId;
    if (actId) {
      updateActivity(actId, {
        status: status === "Completato" ? "Completata" : "Audit Interrotto",
        reportId: report.id,
      });
    } else {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate(),
      ).padStart(2, "0")}`;
      const newAct: Activity = {
        id: crypto.randomUUID(),
        date,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        activityType: activityType ?? ACTIVITY_TYPES[0],
        store,
        status: status === "Completato" ? "Completata" : "Audit Interrotto",
        reportId: report.id,
      };
      addActivity(newAct);
    }

    setSaved(true);
    toast.success(
      status === "Completato"
        ? "Report salvato e messo in coda di invio"
        : "Audit interrotto salvato",
    );
  }

  function reset() {
    setStep(1);
    setActivityType(null);
    setStore(null);
    setCollaborating(null);
    setReportType(null);
    setAnswers({});
    setSaved(false);
    setQuery("");
    setAutoActivityId(undefined);
    setSubmissionId(crypto.randomUUID());
    setStartedAt(new Date().toISOString());
  }

  if (saved) {
    const tone =
      receipt?.disposition === "ACCEPTED" || receipt?.disposition === "ACCEPTED_WITH_WARNINGS"
        ? "ok"
        : receipt?.disposition === "QUARANTINED"
          ? "review"
          : receipt
            ? "ko"
            : "pending";
    return (
      <Card className="text-center">
        {tone === "pending" ? (
          queued && !syncing ? (
            <CloudOff className="mx-auto h-12 w-12 text-muted-foreground" />
          ) : (
            <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />
          )
        ) : tone === "ok" ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        ) : (
          <ShieldAlert
            className={cn(
              "mx-auto h-12 w-12",
              tone === "ko" ? "text-destructive" : "text-amber-500",
            )}
          />
        )}
        <h2 className="mt-3 text-xl font-medium">
          {tone === "pending"
            ? queued && !syncing
              ? "Salvato in coda offline"
              : "Invio in corso…"
            : tone === "ok"
              ? "Report acquisito"
              : tone === "review"
                ? "Report in revisione"
                : "Report rifiutato"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tone === "pending"
            ? "Verrà inviato automaticamente appena torna la connessione."
            : receipt?.score !== null && receipt?.score !== undefined
              ? `Compliance rilevata: ${receipt.score}/100`
              : "Esito registrato dal sistema centrale."}
        </p>
        {receipt && receipt.flags.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-xl bg-secondary/60 p-3 text-left text-xs">
            {receipt.flags.slice(0, 5).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono font-medium text-foreground">{f.code}</span>
                <span className="text-muted-foreground">{f.message}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">ID {submissionId}</p>
        <Link
          to="/app/calendario"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-primary px-6 text-sm font-medium text-primary"
        >
          Vai al Calendario
        </Link>
        <button
          type="button"
          onClick={reset}
          className="mt-3 min-h-11 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          Nuovo audit
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {step > 1 && (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Indietro
        </button>
      )}

      {step === 1 && (
        <Card>
          <SectionTitle step="Step 1 di 4" title="Tipologia Attività" />
          <div className="divide-y divide-border/70">
            {ACTIVITY_TYPES.map((t) => (
              <ListButton
                key={t}
                title={t}
                onClick={() => {
                  setActivityType(t);
                  setStep(2);
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <SectionTitle step="Step 2 di 4" title="Punto Vendita" />
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per codice, indirizzo o città"
              className="w-full rounded-full border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="divide-y divide-border/70">
            {filteredStores.map((s) => (
              <ListButton
                key={s.code}
                title={s.code}
                subtitle={`${s.address} — ${s.city}`}
                onClick={() => {
                  setStore(s);
                  setStep(3);
                }}
              />
            ))}
            {filteredStores.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nessun punto vendita trovato.
              </p>
            )}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <SectionTitle step="Step 3 di 4" title="Stato Punto Vendita" />
          <p className="mb-4 text-sm font-medium">Il punto vendita è collaborante?</p>
          <div className="flex gap-3">
            {["Sì", "No"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const yes = v === "Sì";
                  setCollaborating(yes);
                  if (yes) setStep(4);
                }}
                className={cn(
                  "min-h-11 flex-1 rounded-full border text-sm font-medium transition-colors",
                  v === "Sì"
                    ? collaborating === true
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                    : collaborating === false
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {collaborating === false && (
            <div className="mt-5 rounded-xl bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Audit Interrotto</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Il punto vendita non è collaborante: la compilazione è bloccata. Salva lo stato
                    del report.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void persist("Audit Interrotto")}
                className="mt-4 min-h-11 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
              >
                Salva stato report
              </button>
            </div>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card>
          <SectionTitle step="Step 4 di 4" title="Tipologia Report" />
          <div className="divide-y divide-border/70">
            {REPORT_TYPES.map((r) => (
              <ListButton
                key={r.id}
                title={r.label}
                subtitle={r.desc}
                onClick={() => {
                  setReportType(r.id);
                  setStep(5);
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {step === 5 && (
        <>
          <Card className="sticky top-[72px] z-10">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {store?.code} · {activityType}
              </span>
              <span className="shrink-0 font-medium text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {!ageVerificationEnabled && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sezione "Verifica Età" nascosta{" "}
                {age === null ? "(data di nascita non impostata)" : `(età ${age} anni)`}.
              </p>
            )}
          </Card>

          {showQuant &&
            modules.map((m) => {
              const qs = m.questions.filter((q) => isQuestionVisible(q, answers, ctx));
              if (qs.length === 0) return null;
              const ungrouped = qs.filter((q) => !q.group);
              const groups = (m.groups ?? [])
                .map((g) => ({ ...g, questions: qs.filter((q) => q.group === g.id) }))
                .filter((g) => g.questions.length > 0);
              return (
                <Card key={m.id}>
                  <h3 className="text-base font-medium text-foreground">
                    Modulo {m.id} — {m.title}
                  </h3>
                  <div className="mt-1">
                    {ungrouped.map((q) => (
                      <QuestionField
                        key={q.id}
                        question={q}
                        value={answers[q.id]}
                        answers={answers}
                        onChange={(v) => set(q.id, v)}
                      />
                    ))}
                  </div>
                  {groups.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {groups.map((g) => (
                        <CollapsibleGroup key={g.id} title={g.title}>
                          {g.questions.map((q) => (
                            <QuestionField
                              key={q.id}
                              question={q}
                              value={answers[q.id]}
                              answers={answers}
                              onChange={(v) => set(q.id, v)}
                            />
                          ))}
                        </CollapsibleGroup>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

          {showQuant && modules.length < 4 && (
            <Card className="bg-accent/50">
              <p className="text-sm text-accent-foreground">
                Hostess assente: i moduli successivi sono stati interrotti automaticamente.
              </p>
            </Card>
          )}

          {showQuali && (
            <Card>
              <h3 className="text-base font-medium text-foreground">Report Qualitativo</h3>
              <div className="mt-1">
                {QUALI_QUESTIONS.map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    answers={answers}
                    onChange={(v) => set(q.id, v)}
                  />
                ))}
              </div>
            </Card>
          )}

          <button
            type="button"
            onClick={() => void persist("Completato")}
            disabled={progress < 100}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Salva Report
          </button>
          {progress < 100 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Compila tutti i campi obbligatori per procedere ({progress}% completato)
            </p>
          )}
        </>
      )}
    </div>
  );
}
