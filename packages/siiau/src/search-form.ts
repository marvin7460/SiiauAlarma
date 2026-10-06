import { SiiauParseError } from "./errors";
import { extractForms, type FormField, type FormOption } from "./html-forms";
import type { SearchForm } from "./model";

/**
 * "202620 - Calendario 26 B" → { code: "202620", description: "Calendario 26 B" }.
 * The value attribute wins over the code in the text. Options without a value and without
 * " - " are placeholders ("Seleccione...") and are skipped.
 */
function toCodeAndDescription(option: FormOption): { code: string; description: string } | null {
  const value = option.value?.trim() ?? "";
  const separator = option.label.indexOf(" - ");
  if (separator === -1) return value ? { code: value, description: option.label } : null;
  return {
    code: value || option.label.slice(0, separator).trim(),
    description: option.label.slice(separator + 3).trim(),
  };
}

function findSelect(fields: FormField[], what: string, match: (field: FormField) => boolean) {
  const select = fields.find((field) => field.tag === "select" && match(field));
  if (!select) throw new SiiauParseError(`Search form changed: the ${what} <select> is missing`);
  return select;
}

/** Reads the cycle and campus lists from `sspseca.forma_consulta` (docs/siiau.md §3). */
export function parseSearchForm(html: string): SearchForm {
  const fields = extractForms(html).flatMap((form) => form.fields);
  const cycleSelect = findSelect(
    fields,
    "cycle",
    (field) => field.id?.toLowerCase() === "cicloid" || field.name === "ciclop",
  );
  const centerSelect = findSelect(fields, "campus", (field) => field.name === "cup");

  const cycles = cycleSelect.options
    .map(toCodeAndDescription)
    .filter((option) => option !== null)
    .map(({ code, description }) => ({ code, label: description }));
  const centers = centerSelect.options
    .map(toCodeAndDescription)
    .filter((option) => option !== null)
    .map(({ code, description }) => ({ code, name: description }));

  if (cycles.length === 0 || centers.length === 0) {
    throw new SiiauParseError("Search form has no cycles or no campuses");
  }
  return { cycles, centers };
}
