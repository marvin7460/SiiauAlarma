import { SIIAU_PAGES, type SiiauHost } from "../src/endpoints";

export interface CaptureCase {
  /** Fixture file name, without extension. */
  id: string;
  /** What this fixture is meant to prove. Saved in the .meta.json file. */
  description: string;
  host: SiiauHost;
  page: string;
  params?: Record<string, string>;
  /** Cases still waiting for real data. `pnpm capture` skips them and says so. */
  todo?: true;
}

// 2026B at CUCEI, the cycle used in docs/siiau.md. I5890 (BASES DE DATOS) has several
// sections, and NRC 78088 (D02) has two sessions in different buildings.
const CICLO_2026B = "202620";
const CICLO_2027A = "202710";
const CUCEI = "D";

export const CAPTURE_CASES: readonly CaptureCase[] = [
  {
    id: "forma-consulta",
    description: "Search form: cycle and campus lists, and the real names of every form field.",
    host: "current",
    page: SIIAU_PAGES.searchForm,
  },
  {
    id: "lista-carreras-cucei",
    description: "Majors offered by CUCEI.",
    host: "current",
    page: SIIAU_PAGES.majors,
    params: { cup: CUCEI },
  },
  {
    id: "oferta-i5890-2026b",
    description:
      "Subject with several sections; NRC 78088 (D02) has two sessions in different buildings.",
    host: "current",
    page: SIIAU_PAGES.offer,
    params: { ciclop: CICLO_2026B, cup: CUCEI, crsep: "I5890", mostrarp: "500" },
  },
  {
    id: "oferta-i5890-2026b-legacy",
    description: "Same query on the legacy HTTP host, to check that both serve the same markup.",
    host: "legacy",
    page: SIIAU_PAGES.offer,
    params: { ciclop: CICLO_2026B, cup: CUCEI, crsep: "I5890", mostrarp: "500" },
  },
  {
    id: "oferta-i5890-2027a-sin-publicar",
    description: "Cycle listed in the form but without published sections yet (0 records).",
    host: "current",
    page: SIIAU_PAGES.offer,
    params: { ciclop: CICLO_2027A, cup: CUCEI, crsep: "I5890", mostrarp: "500" },
  },
  {
    id: "oferta-clave-inexistente",
    description: "Subject code that does not exist, to tell it apart from an unpublished offer.",
    host: "current",
    page: SIIAU_PAGES.offer,
    params: { ciclop: CICLO_2026B, cup: CUCEI, crsep: "ZZ999", mostrarp: "500" },
  },
  {
    id: "oferta-inni-2026b-pagina-1",
    description:
      "A whole major with the smallest page size (100), to see whether and how results paginate.",
    host: "current",
    page: SIIAU_PAGES.offer,
    params: { ciclop: CICLO_2026B, cup: CUCEI, majrp: "INNI", mostrarp: "100" },
  },
  {
    id: "catalogo-inni",
    description: "Subject catalog of a major (legacy host), candidate source for autocomplete.",
    host: "legacy",
    page: SIIAU_PAGES.catalogByMajor,
    params: { carrerap: "INNI", ordenp: "1", mostrarp: "5", tipop: "T" },
  },
  // The "only sections with seats" variant is added once forma-consulta.fields.json
  // shows the real name of that checkbox.

  // TODO(Marvin): turn these three placeholders into real cases. Open the Consulta de Oferta
  // Académica in your browser (2026B, any campus), find a subject that shows each situation,
  // then fill in `params` the same way as "oferta-i5890-2026b" and delete `todo: true`.
  // Hints:
  // - Several professors: look at the Profesor column; some sections list two or more rows.
  // - No professor: the Profesor column is empty. Common in sections opened late.
  // - Ñ or accents: SIIAU is mostly uppercase without accents, but Ñ survives in names like
  //   MUÑOZ, NUÑEZ or PEÑA, and in subjects with DISEÑO or ESPAÑOL in the title.
  // Only add subjects you checked by hand: each case is one more request to SIIAU.
  {
    id: "oferta-varios-profesores",
    description: "A section taught by two or more professors.",
    host: "current",
    page: SIIAU_PAGES.offer,
    todo: true,
  },
  {
    id: "oferta-sin-profesor",
    description: "A section without an assigned professor.",
    host: "current",
    page: SIIAU_PAGES.offer,
    todo: true,
  },
  {
    id: "oferta-acentos-enie",
    description: "Subject or professor names with Ñ or accents (checks ISO-8859-1 decoding).",
    host: "current",
    page: SIIAU_PAGES.offer,
    todo: true,
  },
];
