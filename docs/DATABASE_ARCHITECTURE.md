# Fieldsight — da legacy a nuovo: architettura del database

Il DDL PostgreSQL completo è in [`db/schema.sql`](../db/schema.sql); i vincoli sono verificati da [`db/schema.test.ts`](../db/schema.test.ts), che li viola di proposito su un vero PostgreSQL (PGlite).

## Il problema architetturale in una frase

Il legacy modella il questionario **come schema** (una colonna per ogni domanda, un `ALTER TABLE` per ogni modifica). Il nuovo sistema deve modellarlo **come dato** (domande e risposte come righe), perché la reingegnerizzazione introduce logica condizionale a cascata (GLO → Bundle → Acquisto → Recapiti) che uno schema piatto non può sostenere senza deploy continui.

## Cosa cambia, in tre punti

| | Legacy | Nuovo |
|---|---|---|
| **Domande** | Colonne fisse per modulo | Catalogo (`question_definitions`) + risposte atomiche collegate |
| **Utente/Auditor** | ID solo per login, età gestita a spezzoni nei form | Entità di dominio: onboarding obbligatorio, età come precondizione di accesso e gate per i campi condizionali |
| **Regole di business** | Solo lato client (es. invio report anche incompleto) | Vincolate a livello DB (es. `CHECK` che blocca lo stato "inviato" sotto il 100%) |

## Schema concettuale nuovo sistema

```
auditor ──< submission ──1:1── report ──< answer >── question
                │                 │
                │                 ├──< report_flag
                │                 └──< attachment
                └── (PII separati) ──0:1── vault.consumer_contact
```

Punti di design che ritengo rilevanti da discutere con un team:

- **Risposte tipizzate ma vincolate**: invece di un generico `JSONB`, uso colonne dedicate per tipo (bool stretto, bool+NA, testo, valuta...) con un `CHECK` che ne garantisce una sola valorizzata per riga. Più rigido di un EAV puro, ma permette di imporre a livello DB regole come "VELO/VUSE: solo Sì/No, mai Non Applicabile" — cosa che in JSONB richiederebbe validazione solo applicativa.
- **Privacy dei lead come entità a sé** (`vault.consumer_contact`, in uno schema separato con ruolo dedicato): il fact contiene solo un token pseudonimo; il dato è cifrato con chiave per record e la cancellazione distrugge la chiave (crypto-shredding). Retention gestita dalla procedura `vault.run_retention()`.
- **Vincolo di completamento report** spostato da UI a DB (`CHECK` su `completion_percentage = 100` per stato `SUBMITTED`): elimina strutturalmente il caso — permesso nel legacy — di report incompleti inviati.

## Il punto più delicato: la migrazione

Non è tecnico, è di business: lo storico legacy non ha età auditor né percentuale di completamento affidabile. Due decisioni da prendere esplicitamente col prodotto prima dell'ETL:
1. Gli auditor migrati partono in stato "onboarding da completare" (non si inventa un'età mancante).
2. I report storici incompleti non possono semplicemente diventare "SUBMITTED" nel nuovo schema senza violare il nuovo vincolo — serve uno stato transitorio dedicato (es. `LEGACY_IMPORTED`) per non falsare né lo storico né la regola nuova.

## Vincoli implementati

| Vincolo | Regola |
|---|---|
| `completed_means_complete` | un report completato e non rifiutato è al 100% |
| `quarantine_needs_review` | la quarantena apre sempre un ciclo di revisione |
| `review_is_signed` | approvazioni/rifiuti con autore, data e motivazione |
| `exactly_one_value` | una risposta ha un solo valore tipizzato |
| `velo_vuse_strict_yes_no` | VELO/VUSE: solo Sì/No |
| `report_serial_uq` | un seriale è rimborsabile una sola volta |
| `auditor_adult` | niente auditor minorenni |
| consenso obbligatorio | nessun contatto nel vault senza consenso |
| `event_append_only` | l'audit log non si modifica |
