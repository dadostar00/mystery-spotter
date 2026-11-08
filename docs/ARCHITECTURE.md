# Architettura del dato

Questo documento descrive come Fieldsight riceve, controlla, trasforma ed espone i report degli audit. Il codice citato è nel repository: ogni affermazione ha un file di riferimento.

## 1. Raccolta (app auditor)

`src/field/submission.ts`, `src/field/outbox.ts`

1. Alla creazione della bozza l'app genera un `submissionId` (UUID v4). È la **chiave di idempotenza** di tutto il sistema.
2. Al salvataggio lo stato del questionario viene mappato nel contratto v1:
   - email e telefono del consumatore escono dalle risposte e vanno nel blocco `consumer` (isolamento dei PII alla fonte);
   - le foto diventano metadati (`sha256`, `bytes`, `mimeType`): in produzione il binario va su object storage con URL firmato, non nel JSON;
   - i numeri inseriti come testo (`"39,00"`) vengono normalizzati.
3. Il payload viene scritto in una **outbox** locale e solo dopo inviato. Senza rete resta in coda e riparte all'evento `online`. Sul device restano solo contatti mascherati.
4. L'esito della pipeline (accettato, in revisione, rifiutato + motivazioni + score) torna all'auditor: il feedback chiude il ciclo.

## 2. Ingestione (API)

`src/routes/api/v1/reports.ts`

| Richiesta | Risposta |
|---|---|
| `POST /api/v1/reports` JSON valido | `202 Accepted` con esito, stage e flag |
| payload fuori contratto o regole bloccanti violate | `422` con elenco `{ path, message }` |
| `Content-Type` diverso da JSON | `415` |
| body > 256 KB | `413` |
| `GET /api/v1/reports` | descrizione del servizio e versioni |

Ogni risposta porta `x-request-id` e `x-pipeline-version`; ogni richiesta produce una riga di log strutturato JSON.

> **Limite della demo.** Il sito è distribuito come Worker senza database, quindi l'API elabora e restituisce i record da persistere, che il browser salva nel proprio "warehouse". In produzione l'API scrive direttamente su PostgreSQL (`db/schema.sql`) e la risposta contiene solo l'esito. Il confine è isolato in `src/warehouse/store.ts` (repository) e `src/warehouse/ingestion-client.ts`.

## 3. Pipeline

`src/domain/pipeline/process.ts` (stateless), `src/domain/pipeline/stateful.ts` (con storico)

| # | Stage | Cosa verifica | Esempi di flag |
|---|---|---|---|
| 1 | Contratto | schema Zod v1, tipi, formati, UUID, date ISO | `SCHEMA_VIOLATION` → dead-letter |
| 2 | Integrità referenziale | PV in anagrafica, domande a catalogo, valori tra le opzioni ammesse | `UNKNOWN_STORE`, `INVALID_VALUE`, `UNKNOWN_QUESTION` |
| 3 | Coerenza rami | ricalcola lato server quali domande erano attive; rimuove le risposte orfane; completamento al 100% | `ORPHAN_ANSWER`, `INCOMPLETE_REPORT` |
| 4 | Regole di business | durata minima visita, clock skew, prezzo vs listino, scontrino per i rimborsi, consenso privacy | `VISIT_TOO_SHORT`, `PRICE_OUT_OF_RANGE`, `MISSING_RECEIPT`, `CONSENT_MISSING` |
| 5 | Privacy | token HMAC, mascheramento, cifratura AES-256-GCM, retention | — |
| 6 | Scoring | conformità per modulo, score ponderato (A 25%, B 25%, C 30%, D 20%), KPI di visita | — |
| 7 | Deduplica | idempotenza su `submissionId`; hash SHA-256 del contenuto per doppi invii con id diverso | `DUPLICATE_CONTENT` |
| 8 | Cross-report | seriali già rimborsati, z-score robusto dei prezzi per modello, visite ripetute | `DUPLICATE_SERIAL`, `PRICE_OUTLIER`, `REPEATED_VISIT` |

Severità: `warning` (accettato e segnalato) · `quarantine` (escluso dai KPI fino a revisione) · `error` (rifiutato).

### Perché ricalcolare i rami condizionali sul server

Il questionario si ramifica (hostess assente → moduli B–D bloccati; acquisto GLO con bundle → modulo contatti). Se l'auditor cambia una risposta "padre", le risposte figlie già compilate restano in bozza. Fidarsi del client significherebbe contarle nello score. La pipeline usa **lo stesso catalogo** (`src/domain/questionnaire.ts`) per ricostruire il percorso valido e scarta il resto, tracciandolo.

### Prezzi anomali

Lo z-score classico usa media e deviazione standard, che sono proprio le statistiche distorte dagli outlier. Si usa lo **z-score robusto** di Iglewicz–Hoaglin, `0.6745·(x − mediana)/MAD`, con soglia 3.5 e ripiego sulla deviazione media assoluta quando oltre metà dei prezzi coincide con il listino (MAD = 0).

## 4. Data store

Modello di produzione in [`db/schema.sql`](../db/schema.sql), testato in [`db/schema.test.ts`](../db/schema.test.ts).

- `core.submission` — landing del payload redatto (lineage e riprocessamento)
- `core.report` — fact, un record per submission
- `core.answer` — risposte in formato long, tipizzate, una sola colonna valorizzata per riga
- `core.report_flag`, `core.dead_letter`
- `vault.consumer_contact` — PII cifrati, schema e ruolo dedicati
- `audit.event` — append-only (trigger che blocca UPDATE/DELETE)
- `mart.*` — viste con le stesse metriche della console

## 5. Consumo

- **Console** (`src/routes/console/*`): le metriche sono definite una volta in `src/warehouse/queries.ts` (layer semantico) e corrispondono alle viste `mart.*`.
- **Revisione**: approvare o rifiutare richiede una motivazione, registrata con autore e data.
- **Privacy**: visualizzazione mascherata, accesso in chiaro temporaneo e tracciato, cancellazione su richiesta, job di retention.
- **Export**: `fact_report.ndjson`, `fact_answer.csv` (long), `store_kpi.csv`.
- **Analytics** (`analytics/kpi_report.py`): DuckDB sugli export; include la calibrazione degli auditor con modello a effetti fissi PV + auditor.

## 6. Dataset demo

`src/warehouse/seed.ts` percorre il questionario reale con un PRNG deterministico e inietta anomalie note: prezzi fuori listino, seriali duplicati, visite di 2 minuti, scontrini mancanti, PV inesistente, payload malformati, risposte orfane, doppi invii, consenso negato e un auditor sistematicamente severo. `src/warehouse/seed.test.ts` verifica che ogni anomalia venga intercettata.

## 7. Evoluzione verso la produzione

| Demo | Produzione |
|---|---|
| warehouse nel browser | PostgreSQL gestito (Neon/Supabase/RDS) o Cloudflare D1 + Hyperdrive |
| chiavi AES nel localStorage | KMS (AWS KMS, Cloudflare Secrets) con envelope encryption |
| autenticazione assente | OIDC (Entra ID / Auth0), ruoli `ingest`, `analyst`, `privacy` già modellati nello schema |
| foto come hash | upload diretto su R2/S3 con URL firmato, antivirus, EXIF stripping |
| job di retention manuale | `pg_cron` / Cloudflare Cron Triggers |
| export manuale | CDC verso il data warehouse aziendale (BigQuery/Snowflake), modelli dbt |
