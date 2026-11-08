import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ACTIVITY_TYPES,
  QUALI_QUESTIONS,
  QUANT_MODULES,
  REPORT_TYPES,
  STORES,
} from "@/domain/questionnaire";
import {
  addActivity,
  deleteActivity,
  getReport,
  loadActivities,
  todayISO,
  type Activity,
} from "@/lib/audit-storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario Attività — Fieldsight" },
      {
        name: "description",
        content: "Vista mensile delle attività mystery: pianificate, del giorno e già completate.",
      },
      { property: "og:title", content: "Calendario Attività — Fieldsight" },
    ],
  }),
  component: CalendarPage,
});

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];
const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const QUESTION_LABELS: Record<string, string> = Object.fromEntries(
  [...QUANT_MODULES.flatMap((m) => m.questions), ...QUALI_QUESTIONS].map((q) => [q.id, q.label]),
);

function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [locked]);
}

function StatusBadge({ status }: { status: Activity["status"] }) {
  const cls =
    status === "Completata"
      ? "bg-success/15 text-success"
      : status === "Audit Interrotto"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", cls)}>{status}</span>;
}

function CalendarPage() {
  const navigate = useNavigate();
  const today = todayISO();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [modal, setModal] = useState<
    { kind: "empty"; date: string } | { kind: "list"; date: string } | null
  >(null);

  const refresh = () => setActivities(loadActivities());
  useEffect(refresh, []);

  useScrollLock(modal !== null);

  const byDate = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    activities.forEach((a) => (map[a.date] ??= []).push(a));
    return map;
  }, [activities]);

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function handleDayClick(date: string) {
    setSelected(date);
    const list = byDate[date] ?? [];
    if (list.length === 0) {
      if (date < today) {
        toast.info("Non è possibile creare attività per date passate.");
        return;
      }
      setModal({ kind: "empty", date });
    } else {
      setModal({ kind: "list", date });
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
        <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <button
            type="button"
            aria-label="Mese precedente"
            onClick={() =>
              setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }))
            }
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-center text-base font-medium">
            {MONTHS[cursor.m]} {cursor.y}
          </h2>
          <button
            type="button"
            aria-label="Mese successivo"
            onClick={() =>
              setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }))
            }
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="py-1">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />;
            const date = iso(cursor.y, cursor.m, d);
            const list = byDate[date] ?? [];
            const isToday = date === today;
            const isSel = date === selected;
            const isPast = date < today;
            return (
              <button
                key={date}
                type="button"
                onClick={() => handleDayClick(date)}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors",
                  isSel ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                  !isSel && isToday && "ring-1 ring-primary",
                  isPast && !isSel && "text-muted-foreground/60",
                )}
              >
                {d}
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {list.slice(0, 3).map((a) => (
                    <span
                      key={a.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isSel
                          ? "bg-primary-foreground"
                          : a.status === "Pianificata"
                            ? "bg-primary"
                            : a.status === "Completata"
                              ? "bg-success"
                              : "bg-destructive",
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {modal?.kind === "empty" && (
        <NewActivityModal
          date={modal.date}
          onClose={() => setModal(null)}
          onSave={(a) => {
            addActivity(a);
            refresh();
            setModal({ kind: "list", date: a.date });
            toast.success("Attività pianificata");
          }}
        />
      )}

      {modal?.kind === "list" && (
        <DayActivitiesModal
          date={modal.date}
          activities={byDate[modal.date] ?? []}
          today={today}
          onClose={() => setModal(null)}
          onAdd={(a) => {
            addActivity(a);
            refresh();
          }}
          onDelete={(id) => {
            deleteActivity(id);
            refresh();
            const remaining = (byDate[modal.date] ?? []).filter((x) => x.id !== id);
            if (remaining.length === 0) setModal(null);
          }}
          onCompila={(id) => navigate({ to: "/app/audit", search: { activity: id } })}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function NewActivityModal({
  date,
  onClose,
  onSave,
}: {
  date: string;
  onClose: () => void;
  onSave: (a: Activity) => void;
}) {
  const [d, setD] = useState(date);
  const [time, setTime] = useState("10:00");
  const [type, setType] = useState<string>(ACTIVITY_TYPES[0]);
  const [code, setCode] = useState<string>(STORES[0]?.code ?? "");

  return (
    <ModalShell title="Nuova Attività" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Data">
          <input
            type="date"
            value={d}
            min={todayISO()}
            onChange={(e) => setD(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Ora">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Tipologia Attività">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Punto Vendita">
          <select value={code} onChange={(e) => setCode(e.target.value)} className={inputCls}>
            {STORES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.address}, {s.city}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="button"
        onClick={() =>
          onSave({
            id: `${Date.now()}`,
            date: d,
            time,
            activityType: type,
            store: STORES.find((s) => s.code === code) ?? null,
            status: "Pianificata",
          })
        }
        className="mt-5 min-h-12 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
      >
        Pianifica attività
      </button>
    </ModalShell>
  );
}

function DayActivitiesModal({
  date,
  activities,
  today,
  onClose,
  onAdd,
  onDelete,
  onCompila,
}: {
  date: string;
  activities: Activity[];
  today: string;
  onClose: () => void;
  onAdd: (a: Activity) => void;
  onDelete: (id: string) => void;
  onCompila: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Activity | null>(null);
  const report = detail ? getReport(detail.reportId) : null;
  const isPast = date < today;
  const isToday = date === today;

  if (adding) {
    return (
      <NewActivityModal
        date={date}
        onClose={() => setAdding(false)}
        onSave={(a) => {
          onAdd(a);
          setAdding(false);
          toast.success("Attività pianificata");
        }}
      />
    );
  }

  if (detail) {
    return (
      <ModalShell title="Report — sola lettura" onClose={() => setDetail(null)}>
        {!report && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nessun report disponibile.
          </p>
        )}
        {report && (
          <>
            <p className="text-sm font-medium">
              {report.store ? `${report.store.code} — ${report.store.city}` : "Punto vendita n/d"}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(report.createdAt).toLocaleString("it-IT")} · {report.activityType} ·{" "}
              {REPORT_TYPES.find((t) => t.id === report.reportType)?.label ?? "—"}
            </p>
            <dl className="mt-3 space-y-3 border-t border-border/70 pt-3">
              {Object.entries(report.answers)
                .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{QUESTION_LABELS[k] ?? k}</dt>
                    <dd className="text-sm font-medium">
                      {typeof v === "string" && v.startsWith("data:image") ? (
                        <img
                          src={v}
                          alt="Allegato"
                          className="mt-1 h-32 w-32 rounded-xl object-cover"
                        />
                      ) : Array.isArray(v) ? (
                        v.join(", ")
                      ) : (
                        String(v)
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </>
        )}
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={new Date(`${date}T00:00:00`).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      onClose={onClose}
    >
      <div className="divide-y divide-border/70">
        {activities.map((a) => {
          const past = a.date < today;
          const future = a.date > today;
          return (
            <div key={a.id} className="py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.time} · {a.store ? `${a.store.code} — ${a.store.city}` : "Punto vendita n/d"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{a.activityType}</p>
                  <div className="mt-2">
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Elimina attività"
                  onClick={() => onDelete(a.id)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3">
                {future && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5" /> Attività futura: non ancora compilabile
                  </p>
                )}
                {past && (
                  <button
                    type="button"
                    onClick={() => setDetail(a)}
                    className="text-sm font-medium text-primary"
                  >
                    {a.reportId ? "Consulta report (sola lettura)" : "Nessun report compilato"}
                  </button>
                )}
                {isToday && a.status === "Pianificata" && (
                  <button
                    type="button"
                    onClick={() => onCompila(a.id)}
                    className="min-h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                  >
                    Compila audit
                  </button>
                )}
                {isToday && a.status !== "Pianificata" && (
                  <button
                    type="button"
                    onClick={() => setDetail(a)}
                    className="text-sm font-medium text-primary"
                  >
                    Consulta report (sola lettura)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isPast && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary px-6 text-sm font-medium text-primary"
        >
          <Plus className="h-4 w-4" /> Aggiungi attività
        </button>
      )}
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h3 className="truncate text-base font-medium">{title}</h3>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
