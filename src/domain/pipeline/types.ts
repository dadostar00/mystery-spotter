import type { AnswerValue, ReportSubmission } from "../contract";
import type { Region } from "../master-data";

export const PIPELINE_VERSION = "2026.11.1";

export type StageName =
  | "schema"
  | "referential"
  | "consistency"
  | "business_rules"
  | "privacy"
  | "scoring"
  | "dedup"
  | "cross_report";

export type StageStatus = "pass" | "warn" | "fail" | "skipped";

export interface StageResult {
  stage: StageName;
  status: StageStatus;
  durationMs: number;
  notes: string[];
}

/**
 * info: solo tracciamento · warning: accettato ma segnalato
 * quarantine: escluso dalle analisi finché un operatore non lo rivede · error: rifiutato
 */
export type FlagSeverity = "info" | "warning" | "quarantine" | "error";

export interface Flag {
  code: string;
  severity: FlagSeverity;
  stage: StageName;
  message: string;
  questionId?: string;
}

export type Disposition = "ACCEPTED" | "ACCEPTED_WITH_WARNINGS" | "QUARANTINED" | "REJECTED";

export type ReviewStatus = "none" | "pending" | "approved" | "rejected";

export interface NormalizedAnswer {
  questionId: string;
  moduleId: string;
  label: string;
  value: AnswerValue;
  /** true = conforme, false = non conforme, null = non valutabile (es. "Non Applicabile") */
  compliant: boolean | null;
}

export interface ModuleScore {
  moduleId: string;
  title: string;
  score: number | null;
  compliant: number;
  scorable: number;
}

export interface VisitKpis {
  hostessPresent: boolean | null;
  proactiveEngagement: boolean | null;
  ageCheckPerformed: boolean | null;
  productsPresented: string[];
  purchase: boolean;
  deviceModel: string | null;
  devicePrice: number | null;
  deviceSerial: string | null;
  bundleSticks: number;
  durationMin: number;
}

export interface PiiVaultEntry {
  token: string;
  submissionId: string;
  storeCode: string;
  emailMasked: string | null;
  phoneMasked: string | null;
  consent: boolean;
  /** AES-GCM: il dato in chiaro esiste solo cifrato; la chiave è in un keystore separato. */
  ciphertext: string;
  iv: string;
  keyId: string;
  createdAt: string;
  retentionUntil: string;
  status: "active" | "erased";
  erasedAt?: string;
  erasureReason?: string;
}

/** Riga del fact "report" nel warehouse: niente PII in chiaro, niente binari. */
export interface ProcessedReport {
  submissionId: string;
  contentHash: string;
  pipelineVersion: string;
  receivedAt: string;
  processedAt: string;
  source: "api" | "local-fallback" | "seed";
  disposition: Disposition;
  review: { status: ReviewStatus; by?: string; at?: string; note?: string };
  stages: StageResult[];
  flags: Flag[];

  auditorId: string;
  storeCode: string;
  city: string | null;
  region: Region | null;
  activityType: string;
  reportType: string | null;
  outcome: "completed" | "interrupted";
  visitDate: string;
  startedAt: string;
  endedAt: string;

  completionPct: number;
  score: number | null;
  modules: ModuleScore[];
  kpis: VisitKpis;
  answers: NormalizedAnswer[];
  droppedAnswers: string[];
  attachments: ReportSubmission["attachments"];
  piiToken: string | null;
  /** Payload ricevuto con PII redatti, conservato per lineage e riprocessamento. */
  redactedPayload: unknown;
}

export interface ProcessingResult {
  disposition: Disposition;
  report: ProcessedReport | null;
  vault: PiiVaultEntry | null;
  /** chiave per-record (JWK) da salvare nel keystore separato */
  vaultKey: { keyId: string; jwk: JsonWebKey } | null;
  stages: StageResult[];
  flags: Flag[];
  errors: { path: string; message: string }[];
  /** Presente solo se il payload viola il contratto: finisce nella dead-letter queue. */
  deadLetter: DeadLetter | null;
}

export interface DeadLetter {
  id: string;
  receivedAt: string;
  source: ProcessedReport["source"];
  errors: { path: string; message: string }[];
  /** payload originale senza blocco consumer (mai PII in DLQ) */
  payload: unknown;
}
