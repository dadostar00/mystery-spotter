import { useCallback, useEffect, useState } from "react";
import type { Answers, ReportType, Store } from "@/domain/questionnaire";

export interface AuditorProfile {
  name: string;
  birthDate: string; // GG/MM/AAAA
  /** true = dimostra più di 18 anni, false = no, null = non dichiarato/non richiesto */
  appearsOver18: boolean | null;
  auditorId: string;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  reminderTime: string; // HH:MM
  /** Minuti di anticipo del promemoria rispetto all'orario di inizio attività */
  reminderMinutesBefore: number;
  darkMode: boolean;
  offlineSync: boolean;
  geolocation: boolean;
}

export interface SupportTicket {
  id: string;
  createdAt: string;
  type: string;
  notes: string;
}

export interface TrackedContact {
  id: string;
  reportId: string;
  createdAt: string;
  storeCode: string | null;
  email: string;
  phone: string;
  status: "Pratica in corso" | "Pratica completata / Dati eliminati";
}

export interface SavedReport {
  id: string;
  createdAt: string;
  activityType: string;
  store: Store | null;
  collaborating: boolean;
  status: "Completato" | "Audit Interrotto";
  reportType: ReportType | null;
  ageVerificationEnabled: boolean;
  answers: Answers;
}

export type ActivityStatus = "Pianificata" | "Completata" | "Audit Interrotto";

export interface Activity {
  id: string;
  /** AAAA-MM-GG */
  date: string;
  /** HH:MM */
  time: string;
  activityType: string;
  store: Store | null;
  status: ActivityStatus;
  reportId?: string;
}

const PROFILE_KEY = "mystery.profile";
const SETTINGS_KEY = "mystery.settings";
const TICKETS_KEY = "mystery.tickets";
const REPORTS_KEY = "mystery.reports";
const ACTIVITIES_KEY = "mystery.activities";
const CONTACTS_KEY = "mystery.contacts";
const ONBOARDED_KEY = "mystery.onboarded";

const DEFAULT_SETTINGS: AppSettings = {
  notificationsEnabled: false,
  reminderTime: "08:00",
  reminderMinutesBefore: 30,
  darkMode: false,
  offlineSync: false,
  geolocation: false,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadProfile(): AuditorProfile {
  return read<AuditorProfile>(PROFILE_KEY, {
    name: "",
    birthDate: "",
    appearsOver18: null,
    auditorId: "",
  });
}

export function saveProfile(p: AuditorProfile) {
  write(PROFILE_KEY, p);
}

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(s: AppSettings) {
  write(SETTINGS_KEY, s);
}

export function loadTickets(): SupportTicket[] {
  return read<SupportTicket[]>(TICKETS_KEY, []);
}

export function addTicket(t: SupportTicket) {
  write(TICKETS_KEY, [t, ...loadTickets()]);
}

export function loadReports(): SavedReport[] {
  return read<SavedReport[]>(REPORTS_KEY, []);
}

export function saveReport(r: SavedReport) {
  const all = loadReports();
  write(REPORTS_KEY, [r, ...all]);
}

export function getReport(id: string | undefined): SavedReport | null {
  if (!id) return null;
  return loadReports().find((r) => r.id === id) ?? null;
}

export function loadActivities(): Activity[] {
  return read<Activity[]>(ACTIVITIES_KEY, []).sort((a, b) =>
    `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
  );
}

function writeActivities(list: Activity[]) {
  write(ACTIVITIES_KEY, list);
}

export function addActivity(a: Activity) {
  writeActivities([...loadActivities(), a]);
}

export function updateActivity(id: string, patch: Partial<Activity>) {
  writeActivities(loadActivities().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function deleteActivity(id: string) {
  writeActivities(loadActivities().filter((a) => a.id !== id));
}

export function loadContacts(): TrackedContact[] {
  return read<TrackedContact[]>(CONTACTS_KEY, []);
}

export function addContact(c: TrackedContact) {
  write(CONTACTS_KEY, [c, ...loadContacts()]);
}

export function updateContactStatus(id: string, status: TrackedContact["status"]) {
  write(
    CONTACTS_KEY,
    loadContacts().map((c) => (c.id === id ? { ...c, status } : c)),
  );
}

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDED_KEY) === "true";
}

export function setOnboarded(v: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDED_KEY, v ? "true" : "false");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useProfile() {
  const [profile, setProfileState] = useState<AuditorProfile>({
    name: "",
    birthDate: "",
    appearsOver18: null,
    auditorId: "",
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfileState(loadProfile());
    setLoaded(true);
  }, []);

  const update = useCallback((p: AuditorProfile) => {
    setProfileState(p);
    saveProfile(p);
  }, []);

  return { profile, setProfile: update, loaded };
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettingsState(loadSettings());
    setLoaded(true);
  }, []);

  const update = useCallback((s: AppSettings) => {
    setSettingsState(s);
    saveSettings(s);
  }, []);

  return { settings, setSettings: update, loaded };
}
