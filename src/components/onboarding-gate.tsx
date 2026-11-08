import { CalendarDays, ShieldCheck, TriangleAlert as AlertTriangle, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { computeAge, isAgeVerificationEnabled } from "@/domain/questionnaire";
import { isOnboarded, saveProfile, setOnboarded, type AuditorProfile } from "@/lib/audit-storage";
import { cn } from "@/lib/utils";

function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean);
  return parts.join("/");
}

export function OnboardingGate({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState("");
  const [auditorId, setAuditorId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [appearsOver18, setAppearsOver18] = useState<boolean | null>(null);

  const age = computeAge(birthDate);
  const minorError = age !== null && age < 18;
  const needsAppearance = age !== null && age >= 18 && age <= 25;
  const canSubmit =
    name.trim() !== "" &&
    auditorId.trim() !== "" &&
    age !== null &&
    age >= 18 &&
    (!needsAppearance || appearsOver18 !== null);

  function submit() {
    if (!canSubmit) return;
    const profile: AuditorProfile = {
      name: name.trim(),
      auditorId: auditorId.trim(),
      birthDate,
      appearsOver18,
    };
    saveProfile(profile);
    setOnboarded(true);
    toast.success(`Benvenuto, ${name.trim()}`);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-14 w-14" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">Fieldsight · App auditor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inserisci i tuoi dati per accedere all'applicazione
          </p>
          <a href="/" className="mt-2 inline-block text-xs font-medium text-primary">
            ← Torna alla presentazione
          </a>
        </div>

        <div className="space-y-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border/60">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <UserRound className="h-4 w-4" /> Nome auditor
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome e cognome"
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Codice ID Auditor
            </span>
            <input
              value={auditorId}
              onChange={(e) => setAuditorId(e.target.value)}
              placeholder="Es. MA-2024-001"
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CalendarDays className="h-4 w-4" /> Data di nascita (GG/MM/AAAA)
            </span>
            <input
              inputMode="numeric"
              value={birthDate}
              onChange={(e) => {
                setBirthDate(maskDate(e.target.value));
                setAppearsOver18(null);
              }}
              placeholder="01/01/2000"
              aria-invalid={minorError}
              className={cn(
                "w-full rounded-xl border bg-card px-4 py-3 text-sm outline-none focus:ring-2",
                minorError
                  ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                  : "border-input focus:border-primary focus:ring-primary/20",
              )}
            />
          </label>

          {minorError && (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              L'auditor deve avere almeno 18 anni.
            </p>
          )}

          {needsAppearance && (
            <div className="rounded-xl bg-secondary/60 p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Dimostri più di 18 anni?</p>
              <div className="flex gap-2">
                {[
                  { label: "Sì", value: true },
                  { label: "No", value: false },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setAppearsOver18(o.value)}
                    className={cn(
                      "min-h-10 flex-1 rounded-full border px-4 text-sm font-medium transition-colors",
                      appearsOver18 === o.value
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

          {age !== null && age >= 18 && (
            <p className="text-xs text-muted-foreground">
              Età: {age} anni —{" "}
              {isAgeVerificationEnabled(birthDate, appearsOver18)
                ? "Verifica Età attiva nei report"
                : "Verifica Età disattivata"}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="min-h-12 w-full rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Accedi
        </button>
      </div>
    </div>
  );
}

export function checkOnboarded(): boolean {
  return isOnboarded();
}
