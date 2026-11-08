/**
 * Test dei vincoli del database: ogni regola critica viene violata di proposito
 * direttamente via SQL, per dimostrare che la protezione è nel dato e non solo
 * nell'applicazione. Gira su PGlite (PostgreSQL compilato in WASM), senza Docker.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const SUB = "6f1c2a1e-3b7d-4c8e-9a10-1b2c3d4e5f60";
let db: PGlite;

const report = (disposition: string, review: string, completion: number) => `
  INSERT INTO core.report (submission_id, pipeline_version, disposition, review_status, auditor_id, store_code,
    activity_type, report_type, outcome, visit_date, started_at, ended_at, completion_pct, score)
  VALUES ('${SUB}', 'test', '${disposition}', '${review}', 'AUD-1', 'PV-0101', 'HoReCa', 'quantitativo',
    'completed', current_date, now() - interval '20 min', now(), ${completion}, 80)`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(fileURLToPath(new URL("./schema.sql", import.meta.url)), "utf8"));
  await db.exec(`
    INSERT INTO core.store VALUES ('PV-0101', 'Via Torino 14', 'Milano', 'Nord-Ovest', true);
    INSERT INTO core.auditor VALUES ('AUD-1', 'Giulia', '1995-03-10', now());
    INSERT INTO core.question VALUES ('c3_vuse', 'C', 'VUSE?', 'single', '{Sì,No}', 'Sì', false, current_date, null);
    INSERT INTO core.submission VALUES ('${SUB}', now(), '1.0', repeat('a', 64), 'api', null, '{}');
  `);
}, 30_000);

describe("vincoli PostgreSQL", () => {
  it("un report completato deve essere al 100%", async () => {
    await expect(db.exec(report("ACCEPTED", "none", 90))).rejects.toThrow(
      /completed_means_complete/,
    );
  });

  it("la quarantena richiede un ciclo di revisione", async () => {
    await expect(db.exec(report("QUARANTINED", "none", 100))).rejects.toThrow(
      /quarantine_needs_review/,
    );
  });

  it("accetta un report coerente", async () => {
    await db.exec(report("ACCEPTED", "none", 100));
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM mart.valid_report",
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("VELO/VUSE: niente «Non Applicabile» nemmeno via SQL", async () => {
    await expect(
      db.exec(
        `INSERT INTO core.answer VALUES ('${SUB}', 'c3_vuse', 'Non Applicabile', null, null, null, null)`,
      ),
    ).rejects.toThrow(/velo_vuse_strict_yes_no/);
  });

  it("una risposta ha un solo valore tipizzato", async () => {
    await expect(
      db.exec(`INSERT INTO core.answer VALUES ('${SUB}', 'c3_vuse', 'Sì', null, 3, null, true)`),
    ).rejects.toThrow(/exactly_one_value/);
  });

  it("niente auditor minorenni", async () => {
    await expect(
      db.exec(
        `INSERT INTO core.auditor VALUES ('AUD-2', 'X', current_date - interval '16 years', null)`,
      ),
    ).rejects.toThrow(/auditor_adult/);
  });

  it("le decisioni di revisione sono firmate e motivate", async () => {
    await expect(
      db.exec(`UPDATE core.report SET disposition = 'QUARANTINED', review_status = 'approved'`),
    ).rejects.toThrow(/review_is_signed/);
  });

  it("nessun contatto senza consenso; la retention distrugge chiave e ciphertext", async () => {
    await expect(
      db.exec(`INSERT INTO vault.consumer_contact (token, submission_id, store_code, email_masked, consent, retention_until)
               VALUES ('pii_a', '${SUB}', 'PV-0101', 'm***@x.it', false, now())`),
    ).rejects.toThrow(/consent/);

    await db.exec(`INSERT INTO vault.consumer_contact (token, submission_id, store_code, email_masked, consent, ciphertext, key_id, retention_until)
                   VALUES ('pii_b', '${SUB}', 'PV-0101', 'm***@x.it', true, decode('ff', 'hex'), 'k1', now() - interval '1 day')`);
    await db.exec("CALL vault.run_retention()");
    const { rows } = await db.query<{ shredded: boolean }>(
      "SELECT (ciphertext IS NULL AND key_id IS NULL AND erased_at IS NOT NULL) AS shredded FROM vault.consumer_contact",
    );
    expect(rows[0]?.shredded).toBe(true);
  });

  it("l'audit log è append-only", async () => {
    await expect(db.exec("UPDATE audit.event SET actor = 'x'")).rejects.toThrow(/append-only/);
  });
});
