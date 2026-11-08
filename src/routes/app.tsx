import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import {
  ChartBar as BarChart3,
  CalendarDays,
  ClipboardList,
  CloudOff,
  CloudUpload,
  LoaderCircle,
  Settings,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import { OnboardingGate } from "@/components/onboarding-gate";
import { ProfileModal, SettingsModal } from "@/components/profile-modal";
import { flush, useOutbox, useOutboxAutoSync } from "@/field/outbox";
import { isOnboarded, useProfile } from "@/lib/audit-storage";
import { useActivityReminders } from "@/lib/reminders";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "App auditor — Fieldsight" }] }),
  component: FieldAppLayout,
});

const NAV = [
  { to: "/app", label: "Oggi", icon: ClipboardList },
  { to: "/app/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/app/statistiche", label: "Statistiche", icon: BarChart3 },
] as const;

function SyncIndicator({ actor }: { actor: string }) {
  const { queue, syncing } = useOutbox();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
    };
  }, []);
  if (!queue.length && online) return null;
  return (
    <button
      type="button"
      onClick={() => void flush(actor)}
      title="Report in attesa di sincronizzazione"
      className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
    >
      {syncing ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : online ? (
        <CloudUpload className="h-3.5 w-3.5" />
      ) : (
        <CloudOff className="h-3.5 w-3.5" />
      )}
      {queue.length ? `${queue.length} in coda` : "Offline"}
    </button>
  );
}

function FieldAppLayout() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboarded, setOnboardedState] = useState<boolean | null>(null);
  const { profile } = useProfile();
  const actor = profile.auditorId || "auditor";
  useActivityReminders();
  useOutboxAutoSync(actor);

  useEffect(() => {
    setOnboardedState(isOnboarded());
  }, []);

  if (onboarded === null) return <div className="min-h-screen bg-background" />;
  if (!onboarded) return <OnboardingGate onComplete={() => setOnboardedState(true)} />;

  return (
    <div className="min-h-screen bg-background pb-20 font-sans">
      <header className="sticky top-0 z-20 border-b border-border bg-card text-card-foreground">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-7 w-7 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-tight text-foreground">
                Fieldsight
              </p>
              <p className="truncate text-xs text-muted-foreground">App auditor</p>
            </div>
          </Link>
          <SyncIndicator actor={actor} />
          <button
            type="button"
            aria-label="Impostazioni"
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-1.5 text-foreground transition-colors hover:bg-secondary"
          >
            <Settings className="h-5 w-5 shrink-0" />
          </button>
          <button
            type="button"
            aria-label="Profilo"
            onClick={() => setProfileOpen(true)}
            className="rounded-full p-1.5 text-foreground transition-colors hover:bg-secondary"
          >
            <UserRound className="h-5 w-5 shrink-0" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/app" }}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
