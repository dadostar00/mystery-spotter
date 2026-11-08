import { useEffect } from "react";
import { toast } from "sonner";

import { loadActivities, loadSettings, todayISO, type Activity } from "./audit-storage";

const FIRED_KEY = "mystery.remindersFired";

function loadFired(): string[] {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markFired(key: string) {
  const next = [...loadFired(), key].slice(-200);
  window.localStorage.setItem(FIRED_KEY, JSON.stringify(next));
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function activityLabel(a: Activity) {
  const store = a.store ? `${a.store.code} — ${a.store.city}` : "Punto vendita n/d";
  return `${a.time} · ${store} · ${a.activityType}`;
}

function notify(title: string, body: string) {
  if (notificationsSupported() && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/icon-192.png", tag: title + body });
      return;
    } catch {
      /* fall through to toast */
    }
  }
  toast.info(title, { description: body, duration: 10000 });
}

/** Checks today's planned activities and fires reminders due within the lead time. */
export function checkReminders() {
  if (typeof window === "undefined") return;
  const settings = loadSettings();
  if (!settings.notificationsEnabled) return;

  const lead = settings.reminderMinutesBefore ?? 30;
  const today = todayISO();
  const now = new Date();
  const fired = loadFired();

  // Riepilogo giornaliero all'orario impostato
  const [rh, rm] = (settings.reminderTime || "08:00").split(":").map(Number);
  const summaryTime = new Date(now);
  summaryTime.setHours(rh ?? 8, rm ?? 0, 0, 0);
  const minsSinceSummary = (now.getTime() - summaryTime.getTime()) / 60000;
  const summaryKey = `summary-${today}`;
  const todays = loadActivities().filter((a) => a.date === today && a.status === "Pianificata");
  if (
    minsSinceSummary >= 0 &&
    minsSinceSummary < 60 &&
    !fired.includes(summaryKey) &&
    todays.length > 0
  ) {
    markFired(summaryKey);
    notify(
      "Attività di oggi",
      todays.length === 1
        ? activityLabel(todays[0]!)
        : `Hai ${todays.length} attività pianificate oggi.`,
    );
  }

  loadActivities()
    .filter((a) => a.date === today && a.status === "Pianificata")
    .forEach((a) => {
      const [h, m] = a.time.split(":").map(Number);
      const start = new Date(now);
      start.setHours(h ?? 0, m ?? 0, 0, 0);
      const minutesToStart = (start.getTime() - now.getTime()) / 60000;
      if (minutesToStart > lead || minutesToStart < -5) return;

      const key = `${today}-${a.id}`;
      if (fired.includes(key)) return;
      markFired(key);

      const when =
        minutesToStart <= 0
          ? "Inizia ora"
          : `Inizia tra ${Math.max(1, Math.round(minutesToStart))} minuti`;
      notify("Promemoria attività", `${when} — ${activityLabel(a)}`);
    });
}

/** Polls for due reminders while the app is open. */
export function useActivityReminders() {
  useEffect(() => {
    checkReminders();
    const id = window.setInterval(checkReminders, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkReminders();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
