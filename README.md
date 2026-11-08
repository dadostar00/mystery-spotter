# Fieldsight

**Dal rilievo sul campo al dato su cui decidere.**

Fieldsight è un concept end-to-end per gli audit mystery nei punti vendita retail. Non è solo un questionario: è il percorso completo del dato, da quando l'auditor tocca lo schermo a quando un KPI compare in dashboard.

| | |
|---|---|
| **App auditor** `/app` | PWA mobile, offline-first, installabile dal browser. Questionario con rami condizionali, outbox di sincronizzazione, esito della validazione restituito all'auditor. |
| **API di ingestione** `POST /api/v1/reports` | Endpoint HTTP reale sull'edge (Cloudflare Workers). Contratto dati versionato, risposte `202` / `422` con elenco delle violazioni. |
| **Pipeline** | 8 stage tracciati: contratto → anagrafiche → coerenza dei rami → regole di business → privacy → scoring → deduplica → controlli cross-report. |
| **Console aziendale** `/console` | KPI di compliance, log di ingestione con lineage, coda di revisione, classifica PV, gestione privacy/GDPR, playground API ed export. |
| **Dati** | Schema PostgreSQL di produzione con vincoli testati, analisi Python/DuckDB sugli export. |

> **Demo** — alla prima apertura la console genera 8 settimane di audit sintetici (180 submission con anomalie note) e li fa passare dalla pipeline reale. Il "warehouse" della demo vive nel browser di chi la visita: ognuno ha la propria sandbox, resettabile da *Dati & API*.

---

## Il flusso del dato

```
 App auditor (PWA)            API edge                    Pipeline                         Data store                 Consumo
┌──────────────────┐  POST  ┌──────────────┐   ┌─────────────────────────────┐   ┌──────────────────────┐   ┌──────────────────┐
│ questionario     │ ─────► │ /api/v1/     │ ─►│ 1 contratto (Zod)           │ ─►│ fact report          │ ─►│ console KPI      │
│ + outbox offline │  JSON  │   reports    │   │ 2 integrità referenziale    │   │ risposte (long)      │   │ revisione        │
│ PII separati     │ ◄───── │ 202 / 422    │   │ 3 coerenza rami condizionali│   │ vault PII cifrato    │   │ export NDJSON/CSV│
│ foto → hash      │ esito  └──────────────┘   │ 4 regole di business        │   │ dead-letter queue    │   │ Python · DuckDB  │
└──────────────────┘                           │ 5 privacy (HMAC + AES-GCM)  │   │ audit log            │   └──────────────────┘
                                               │ 6 scoring compliance        │   └──────────────────────┘
                                               │ 7 dedup  8 cross-report     │
                                               └─────────────────────────────┘
```

Ogni submission esce dalla pipeline con un **esito**:

| Esito | Significato | Nei KPI? |
|---|---|---|
| `ACCEPTED` | nessuna anomalia | sì |
| `ACCEPTED_WITH_WARNINGS` | anomalie non bloccanti (es. prezzo statisticamente anomalo) | sì |
| `QUARANTINED` | dato dubbio (seriale già rimborsato, scontrino mancante, visita di 2 minuti…) | solo se un operatore lo approva |
| `REJECTED` | viola contratto o regole bloccanti; se il payload è malformato finisce in dead-letter | no |

Dettagli in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Scelte tecniche

- **Un solo linguaggio end-to-end (TypeScript)**: lo stesso schema Zod valida il payload nel browser, sull'endpoint e nei test. La pipeline è codice isomorfo: gira sull'edge e, se il backend non è raggiungibile, identica nel client.
- **Idempotenza** tramite `submissionId` generato alla creazione della bozza: i retry dall'offline non creano duplicati.
- **Privacy by design**: i contatti dei consumatori vengono separati già sul device, pseudonimizzati con HMAC-SHA256, cifrati AES-256-GCM con chiave per record. Cancellare la chiave (*crypto-shredding*) rende il dato irrecuperabile; retention automatica a 30 giorni, accessi registrati nell'audit log.
- **Qualità del dato prima dei grafici**: z-score robusto (mediana/MAD) per i prezzi, hash SHA-256 del contenuto per i doppi invii, ricalcolo lato server dei rami condizionali per eliminare risposte orfane.
- **Vincoli nel database**, non solo nell'interfaccia: `db/schema.sql` impone completamento al 100%, revisioni firmate, unicità dei seriali rimborsati, audit log append-only. Ogni vincolo ha un test che prova a violarlo.
- **Analisi statistica sugli export**: `analytics/kpi_report.py` stima l'effetto auditor con un modello a effetti fissi (PV + auditor) per scovare chi valuta in modo sistematicamente diverso. Il dataset demo contiene un bias piantato e lo script lo ritrova.

## Stack

| Area | Tecnologie |
|---|---|
| Frontend | React 19, TypeScript (strict), TanStack Router/Start, Tailwind CSS 4, Radix UI, Recharts |
| Backend / edge | TanStack Start server routes, Nitro → Cloudflare Workers, Web Crypto API |
| Contratti e validazione | Zod |
| Database | PostgreSQL 16 (schema di riferimento), PGlite per i test |
| Analytics | Python 3.13, DuckDB |
| Qualità | Vitest, ESLint, Prettier, GitHub Actions |

## Avvio locale

Requisiti: Node.js ≥ 22.12 (Python 3.11+ solo per `analytics/`).

```bash
npm install
npm run dev          # http://localhost:5173  → /, /app, /console
npm test             # pipeline, integrazione app→contratto, vincoli PostgreSQL
npm run typecheck
npm run build        # bundle per Cloudflare Workers in .output/
```

Provare l'API:

```bash
curl -X POST http://localhost:5173/api/v1/reports \
  -H "content-type: application/json" \
  -d '{"schemaVersion":"1.0","submissionId":"not-a-uuid"}'
# → 422 con l'elenco delle violazioni del contratto
```

Analisi sugli export (stessi file scaricabili dalla console):

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r analytics/requirements.txt
python analytics/kpi_report.py --md report.md
```

Variabili d'ambiente: `PII_PEPPER` (segreto HMAC per la pseudonimizzazione; in assenza si usa un valore demo).

## Struttura

```
src/
  domain/            logica di dominio, senza dipendenze dalla UI
    questionnaire.ts   catalogo domande e rami condizionali
    contract.ts        contratto dati v1 (Zod)
    catalog.ts         regole di scoring "as data"
    master-data.ts     anagrafiche PV e listini
    pipeline/          stage stateless (process.ts), stateful (stateful.ts), privacy
  field/             lato app: costruzione payload, outbox offline
  warehouse/         repository, query semantiche, export, generatore dati demo
  routes/
    index.tsx          presentazione
    app/…              app auditor
    console/…          console aziendale
    api/v1/reports.ts  endpoint di ingestione
db/                  schema PostgreSQL + test dei vincoli
analytics/           report KPI e calibrazione auditor (Python · DuckDB)
docs/                architettura, workflow, piano di test
```

## Documentazione

| Documento | Contenuto |
|---|---|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Flusso del dato, stage della pipeline, catalogo dei flag, decisioni e limiti della demo |
| [DATABASE_ARCHITECTURE.md](./docs/DATABASE_ARCHITECTURE.md) | Modello dati, confronto con il sistema legacy, migrazione |
| [AUDIT_WORKFLOW_LOGIC.md](./docs/AUDIT_WORKFLOW_LOGIC.md) | Ciclo di vita del report e dipendenze condizionali tra domande |
| [QA_TEST_PLAN.md](./docs/QA_TEST_PLAN.md) | Strategia di test e copertura |
