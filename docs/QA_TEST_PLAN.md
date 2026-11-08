# Fieldsight — piano di test

I test sono eseguibili (`npm test`) e girano in CI a ogni push (`.github/workflows/ci.yml`).

| Suite | File | Cosa copre |
|---|---|---|
| Pipeline | `src/domain/pipeline/pipeline.test.ts` | contratto, valori fuori dominio, completezza, risposte orfane, regole di business, privacy, idempotenza, duplicati, z-score robusto |
| Integrazione app → API | `src/field/submission.test.ts` | stato reale del questionario (foto, numeri come testo, contatti) → payload valido → report accettato |
| Dataset demo | `src/warehouse/seed.test.ts` | determinismo e copertura di tutte le anomalie iniettate |
| Database | `db/schema.test.ts` | ogni vincolo PostgreSQL violato di proposito via SQL |

## Il punto centrale

L'obiettivo del piano non è verificare che l'app funzioni quando tutto va bene. È verificare che il database rifiuti fisicamente ogni stato incoerente, così che nessun bug applicativo possa mai produrre un dato sporco in produzione. Ogni vincolo definito nello schema ha un test che prova a romperlo di proposito.

## Cinque casi che coprono i vincoli critici

Un report non può passare a inviato se la percentuale di completamento non è esattamente al 100 per cento. Un auditor non può completare l'onboarding con un'età sotto la soglia legale. Una riga di risposta non può contenere due valori insieme, per esempio testo e numero nella stessa riga. Le domande sui brand VELO e VUSE non accettano la risposta non applicabile, solo sì o no. Una richiesta di privacy non può esistere senza almeno un contatto tra email e telefono.

In ogni caso il test prova a forzare la violazione direttamente via query, per garantire che la protezione sia reale a livello di dati e non solo un controllo lato interfaccia che si può aggirare.

## Test di integrazione, l'idea in una riga

Oltre ai singoli vincoli, si verificano i percorsi completi. Il flusso GLO con acquisto e lead che si chiude correttamente con record di privacy creato. Il flusso GLO senza acquisto che si chiude comunque al 100 per cento senza aprire il modulo lead. E un test di resilienza offline, dove il client compilato senza connessione deve comunque bloccare un invio parziale finché la sincronizzazione non conferma il completamento reale.

## Un dettaglio che vale la pena discutere

Per il caso del brand VELO o VUSE senza opzione non applicabile, il piano prevede due livelli di verifica. Prima il fallimento atteso lato applicativo, che dovrebbe intercettare il valore scorretto prima ancora di arrivare al database. Poi, in caso di bypass di quel livello, la verifica che il vincolo sulla colonna dedicata blocchi comunque l'inserimento. È un approccio a doppia barriera che non si accontenta della sola validazione lato client.

## Doppia barriera, in pratica

Il caso VELO/VUSE con «Non Applicabile» è coperto due volte: `pipeline.test.ts` verifica che l'API lo rifiuti (`INVALID_VALUE`, HTTP 422), `schema.test.ts` che il vincolo `velo_vuse_strict_yes_no` lo blocchi anche se qualcuno scrivesse direttamente nel database.
