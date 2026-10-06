import { Parser } from "htmlparser2";

export interface FormOption {
  value: string | null;
  label: string;
  selected: boolean;
}

export interface FormField {
  tag: "input" | "select" | "textarea";
  name: string | null;
  id: string | null;
  type: string | null;
  value: string | null;
  checked: boolean;
  options: FormOption[];
}

export interface FormSummary {
  /** `null` for fields that live outside any <form>. */
  action: string | null;
  method: string | null;
  fields: FormField[];
}

function normalizeText(text: string): string {
  // In JS regexes, \s already covers the non-breaking space that &nbsp; decodes to.
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Lists every form and field in a page, so the real parameter names of SIIAU's search form
 * (days, "only sections with seats", ...) can be read from a capture instead of guessed.
 */
export function extractForms(html: string): FormSummary[] {
  const forms: FormSummary[] = [];
  let currentForm: FormSummary | undefined;
  let orphanForm: FormSummary | undefined;
  let currentSelect: FormField | undefined;
  let currentOption: FormOption | undefined;

  const formForField = (): FormSummary => {
    if (currentForm) return currentForm;
    if (!orphanForm) {
      orphanForm = { action: null, method: null, fields: [] };
      forms.push(orphanForm);
    }
    return orphanForm;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const attr = (key: string): string | null => attribs[key] ?? null;
        switch (name) {
          case "form":
            currentForm = { action: attr("action"), method: attr("method"), fields: [] };
            forms.push(currentForm);
            break;
          case "input":
          case "select":
          case "textarea": {
            const field: FormField = {
              tag: name,
              name: attr("name"),
              id: attr("id"),
              type: name === "input" ? (attr("type")?.toLowerCase() ?? "text") : null,
              value: attr("value"),
              checked: "checked" in attribs,
              options: [],
            };
            formForField().fields.push(field);
            if (name === "select") currentSelect = field;
            break;
          }
          case "option":
            if (currentSelect) {
              currentOption = { value: attr("value"), label: "", selected: "selected" in attribs };
              currentSelect.options.push(currentOption);
            }
            break;
        }
      },
      ontext(text) {
        if (currentOption) currentOption.label += text;
      },
      onclosetag(name) {
        switch (name) {
          case "form":
            currentForm = undefined;
            break;
          case "select":
            currentSelect = undefined;
            break;
          case "option":
            if (currentOption) currentOption.label = normalizeText(currentOption.label);
            currentOption = undefined;
            break;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return forms;
}
