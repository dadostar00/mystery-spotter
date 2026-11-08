"""
Fieldsight — analisi offline dell'export della console con DuckDB.

Legge gli export (NDJSON dei fact, CSV long delle risposte) e produce:
  1. KPI di sintesi e qualità della pipeline
  2. classifica punti vendita
  3. calibrazione auditor: chi valuta in modo sistematicamente diverso a parità di PV
  4. non conformità ricorrenti

Uso:
    python -m venv .venv && .venv/bin/pip install -r analytics/requirements.txt
    python analytics/kpi_report.py                       # usa analytics/sample/
    python analytics/kpi_report.py --data ~/Downloads --md report.md
"""

from __future__ import annotations

import argparse
import statistics
import sys
from collections.abc import Callable
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent

# Stessa definizione di "report valido" della console (src/warehouse/queries.ts) e di mart.valid_report.
VALID = (
    "(disposition IN ('ACCEPTED','ACCEPTED_WITH_WARNINGS') "
    "OR (disposition='QUARANTINED' AND review_status='approved'))"
)

QUERIES: dict[str, str] = {
    "Sintesi": f"""
        SELECT count(*)                                                     AS submission,
               count(*) FILTER (WHERE {VALID})                              AS valide,
               round(100.0 * count(*) FILTER (WHERE {VALID}) / count(*), 1) AS pct_valide,
               count(*) FILTER (WHERE disposition = 'QUARANTINED' AND review_status = 'pending') AS in_revisione,
               round(avg(score) FILTER (WHERE {VALID} AND outcome = 'completed'), 1) AS score_medio,
               round(100.0 * avg(purchase::int) FILTER (WHERE {VALID} AND outcome = 'completed'), 1) AS conversione_pct
          FROM reports
    """,
    "Flag di qualità più frequenti": """
        SELECT flag, count(*) AS occorrenze
          FROM (SELECT unnest(flags) AS flag FROM reports)
         GROUP BY flag ORDER BY occorrenze DESC LIMIT 10
    """,
    "Classifica punti vendita": f"""
        SELECT store_code, city, region,
               count(*)                      AS visite,
               round(avg(score), 1)          AS score,
               round(stddev_samp(score), 1)  AS dev_std,
               sum(purchase::int)            AS acquisti
          FROM reports
         WHERE {VALID} AND outcome = 'completed' AND score IS NOT NULL
         GROUP BY ALL ORDER BY score DESC
    """,
    "Non conformità più frequenti": f"""
        SELECT a.module_id,
               a.question_id,
               count(*) FILTER (WHERE NOT a.compliant)        AS non_conformi,
               count(*)                                       AS totale,
               round(100.0 * avg((NOT a.compliant)::int), 1)  AS pct
          FROM answers a
          JOIN (SELECT submission_id FROM reports WHERE {VALID}) r USING (submission_id)
         WHERE a.compliant IS NOT NULL
         GROUP BY ALL HAVING count(*) >= 5
         ORDER BY pct DESC LIMIT 8
    """,
}


def auditor_calibration(con: duckdb.DuckDBPyConnection, iters: int = 50) -> duckdb.DuckDBPyRelation:
    """Effetto auditor depurato dall'effetto punto vendita.

    Modello additivo a effetti fissi:  score = mu + PV_s + auditor_a + e,
    stimato per backfitting (medie alternate). Stimare i due effetti insieme evita
    che un auditor severo abbassi la baseline dei PV visitati e faccia sembrare
    "indulgenti" tutti gli altri. Effetti espressi rispetto all'auditor mediano;
    soglia |t| > 3 ≈ Bonferroni su ~8 confronti.
    Le visite con hostess assente (score 0 per costruzione) sono escluse:
    misurano un fatto, non un giudizio dell'auditor.
    """
    rows: list[tuple[str, str, float]] = con.sql(
        f"""SELECT auditor_id, store_code, score::DOUBLE FROM reports
             WHERE {VALID} AND outcome = 'completed' AND score IS NOT NULL AND hostess_present"""
    ).fetchall()
    mu = sum(r[2] for r in rows) / len(rows)
    store = {r[1]: 0.0 for r in rows}
    aud = {r[0]: 0.0 for r in rows}

    def mean_residual(key: int, other: dict[str, float], other_key: int) -> dict[str, float]:
        acc: dict[str, list[float]] = {}
        for r in rows:
            acc.setdefault(r[key], []).append(r[2] - mu - other[r[other_key]])
        return {k: sum(v) / len(v) for k, v in acc.items()}

    for _ in range(iters):
        store = mean_residual(1, aud, 0)
        aud = mean_residual(0, store, 1)
        # identificabilità: effetto dell'auditor "tipico" = 0. Si usa la mediana e non
        # la media, altrimenti l'auditor anomalo sposterebbe il riferimento di tutti.
        shift = statistics.median(aud.values())
        aud = {k: v - shift for k, v in aud.items()}

    resid: dict[str, list[float]] = {}
    for a, s, y in rows:
        resid.setdefault(a, []).append(y - mu - store[s] - aud[a])

    out: list[tuple[str, int, float, float, str]] = []
    for a, eff in aud.items():
        e = resid[a]
        n = len(e)
        sd = (sum(x * x for x in e) / max(1, n - 1)) ** 0.5
        t = eff / (sd / n**0.5) if sd else 0.0
        verdict = ("indulgente" if eff > 0 else "severo") if abs(t) > 3 and n >= 5 else "in linea"
        out.append((a, n, round(eff, 1), round(t, 2), verdict))
    out.sort(key=lambda r: r[3])

    placeholders = ",".join("(?, ?, ?, ?, ?)" for _ in out)
    return con.sql(
        f"SELECT * FROM (VALUES {placeholders}) t(auditor_id, visite, effetto_punti, t_stat, giudizio)",
        params=[v for r in out for v in r],
    )


def load(con: duckdb.DuckDBPyConnection, data: Path) -> None:
    # le DDL non accettano parametri: si passa dall'API relazionale (niente SQL concatenato)
    con.read_json(str(data / "fact_report.ndjson"), format="newline_delimited").create_view("reports")
    con.read_csv(str(data / "fact_answer.csv"), header=True).create_view("answers")


def to_markdown(title: str, rel: duckdb.DuckDBPyRelation) -> str:
    cols = rel.columns
    rows = rel.fetchall()
    lines = [f"### {title}", "", "| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join("" if v is None else str(v) for v in r) + " |" for r in rows]
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE / "sample", help="cartella con fact_report.ndjson e fact_answer.csv")
    ap.add_argument("--md", type=Path, help="scrive anche un report Markdown")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # console Windows (cp1252) e tabelle box-drawing

    con = duckdb.connect()
    load(con, args.data)

    sections: list[tuple[str, Callable[[], duckdb.DuckDBPyRelation]]] = [
        (title, lambda q=sql: con.sql(q)) for title, sql in QUERIES.items()
    ]
    sections.insert(3, ("Calibrazione auditor (effetti fissi PV + auditor)", lambda: auditor_calibration(con)))

    md = ["# Fieldsight — report KPI", ""]
    for title, build in sections:
        print(f"\n== {title} ==")
        build().show(max_width=140)
        md.append(to_markdown(title, build()))

    if args.md:
        args.md.write_text("\n".join(md), encoding="utf-8")
        print(f"\nReport scritto in {args.md}")


if __name__ == "__main__":
    main()
