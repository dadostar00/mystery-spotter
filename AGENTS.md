# Fieldsight

Retail audit data platform: PWA offline-first per gli auditor (`/app`), API di ingestione (`POST /api/v1/reports`), pipeline di qualità/privacy e console aziendale (`/console`).

- Logica di dominio in `src/domain/` (nessuna dipendenza dalla UI); il contratto dati è `src/domain/contract.ts`.
- Prima di consegnare: `npm run typecheck && npm test && npm run build`.
- Vedi `docs/ARCHITECTURE.md` per il flusso del dato.
