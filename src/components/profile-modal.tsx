import {
  Bell,
  BellOff,
  CalendarDays,
  Globe,
  HardDrive,
  Moon,
  ShieldCheck,
  TriangleAlert as AlertTriangle,
  UserRound,
  X,
  Database,
  CircleCheck as CheckCircle2,
  Clock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { computeAge, isAgeVerificationEnabled } from "@/domain/questionnaire";
import {
  addTicket,
  loadContacts,
  useProfile,
  useSettings,
  type AppSettings,
  type AuditorProfile,
  type SupportTicket,
  type TrackedContact,
} from "@/lib/audit-storage";
import { requestNotificationPermission } from "@/lib/reminders";
import { getWarehouse } from "@/warehouse/store";
import { cn } from "@/lib/utils";

const SUPPORT_TYPES = [
  "Tabaccheria/PV mancante",
  "Codice ID non corrisponde all'indirizzo",
  "Problema tecnico App",
  "Altro",
];

function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

function Shell({
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
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate text-lg font-medium">{title}</h2>
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

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors",
        on ? "border-primary bg-primary" : "border-muted-foreground/30 bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SettingRow({
  icon,
  label,
  description,
  on,
  onChange,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  on?: boolean;
  onChange?: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
      {onChange !== undefined && on !== undefined && <Toggle on={on} onChange={onChange} />}
    </div>
  );
}

/* ---------- Profile Modal (identity only) ---------- */

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { profile, setProfile, loaded } = useProfile();
  const [draft, setDraft] = useState<AuditorProfile | null>(null);
  const cur = draft ?? profile;
  const age = computeAge(cur.birthDate);
  const minorError = age !== null && age < 18;
  const needsAppearance = age !== null && age >= 18 && age <= 25;
  const ageVerification = isAgeVerificationEnabled(cur.birthDate, cur.appearsOver18);
  const canSave = !minorError && !(needsAppearance && cur.appearsOver18 === null);

  return (
    <Shell title="Profilo Auditor" onClose={onClose}>
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <UserRound className="h-4 w-4" /> Identità
      </div>

      <label className="mb-1.5 block text-sm font-medium" htmlFor="auditor-id">
        Codice ID Auditor
      </label>
      <input
        id="auditor-id"
        value={cur.auditorId}
        onChange={(e) => setDraft({ ...cur, auditorId: e.target.value })}
        placeholder="Es. MA-2024-001"
        className="mb-3 w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      <label className="mb-1.5 block text-sm font-medium" htmlFor="auditor-dob">
        Data di nascita (GG/MM/AAAA)
      </label>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="auditor-dob"
          inputMode="numeric"
          value={cur.birthDate}
          onChange={(e) =>
            setDraft({ ...cur, birthDate: maskDate(e.target.value), appearsOver18: null })
          }
          placeholder="01/01/2000"
          aria-invalid={minorError}
          className={cn(
            "w-full rounded-xl border bg-card py-3 pl-10 pr-4 text-sm outline-none focus:ring-2",
            minorError
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-input focus:border-primary focus:ring-primary/20",
          )}
        />
      </div>
      {minorError && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          L'auditor deve avere almeno 18 anni.
        </p>
      )}

      {needsAppearance && (
        <div className="mt-3 rounded-xl bg-secondary/60 p-3">
          <p className="mb-2 text-sm font-medium">Dimostri più di 18 anni?</p>
          <div className="flex gap-2">
            {[
              { label: "Sì", value: true },
              { label: "No", value: false },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setDraft({ ...cur, appearsOver18: o.value })}
                className={cn(
                  "min-h-10 flex-1 rounded-full border px-4 text-sm font-medium transition-colors",
                  cur.appearsOver18 === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loaded && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-secondary/40 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            {age === null
              ? "Inserisci una data di nascita valida per calcolare l'età."
              : `Età: ${age} anni — ${ageVerification ? "Verifica Età attiva nei report" : "Verifica Età disattivata"}`}
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!canSave}
        onClick={() => {
          setProfile(cur);
          setDraft(null);
          toast.success("Profilo salvato");
        }}
        className="mt-4 min-h-11 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Salva profilo
      </button>
    </Shell>
  );
}

/* ---------- Settings Modal (preferences + data + assistance) ---------- */

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useSettings();
  const [sdraft, setSdraft] = useState<AppSettings | null>(null);
  const [showSupport, setShowSupport] = useState(false);
  const [supportType, setSupportType] = useState(SUPPORT_TYPES[0]);
  const [supportNotes, setSupportNotes] = useState("");
  const [contacts, setContacts] = useState<TrackedContact[]>([]);
  const [showContacts, setShowContacts] = useState(false);

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  const cs = sdraft ?? settings;

  function update(patch: Partial<AppSettings>) {
    const next = { ...cs, ...patch };
    setSdraft(next);
    setSettings(next);
  }

  function sendTicket() {
    if (!supportNotes.trim() && supportType === SUPPORT_TYPES[3]) {
      toast.error("Inserisci una descrizione");
      return;
    }
    const t: SupportTicket = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      type: supportType ?? SUPPORT_TYPES[0]!,
      notes: supportNotes.trim(),
    };
    addTicket(t);
    setSupportType(SUPPORT_TYPES[0]);
    setSupportNotes("");
    setShowSupport(false);
    toast.success("Segnalazione inviata");
  }

  return (
    <Shell title="Impostazioni" onClose={onClose}>
      {/* Preferences */}
      <section className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Moon className="h-4 w-4" /> Preferenze App
        </div>
        <SettingRow
          icon={<Moon className="h-4 w-4" />}
          label="Dark Mode"
          description="Tema scuro per l'app"
          on={cs.darkMode}
          onChange={(v) => update({ darkMode: v })}
        />
        <div className="border-t border-border/70" />
        <SettingRow
          icon={
            cs.notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />
          }
          label="Promemoria attività"
          description="Avviso prima dell'orario di inizio delle attività del giorno"
          on={cs.notificationsEnabled}
          onChange={async (v) => {
            if (v) {
              const perm = await requestNotificationPermission();
              if (perm === "denied") {
                toast.error(
                  "Notifiche bloccate dal browser: abilitale nelle impostazioni del sito.",
                );
              } else if (perm === "unsupported") {
                toast.info("Notifiche di sistema non supportate: riceverai gli avvisi nell'app.");
              }
            }
            update({ notificationsEnabled: v });
          }}
        />
        {cs.notificationsEnabled && (
          <div className="ml-12 mb-2 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Anticipo promemoria
              </label>
              <select
                value={cs.reminderMinutesBefore}
                onChange={(e) => update({ reminderMinutesBefore: Number(e.target.value) })}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {[10, 15, 30, 60, 120].map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minuti prima` : `${m / 60} ${m === 60 ? "ora" : "ore"} prima`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Orario riepilogo giornaliero
              </label>
              <input
                type="time"
                value={cs.reminderTime}
                onChange={(e) => update({ reminderTime: e.target.value })}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </section>

      <div className="my-4 border-t border-border/70" />

      {/* Data & Connection */}
      <section className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <HardDrive className="h-4 w-4" /> Dati & Connessione
        </div>
        <SettingRow
          icon={<HardDrive className="h-4 w-4" />}
          label="Sincronizzazione offline"
          description="Salva i report anche senza connessione"
          on={cs.offlineSync}
          onChange={(v) => update({ offlineSync: v })}
        />
        <div className="border-t border-border/70" />
        <SettingRow
          icon={<Globe className="h-4 w-4" />}
          label="Geolocalizzazione"
          description="Rileva posizione durante l'audit"
          on={cs.geolocation}
          onChange={(v) => update({ geolocation: v })}
        />
      </section>

      <div className="my-4 border-t border-border/70" />

      {/* Data Status & Assistance */}
      <section className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Database className="h-4 w-4" /> Stato Dati & Assistenza
        </div>
        {!showContacts ? (
          <button
            type="button"
            onClick={() => {
              setContacts(loadContacts());
              setShowContacts(true);
            }}
            className="min-h-11 w-full rounded-full border border-border px-6 text-sm font-medium text-foreground"
          >
            Visualizza recapiti inviati al team ufficio
          </button>
        ) : (
          <div className="space-y-3">
            {contacts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nessun recapito registrato. Sul dispositivo restano solo i contatti mascherati: il
                dato completo è cifrato nel vault aziendale.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">PV</th>
                      <th className="pb-2 pr-2 font-medium">Email</th>
                      <th className="pb-2 pr-2 font-medium">Telefono</th>
                      <th className="pb-2 font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => {
                      // stato letto dal vault aziendale: la cancellazione la esegue l'ufficio privacy
                      const v = getWarehouse().vault.find((x) => x.submissionId === c.reportId);
                      const erased = v?.status === "erased";
                      return (
                        <tr key={c.id} className="border-b border-border/40">
                          <td className="py-2 pr-2 text-muted-foreground">{c.storeCode ?? "—"}</td>
                          <td className="py-2 pr-2 font-mono text-xs text-foreground">
                            {c.email || "—"}
                          </td>
                          <td className="py-2 pr-2 font-mono text-xs text-foreground">
                            {c.phone || "—"}
                          </td>
                          <td className="py-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                                erased
                                  ? "bg-success/15 text-success"
                                  : "bg-primary/10 text-primary",
                              )}
                            >
                              {erased ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <Clock className="h-3 w-3" />
                              )}
                              {erased
                                ? "Dati eliminati"
                                : v
                                  ? "Pratica in corso"
                                  : "In attesa di sync"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowContacts(false)}
              className="min-h-10 w-full rounded-full border border-border px-4 text-sm font-medium text-muted-foreground"
            >
              Chiudi
            </button>
          </div>
        )}
      </section>

      <div className="my-4 border-t border-border/70" />

      {/* Assistance */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Assistenza
        </div>
        {!showSupport ? (
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="min-h-11 w-full rounded-full border border-primary px-6 text-sm font-medium text-primary"
          >
            Segnala un Problema / Assistenza
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tipologia problema</label>
              <select
                value={supportType}
                onChange={(e) => setSupportType(e.target.value)}
                className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {SUPPORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Note</label>
              <textarea
                rows={4}
                value={supportNotes}
                onChange={(e) => setSupportNotes(e.target.value)}
                placeholder="Descrivi il problema…"
                className="w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSupport(false)}
                className="min-h-11 flex-1 rounded-full border border-border px-4 text-sm font-medium text-muted-foreground"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={sendTicket}
                className="min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Invia segnalazione
              </button>
            </div>
          </div>
        )}
      </section>
    </Shell>
  );
}
