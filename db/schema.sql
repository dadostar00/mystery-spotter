-- =============================================================================
-- Fieldsight — schema PostgreSQL (16+) di riferimento per la produzione
--
-- Nella demo pubblica il warehouse vive nel browser; questo è il modello che lo
-- sostituisce lato server. Le regole critiche sono imposte dal database stesso
-- (CHECK, UNIQUE, FK, RLS): un bug applicativo non può produrre dati incoerenti.
--
--   schema core     → anagrafiche, landing grezza, fact, risposte, flag
--   schema vault    → dati personali cifrati, accessibili solo al ruolo privacy
--   schema audit    → log append-only delle azioni degli operatori
--   schema mart     → viste per BI e console
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS mart;

-- -----------------------------------------------------------------------------
-- Tipi di dominio
-- -----------------------------------------------------------------------------
CREATE TYPE core.disposition   AS ENUM ('ACCEPTED', 'ACCEPTED_WITH_WARNINGS', 'QUARANTINED', 'REJECTED');
CREATE TYPE core.review_status AS ENUM ('none', 'pending', 'approved', 'rejected');
CREATE TYPE core.flag_severity AS ENUM ('info', 'warning', 'quarantine', 'error');
CREATE TYPE core.visit_outcome AS ENUM ('completed', 'interrupted');
CREATE TYPE core.report_type   AS ENUM ('quantitativo', 'qualitativo', 'completo');

-- -----------------------------------------------------------------------------
-- Audit log append-only
-- -----------------------------------------------------------------------------
CREATE TABLE audit.event (
    id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at      timestamptz NOT NULL DEFAULT now(),
    actor   text NOT NULL,
    action  text NOT NULL,
    target  text,
    detail  text
);
CREATE OR REPLACE FUNCTION audit.forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit.event è append-only';
END $$;
CREATE TRIGGER event_append_only BEFORE UPDATE OR DELETE ON audit.event
    FOR EACH ROW EXECUTE FUNCTION audit.forbid_change();

-- -----------------------------------------------------------------------------
-- Anagrafiche (master data)
-- -----------------------------------------------------------------------------
CREATE TABLE core.store (
    store_code  text PRIMARY KEY CHECK (store_code ~ '^PV-\d{4}$'),
    address     text NOT NULL,
    city        text NOT NULL,
    region      text NOT NULL CHECK (region IN ('Nord-Ovest', 'Nord-Est', 'Centro', 'Sud', 'Isole')),
    active      boolean NOT NULL DEFAULT true
);

CREATE TABLE core.auditor (
    auditor_id      text PRIMARY KEY,
    display_name    text NOT NULL,
    birth_date      date,
    onboarded_at    timestamptz,
    -- l'onboarding richiede la maggiore età: vincolo, non solo controllo UI
    CONSTRAINT auditor_adult CHECK (birth_date IS NULL OR birth_date <= (current_date - INTERVAL '18 years'))
);

-- Catalogo domande "as data": nuove domande = nuove righe, nessun ALTER TABLE.
CREATE TABLE core.question (
    question_id      text PRIMARY KEY CHECK (question_id ~ '^[a-z][a-z0-9_]{1,40}$'),
    module_id        text NOT NULL,
    label            text NOT NULL,
    kind             text NOT NULL CHECK (kind IN ('single', 'multi', 'text', 'number', 'photo', 'textarea')),
    options          text[],
    compliant_value  text,                -- NULL = non concorre allo score
    is_pii           boolean NOT NULL DEFAULT false,
    valid_from       date NOT NULL DEFAULT current_date,
    valid_to         date
);

-- -----------------------------------------------------------------------------
-- Landing: il payload così come è arrivato (PII già rimossi), per lineage e replay
-- -----------------------------------------------------------------------------
CREATE TABLE core.submission (
    submission_id     uuid PRIMARY KEY,                 -- chiave di idempotenza
    received_at       timestamptz NOT NULL DEFAULT now(),
    contract_version  text NOT NULL,
    content_hash      char(64) NOT NULL,
    source            text NOT NULL CHECK (source IN ('api', 'local-fallback', 'seed')),
    request_id        uuid,
    payload_redacted  jsonb NOT NULL
);
CREATE INDEX submission_content_hash_idx ON core.submission (content_hash);

-- Messaggi fuori contratto: non diventano fatti, ma non vanno persi.
CREATE TABLE core.dead_letter (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at  timestamptz NOT NULL DEFAULT now(),
    errors       jsonb NOT NULL,
    payload      jsonb NOT NULL,
    resolved_at  timestamptz
);

-- -----------------------------------------------------------------------------
-- Fact: un report per submission
-- -----------------------------------------------------------------------------
CREATE TABLE core.report (
    submission_id     uuid PRIMARY KEY REFERENCES core.submission (submission_id),
    pipeline_version  text NOT NULL,
    processed_at      timestamptz NOT NULL DEFAULT now(),
    disposition       core.disposition NOT NULL,
    review_status     core.review_status NOT NULL DEFAULT 'none',
    reviewed_by       text,
    reviewed_at       timestamptz,
    review_note       text,

    auditor_id        text NOT NULL REFERENCES core.auditor (auditor_id),
    store_code        text NOT NULL,                    -- FK assente di proposito: PV sconosciuto ⇒ quarantena
    activity_type     text NOT NULL,
    report_type       core.report_type,
    outcome           core.visit_outcome NOT NULL,
    visit_date        date NOT NULL,
    started_at        timestamptz NOT NULL,
    ended_at          timestamptz NOT NULL,

    completion_pct    smallint NOT NULL CHECK (completion_pct BETWEEN 0 AND 100),
    score             smallint CHECK (score BETWEEN 0 AND 100),
    hostess_present   boolean,
    purchase          boolean NOT NULL DEFAULT false,
    device_model      text,
    device_price      numeric(8, 2) CHECK (device_price IS NULL OR device_price > 0),
    device_serial     text,
    pii_token         text,

    CONSTRAINT visit_timespan CHECK (ended_at >= started_at),
    -- un report accettato e completato deve essere completo al 100%
    CONSTRAINT completed_means_complete CHECK (
        disposition = 'REJECTED' OR outcome = 'interrupted' OR completion_pct = 100
    ),
    -- la quarantena richiede un ciclo di revisione esplicito
    CONSTRAINT quarantine_needs_review CHECK (
        (disposition = 'QUARANTINED') = (review_status <> 'none')
    ),
    CONSTRAINT review_is_signed CHECK (
        review_status IN ('none', 'pending') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(review_note) >= 5)
    ),
    CONSTRAINT purchase_has_price CHECK (NOT purchase OR disposition = 'REJECTED' OR device_price IS NOT NULL)
);
CREATE INDEX report_visit_date_idx ON core.report (visit_date);
CREATE INDEX report_store_idx      ON core.report (store_code, visit_date);
CREATE INDEX report_review_idx     ON core.report (review_status) WHERE review_status = 'pending';
-- un seriale può essere rendicontato una sola volta tra i report validi (anti doppio rimborso)
CREATE UNIQUE INDEX report_serial_uq ON core.report (device_serial)
    WHERE device_serial IS NOT NULL AND disposition IN ('ACCEPTED', 'ACCEPTED_WITH_WARNINGS');

-- Risposte in formato long, tipizzate: una sola colonna valorizzata per riga.
CREATE TABLE core.answer (
    submission_id  uuid NOT NULL REFERENCES core.report (submission_id) ON DELETE CASCADE,
    question_id    text NOT NULL REFERENCES core.question (question_id),
    value_text     text,
    value_options  text[],
    value_number   numeric,
    value_bool     boolean,
    compliant      boolean,
    PRIMARY KEY (submission_id, question_id),
    CONSTRAINT exactly_one_value CHECK (
        num_nonnulls(value_text, value_options, value_number, value_bool) = 1
    ),
    -- VELO/VUSE: solo Sì/No, mai "Non Applicabile" — imposto anche a livello dati
    CONSTRAINT velo_vuse_strict_yes_no CHECK (
        question_id NOT IN ('c2_velo_trial', 'c3_vuse') OR value_text IN ('Sì', 'No')
    )
);

CREATE TABLE core.attachment (
    submission_id  uuid NOT NULL REFERENCES core.report (submission_id) ON DELETE CASCADE,
    question_id    text NOT NULL,
    sha256         char(64) NOT NULL,
    bytes          integer NOT NULL CHECK (bytes > 0),
    mime_type      text NOT NULL,
    object_key     text,                               -- percorso su object storage (S3/R2)
    PRIMARY KEY (submission_id, question_id)
);

CREATE TABLE core.report_flag (
    submission_id  uuid NOT NULL REFERENCES core.report (submission_id) ON DELETE CASCADE,
    seq            smallint NOT NULL,
    code           text NOT NULL,
    severity       core.flag_severity NOT NULL,
    stage          text NOT NULL,
    question_id    text,
    message        text NOT NULL,
    PRIMARY KEY (submission_id, seq)
);
CREATE INDEX report_flag_code_idx ON core.report_flag (code);

-- -----------------------------------------------------------------------------
-- Vault PII: schema separato, ruolo dedicato, cifratura applicativa per record
-- -----------------------------------------------------------------------------
CREATE TABLE vault.consumer_contact (
    token            text PRIMARY KEY,                  -- HMAC-SHA256(pepper, contatto)
    submission_id    uuid NOT NULL UNIQUE,
    store_code       text NOT NULL,
    email_masked     text,
    phone_masked     text,
    consent          boolean NOT NULL CHECK (consent),  -- senza consenso il record non esiste
    ciphertext       bytea,
    iv               bytea,
    key_id           text,                              -- riferimento al KMS: distruggere la chiave = cancellare il dato
    created_at       timestamptz NOT NULL DEFAULT now(),
    retention_until  timestamptz NOT NULL,
    erased_at        timestamptz,
    erasure_reason   text,
    CONSTRAINT at_least_one_contact CHECK (erased_at IS NOT NULL OR email_masked IS NOT NULL OR phone_masked IS NOT NULL),
    CONSTRAINT erased_means_shredded CHECK (erased_at IS NULL OR (ciphertext IS NULL AND key_id IS NULL))
);
CREATE INDEX consumer_contact_retention_idx ON vault.consumer_contact (retention_until) WHERE erased_at IS NULL;

-- Job di retention (es. pg_cron ogni notte alle 02:00):
--   SELECT cron.schedule('pii-retention', '0 2 * * *', $$CALL vault.run_retention()$$);
CREATE OR REPLACE PROCEDURE vault.run_retention()
LANGUAGE sql AS $$
    WITH erased AS (
        UPDATE vault.consumer_contact
           SET ciphertext = NULL, iv = NULL, key_id = NULL,
               email_masked = NULL, phone_masked = NULL,
               erased_at = now(), erasure_reason = 'retention'
         WHERE erased_at IS NULL AND retention_until < now()
        RETURNING token
    )
    INSERT INTO audit.event (actor, action, detail)
    SELECT 'job.retention@scheduler', 'RETENTION_JOB', count(*) || ' record' FROM erased;
$$;

-- -----------------------------------------------------------------------------
-- Ruoli e permessi (principio del minimo privilegio)
-- -----------------------------------------------------------------------------
CREATE ROLE fieldsight_ingest  NOLOGIN;   -- API: scrive landing, fact, vault
CREATE ROLE fieldsight_analyst NOLOGIN;   -- BI/console: legge solo i mart
CREATE ROLE fieldsight_privacy NOLOGIN;   -- ufficio privacy: unico accesso al vault

GRANT USAGE ON SCHEMA core, vault, audit TO fieldsight_ingest;
GRANT INSERT, SELECT ON ALL TABLES IN SCHEMA core TO fieldsight_ingest;
GRANT INSERT ON vault.consumer_contact, audit.event TO fieldsight_ingest;
GRANT USAGE ON SCHEMA mart TO fieldsight_analyst;
GRANT USAGE ON SCHEMA vault, audit TO fieldsight_privacy;
GRANT SELECT, UPDATE ON vault.consumer_contact TO fieldsight_privacy;
GRANT INSERT ON audit.event TO fieldsight_privacy;
REVOKE ALL ON SCHEMA vault FROM fieldsight_analyst;

-- -----------------------------------------------------------------------------
-- Mart: le stesse metriche della console (src/warehouse/queries.ts)
-- -----------------------------------------------------------------------------
-- Report che contano per le analisi: accettati, oppure in quarantena e approvati.
CREATE VIEW mart.valid_report AS
SELECT r.*, s.city, s.region
  FROM core.report r
  LEFT JOIN core.store s USING (store_code)
 WHERE r.disposition IN ('ACCEPTED', 'ACCEPTED_WITH_WARNINGS')
    OR (r.disposition = 'QUARANTINED' AND r.review_status = 'approved');

CREATE VIEW mart.weekly_compliance AS
SELECT date_trunc('week', visit_date)::date               AS week,
       count(*)                                           AS visits,
       round(avg(score) FILTER (WHERE outcome = 'completed'), 1) AS avg_score
  FROM mart.valid_report
 GROUP BY 1
 ORDER BY 1;

CREATE VIEW mart.store_compliance AS
SELECT store_code, city, region,
       count(*)                                 AS visits,
       round(avg(score), 1)                     AS avg_score,
       count(*) FILTER (WHERE purchase)         AS purchases,
       sum(device_price)                        AS spend
  FROM mart.valid_report
 WHERE outcome = 'completed'
 GROUP BY store_code, city, region;

CREATE VIEW mart.top_issues AS
SELECT a.question_id, q.module_id, q.label,
       count(*) FILTER (WHERE NOT a.compliant)                       AS fails,
       count(*)                                                      AS total,
       round(avg(CASE WHEN a.compliant THEN 0 ELSE 1 END)::numeric, 3) AS fail_rate
  FROM core.answer a
  JOIN mart.valid_report r USING (submission_id)
  JOIN core.question q USING (question_id)
 WHERE a.compliant IS NOT NULL
 GROUP BY a.question_id, q.module_id, q.label
HAVING count(*) >= 5
 ORDER BY fail_rate DESC;

CREATE VIEW mart.pipeline_quality AS
SELECT date_trunc('day', processed_at)::date AS day,
       disposition,
       count(*)                              AS submissions
  FROM core.report
 GROUP BY 1, 2;

GRANT SELECT ON ALL TABLES IN SCHEMA mart TO fieldsight_analyst;
