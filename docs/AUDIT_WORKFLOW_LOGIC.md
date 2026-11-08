# Fieldsight — logica di workflow

Il catalogo domande con tutte le dipendenze è codice eseguibile: `src/domain/questionnaire.ts`. Lo stesso file è usato dall'app per mostrare/nascondere le domande e dalla pipeline per ricalcolare lato server il percorso valido.

## Il punto centrale

Il questionario non segue un percorso lineare uguale per tutti. Si ramifica in base al brand rilevato nel punto vendita e ogni risposta può sbloccare, o disattivare, un intero ramo successivo. Questo significa che la persistenza deve tracciare non solo cosa è stato risposto, ma anche perché una domanda è comparsa o è sparita.

## Macchina a stati del report

Il ciclo di vita è semplice da leggere. Scheduled, poi draft, poi in progress, poi submitted. La transizione finale verso submitted è vincolata da un controllo secco. Il completamento deve essere esattamente al 100 per cento, non un valore vicino. Questo elimina alla radice il caso di un report inviato mentre manca ancora qualcosa, cosa che nel vecchio sistema era possibile.

## Dipendenze condizionali, l'idea in una riga

Ogni domanda figlia porta con sé un riferimento alla domanda padre e al valore che l'ha sbloccata. Per esempio, se il brand rilevato è GLO e viene confermata la presenza del bundle, si apre il modulo acquisto. Se l'acquisto viene confermato, si apre il modulo lead con consenso privacy e almeno un contatto tra email e telefono. Se il brand rilevato è VELO o VUSE, il percorso è più corto e la risposta è vincolata, solo sì o no, senza l'opzione non applicabile.

## Un dettaglio che vale la pena discutere

Quando l'auditor torna indietro e cambia una risposta padre, per esempio da acquisto sì ad acquisto no, le risposte figlie già salvate in bozza devono sparire o diventare inattive. Altrimenti il calcolo della percentuale di completamento resterebbe sporco, contando risposte che non dovrebbero più esistere in quel percorso. È un comportamento che va gestito sia lato interfaccia, nascondendo subito i campi, sia lato server: lo stage *Coerenza rami* della pipeline (`src/domain/pipeline/process.ts`) ricostruisce il percorso attivo, scarta le risposte orfane e le registra con il flag `ORPHAN_ANSWER`, visibile nel lineage del report in console.

## Esiti dopo l'invio

Dopo `submitted` il report riceve un esito dalla pipeline: `ACCEPTED`, `ACCEPTED_WITH_WARNINGS`, `QUARANTINED` (in attesa di revisione) o `REJECTED`. La quarantena si chiude solo con una decisione firmata e motivata di un operatore (`approved` / `rejected`). Dettagli in [ARCHITECTURE.md](./ARCHITECTURE.md).
