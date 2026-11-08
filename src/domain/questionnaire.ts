export type QuestionKind = "single" | "multi" | "text" | "number" | "photo" | "textarea";

export type Answers = Record<string, unknown>;

export interface Question {
  id: string;
  label: string;
  kind: QuestionKind;
  options?: string[];
  placeholder?: string;
  /** id of a collapsible group inside the module */
  group?: string;
  visible?: (a: Answers, ctx: AuditContext) => boolean;
}

export interface QuestionGroup {
  id: string;
  title: string;
}

export interface Module {
  id: string;
  title: string;
  icon: string;
  questions: Question[];
  groups?: QuestionGroup[];
  /** if returns true, this and following modules are skipped */
  blockedBy?: (a: Answers) => boolean;
}

export interface AuditContext {
  ageVerificationEnabled: boolean;
}

export const ACTIVITY_TYPES = [
  "121 Executive",
  "121 Standard",
  "E-chain",
  "HoReCa",
  "Pop Up Light",
  "Pop Up Premium",
] as const;

export const REPORT_TYPES = [
  { id: "quantitativo", label: "Report Quantitativo", icon: "", desc: "Checklist e compliance" },
  { id: "qualitativo", label: "Report Qualitativo", icon: "", desc: "Osservazioni e interazione" },
  { id: "completo", label: "Report Completo", icon: "", desc: "Quantitativo + Qualitativo" },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["id"];

export interface Store {
  code: string;
  address: string;
  city: string;
}

export const STORES: Store[] = [
  { code: "PV-0101", address: "Via Torino 14", city: "Milano" },
  { code: "PV-0102", address: "Corso Buenos Aires 88", city: "Milano" },
  { code: "PV-0210", address: "Via Roma 45", city: "Torino" },
  { code: "PV-0233", address: "Piazza Castello 3", city: "Torino" },
  { code: "PV-0304", address: "Via del Corso 120", city: "Roma" },
  { code: "PV-0311", address: "Viale Marconi 210", city: "Roma" },
  { code: "PV-0420", address: "Via Toledo 77", city: "Napoli" },
  { code: "PV-0505", address: "Via Etnea 152", city: "Catania" },
  { code: "PV-0612", address: "Via Indipendenza 9", city: "Bologna" },
  { code: "PV-0707", address: "Corso Vittorio Emanuele 5", city: "Firenze" },
  { code: "PV-0808", address: "Via Garibaldi 30", city: "Genova" },
  { code: "PV-0909", address: "Corso Italia 62", city: "Bari" },
];

const SI_NO = ["Sì", "No"];
const SI_NO_NA = ["Sì", "No", "Non Applicabile"];
const SI_NO_NOACQ = ["Sì", "No", "Acquisto non effettuato"];

const isNo = (id: string) => (a: Answers) => a[id] === "No";
const isSi = (id: string) => (a: Answers) => a[id] === "Sì";
const hostessPresent = (a: Answers) => a["a1_hostess"] !== "No";

export const PROD_GLO = "GLO (Tabacco Riscaldato)";
export const PROD_VELO = "VELO (Bustine di Nicotina)";
export const PROD_VUSE = "VUSE (Sigarette Elettroniche)";
export const PROD_NESSUNO = "Nessun prodotto presentato / Nessun ingaggio";

const hasProduct = (p: string) => (a: Answers) => {
  const sel = Array.isArray(a["c0_prodotti"]) ? (a["c0_prodotti"] as string[]) : [];
  return !sel.includes(PROD_NESSUNO) && sel.includes(p);
};

export const QUANT_MODULES: Module[] = [
  {
    id: "A",
    title: "Presenza hostess e materiali",
    icon: "",
    questions: [
      {
        id: "a1_hostess",
        label: "Hostess presente allo stand / nei pressi?",
        kind: "single",
        options: SI_NO,
      },
      {
        id: "a1_attesa",
        label: "Tempo di attesa",
        kind: "single",
        options: ["15 minuti", "30 minuti", "Oltre 30 minuti", "Non si è presentata"],
        visible: isNo("a1_hostess"),
      },
      {
        id: "a2_uniforme",
        label: "Uniforme conforme alla foto/linee guida?",
        kind: "single",
        options: SI_NO,
        visible: hostessPresent,
      },
      {
        id: "a2_indumenti",
        label: "Indumenti mancanti",
        kind: "multi",
        options: ["Gilet", "Maglia nera", "Pantaloni", "Porta cellulare arancione"],
        visible: (a) => hostessPresent(a) && a["a2_uniforme"] === "No",
      },
      {
        id: "a2_totalblack",
        label: "Indossava comunque una divisa Total Black?",
        kind: "single",
        options: SI_NO,
        visible: (a) => hostessPresent(a) && a["a2_uniforme"] === "No",
      },
      {
        id: "a3_materiali",
        label: "Materiali di supporto presenti (Totem / Trade Presenter)?",
        kind: "single",
        options: SI_NO,
        visible: hostessPresent,
      },
      {
        id: "a3_mancante",
        label: "Materiale mancante",
        kind: "single",
        options: ["Totem", "Trade Presenter", "Entrambi"],
        visible: (a) => hostessPresent(a) && a["a3_materiali"] === "No",
      },
      {
        id: "a3_dispositivi",
        label: "Nel Trade Presenter sono presenti tutti i dispositivi (Hilo/Pro, Velo, Vuse)?",
        kind: "single",
        options: SI_NO,
        visible: (a) => hostessPresent(a) && a["a3_materiali"] === "Sì",
      },
      {
        id: "a4_stato",
        label: "Stato dei materiali: visibilmente in buono stato?",
        kind: "single",
        options: SI_NO,
        visible: hostessPresent,
      },
      {
        id: "a4_problema",
        label: "Problema riscontrato",
        kind: "single",
        options: ["Danneggiati", "Usurati", "Entrambi"],
        visible: (a) => hostessPresent(a) && a["a4_stato"] === "No",
      },
    ],
  },
  {
    id: "B",
    title: "Proattività",
    icon: "",
    blockedBy: (a) => a["a1_hostess"] === "No",
    questions: [
      {
        id: "b1_ingaggio",
        label: "Ingaggio proattivo dei consumatori in ingresso?",
        kind: "single",
        options: SI_NO,
      },
      {
        id: "b1_osservazione",
        label: "Tempo di osservazione",
        kind: "single",
        options: ["2 minuti", "5 minuti", "8 minuti", "10 minuti"],
        visible: isNo("b1_ingaggio"),
      },
      {
        id: "b2_fumatore",
        label: "All'inizio dell'ingaggio la hostess ha domandato se sei fumatore?",
        kind: "single",
        options: SI_NO,
        visible: (_a, ctx) => ctx.ageVerificationEnabled,
      },
      {
        id: "b2_strumenti",
        label: "Sono stati utilizzati gli strumenti corretti per la verifica dell'età?",
        kind: "single",
        options: ["Sì", "No, la hostess non ha chiesto l'età"],
        visible: (_a, ctx) => ctx.ageVerificationEnabled,
      },
      {
        id: "b3_profilazione",
        label: "La hostess chiede la tipologia di prodotto fumato dal consumatore?",
        kind: "single",
        options: SI_NO,
      },
    ],
  },
  {
    id: "C",
    title: "Proposta prodotti e interazioni",
    icon: "",
    blockedBy: (a) => a["a1_hostess"] === "No",
    groups: [
      { id: "glo", title: "Scheda Valutazione GLO" },
      { id: "velo", title: "Scheda Valutazione VELO" },
      { id: "vuse", title: "Scheda Valutazione VUSE" },
    ],
    questions: [
      {
        id: "c0_prodotti",
        label:
          "Quali prodotti/brand sono stati presentati o proposti dalla hostess durante l'interazione?",
        kind: "multi",
        options: [PROD_GLO, PROD_VELO, PROD_VUSE, PROD_NESSUNO],
      },
      {
        id: "c1_prova",
        label: "Prova prodotto GLO proposta al consumatore?",
        kind: "single",
        options: SI_NO,
        group: "glo",
        visible: hasProduct(PROD_GLO),
      },
      {
        id: "c1_peculiarita",
        label:
          "Vengono comunicate le peculiarità GLO (Tiri illimitati, Turbo start, Made in Italy)?",
        kind: "single",
        options: SI_NO,
        group: "glo",
        visible: hasProduct(PROD_GLO),
      },
      {
        id: "c1_non_comunicata",
        label: "Quale caratteristica NON è stata comunicata?",
        kind: "multi",
        options: [
          "Tiri illimitati",
          "Turbo Start",
          "Gusto ricco e appagante",
          "Made in Italy / Prezzo",
        ],
        group: "glo",
        visible: (a) => hasProduct(PROD_GLO)(a) && a["c1_peculiarita"] === "No",
      },
      {
        id: "c1_prezzi",
        label: "Spiegazione chiara su prezzi e promozioni GLO?",
        kind: "single",
        options: SI_NO,
        group: "glo",
        visible: hasProduct(PROD_GLO),
      },
      {
        id: "c1_bundle",
        label: "Se il consumatore era idoneo, è stata proposta prima la Promo Bundle (se attiva)?",
        kind: "single",
        options: SI_NO_NA,
        group: "glo",
        visible: (a) => hasProduct(PROD_GLO)(a) && a["c1_prezzi"] === "Sì",
      },
      {
        id: "c1_registrazione",
        label: "Vengono spiegati i benefici della registrazione consumatore?",
        kind: "single",
        options: SI_NO,
        group: "glo",
        visible: hasProduct(PROD_GLO),
      },
      {
        id: "c1_extra",
        label: "Vengono menzionati Extra Messages durante la prova GLO?",
        kind: "single",
        options: SI_NO,
        group: "glo",
        visible: hasProduct(PROD_GLO),
      },
      {
        id: "c2_velo_trial",
        label: "La hostess dà informazioni corrette sull'esperienza di prova VELO?",
        kind: "single",
        options: SI_NO,
        group: "velo",
        visible: hasProduct(PROD_VELO),
      },
      {
        id: "c3_vuse",
        label: "La hostess dà informazioni corrette sull'esperienza di prova VUSE?",
        kind: "single",
        options: SI_NO,
        group: "vuse",
        visible: hasProduct(PROD_VUSE),
      },
    ],
  },
  {
    id: "D",
    title: "Registrazione, Check-out e Acquisto",
    icon: "",
    blockedBy: (a) => a["a1_hostess"] === "No",
    questions: [
      {
        id: "d0_acquisto",
        label: "È stato effettuato un acquisto?",
        kind: "single",
        options: SI_NO,
      },
      {
        id: "d1_processo",
        label: "Il processo di registrazione avviene come da presentazione di supporto?",
        kind: "single",
        options: SI_NO,
        visible: isSi("d0_acquisto"),
      },
      {
        id: "d2_consenso",
        label: "Il consenso ai dati sensibili viene flaggato direttamente dal consumatore?",
        kind: "single",
        options: SI_NO,
        visible: isSi("d0_acquisto"),
      },
      {
        id: "d3_sms",
        label: "La hostess informa dell'arrivo dell'SMS a seguito della registrazione?",
        kind: "single",
        options: SI_NO,
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_modello",
        label: "Modello acquistato",
        kind: "single",
        options: ["Hilo", "Hyper Pro"],
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_prezzo",
        label: "Prezzo di acquisto (€)",
        kind: "number",
        placeholder: "0,00",
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_seriale",
        label: "Codice Seriale / ID dispositivo",
        kind: "text",
        placeholder: "Es. HP24X10293",
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_foto_scontrino",
        label: "Foto Scontrino",
        kind: "photo",
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_foto_scatola",
        label: "Foto Retro Scatola",
        kind: "photo",
        visible: isSi("d0_acquisto"),
      },
      {
        id: "e1_bundle_stick",
        label: "Quanti pacchetti/stick di tabacco hai ricevuto nel bundle?",
        kind: "number",
        placeholder: "0",
        visible: (a) =>
          isSi("d0_acquisto")(a) && hasProduct(PROD_GLO)(a) && a["c1_bundle"] === "Sì",
      },
      {
        id: "e1_email",
        label: "Email del consumatore (per gestione promo)",
        kind: "text",
        placeholder: "nome@email.com",
        visible: (a) =>
          isSi("d0_acquisto")(a) &&
          hasProduct(PROD_GLO)(a) &&
          a["c1_bundle"] === "Sì" &&
          parseInt(String(a["e1_bundle_stick"] ?? "0"), 10) > 0,
      },
      {
        id: "e1_phone",
        label: "Numero di telefono del consumatore",
        kind: "text",
        placeholder: "+39 ...",
        visible: (a) =>
          isSi("d0_acquisto")(a) &&
          hasProduct(PROD_GLO)(a) &&
          a["c1_bundle"] === "Sì" &&
          parseInt(String(a["e1_bundle_stick"] ?? "0"), 10) > 0,
      },
      {
        id: "e1_consenso",
        label: "Il consumatore ha prestato il consenso privacy al trattamento dei contatti?",
        kind: "single",
        options: SI_NO,
        visible: (a) =>
          isSi("d0_acquisto")(a) &&
          hasProduct(PROD_GLO)(a) &&
          a["c1_bundle"] === "Sì" &&
          parseInt(String(a["e1_bundle_stick"] ?? "0"), 10) > 0,
      },
    ],
  },
];

export const QUALI_QUESTIONS: Question[] = [
  {
    id: "q1_approccio",
    label:
      "In che modo l'hostess contatta proattivamente i consumatori che entrano nel punto vendita? Descrivi approccio, atteggiamento e modalità di interazione osservate.",
    kind: "textarea",
  },
  {
    id: "q2_criticita",
    label: "Se presente, descrivi nel dettaglio un momento critico osservato durante la visita.",
    kind: "textarea",
  },
  {
    id: "q3_altro",
    label:
      "Segnalare eventuali osservazioni aggiuntive ritenute rilevanti, sia positive che negative.",
    kind: "textarea",
  },
];

export function isQuestionVisible(q: Question, a: Answers, ctx: AuditContext) {
  return q.visible ? q.visible(a, ctx) : true;
}

export function visibleModules(a: Answers): Module[] {
  const out: Module[] = [];
  for (const m of QUANT_MODULES) {
    if (m.blockedBy?.(a)) break;
    out.push(m);
  }
  return out;
}

export function computeAge(birthDate: string): number | null {
  // birthDate: GG/MM/AAAA
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(birthDate.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const dob = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const before =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (before) age -= 1;
  return age;
}

/** La sezione "Verifica Età" è attiva solo se 18 <= età <= 25 e l'auditor NON dimostra più di 18 anni. */
export function isAgeVerificationEnabled(
  birthDate: string,
  appearsOver18: boolean | null,
): boolean {
  const age = computeAge(birthDate);
  if (age === null || age < 18 || age > 25) return false;
  return appearsOver18 === false;
}
