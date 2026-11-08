import {
  CircleCheck,
  CircleAlert,
  CircleX,
  ShieldAlert,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Disposition, FlagSeverity, StageStatus } from "@/domain/pipeline/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  actions,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5", className)}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "bad" | undefined;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight text-foreground",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const DISPOSITION: Record<Disposition, { label: string; icon: LucideIcon; dot: string }> = {
  ACCEPTED: { label: "Accettato", icon: CircleCheck, dot: "text-status-good" },
  ACCEPTED_WITH_WARNINGS: { label: "Con avvisi", icon: CircleAlert, dot: "text-status-warning" },
  QUARANTINED: { label: "Quarantena", icon: ShieldAlert, dot: "text-status-serious" },
  REJECTED: { label: "Rifiutato", icon: CircleX, dot: "text-status-critical" },
};

export const DISPOSITION_LABEL = Object.fromEntries(
  Object.entries(DISPOSITION).map(([k, v]) => [k, v.label]),
) as Record<Disposition, string>;

export const DISPOSITION_COLOR: Record<Disposition, string> = {
  ACCEPTED: "var(--status-good)",
  ACCEPTED_WITH_WARNINGS: "var(--status-warning)",
  QUARANTINED: "var(--status-serious)",
  REJECTED: "var(--status-critical)",
};

/** Lo stato non è mai affidato al solo colore: icona + etichetta. */
export function DispositionBadge({ value }: { value: Disposition }) {
  const d = DISPOSITION[value];
  const Icon = d.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
      <Icon className={cn("h-3.5 w-3.5", d.dot)} aria-hidden />
      {d.label}
    </span>
  );
}

const SEVERITY: Record<FlagSeverity, { label: string; icon: LucideIcon; cls: string }> = {
  info: { label: "Info", icon: Info, cls: "text-muted-foreground" },
  warning: { label: "Avviso", icon: CircleAlert, cls: "text-status-warning" },
  quarantine: { label: "Quarantena", icon: ShieldAlert, cls: "text-status-serious" },
  error: { label: "Bloccante", icon: CircleX, cls: "text-status-critical" },
};

export function SeverityIcon({ value, className }: { value: FlagSeverity; className?: string }) {
  const s = SEVERITY[value];
  const Icon = s.icon;
  return <Icon className={cn("h-4 w-4 shrink-0", s.cls, className)} aria-label={s.label} />;
}

export function severityLabel(v: FlagSeverity) {
  return SEVERITY[v].label;
}

const STAGE: Record<StageStatus, { icon: LucideIcon; cls: string; label: string }> = {
  pass: { icon: CircleCheck, cls: "text-status-good", label: "OK" },
  warn: { icon: CircleAlert, cls: "text-status-warning", label: "Avvisi" },
  fail: { icon: CircleX, cls: "text-status-critical", label: "Fallito" },
  skipped: { icon: Info, cls: "text-muted-foreground", label: "Saltato" },
};

export function StageIcon({ status }: { status: StageStatus }) {
  const s = STAGE[status];
  const Icon = s.icon;
  return <Icon className={cn("h-4 w-4 shrink-0", s.cls)} aria-label={s.label} />;
}

export const STAGE_LABEL: Record<string, string> = {
  schema: "Validazione contratto",
  referential: "Integrità referenziale",
  consistency: "Coerenza rami condizionali",
  business_rules: "Regole di business",
  privacy: "Privacy & pseudonimizzazione",
  scoring: "Scoring compliance",
  dedup: "Deduplica",
  cross_report: "Controlli cross-report",
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" &&
          "border border-border bg-card text-foreground hover:bg-secondary",
        variant === "danger" &&
          "border border-destructive/40 bg-card text-destructive hover:bg-destructive/10",
        variant === "ghost" && "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function fmtPct(x: number | null, digits = 0) {
  return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}
