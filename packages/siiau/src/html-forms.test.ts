import { describe, expect, it } from "vitest";

import { extractForms } from "./html-forms";

// Synthetic markup in the style of old Oracle PL/SQL pages (uppercase tags, unquoted
// attributes, unclosed <OPTION>). It is NOT a SIIAU capture: real fixtures come from
// `pnpm capture`.
const LEGACY_STYLE_FORM = `
<HTML><BODY>
<FORM ACTION="sspseca.consulta_oferta" METHOD=post>
  <SELECT name=ciclop id=cicloID>
    <OPTION value=202620>202620 - Calendario 26&nbsp;B
    <OPTION value=202710 SELECTED>202710 - Calendario 27 A
  </SELECT>
  <INPUT TYPE=checkbox NAME=lup VALUE=M CHECKED>
  <INPUT NAME=crsep>
  <TEXTAREA name=notas></TEXTAREA>
</FORM>
<INPUT type=hidden name=fuera value=1>
</BODY></HTML>`;

describe("extractForms", () => {
  const forms = extractForms(LEGACY_STYLE_FORM);
  const [form, orphan] = forms;

  it("finds the form and the fields outside it", () => {
    expect(forms).toHaveLength(2);
    expect(form?.action).toBe("sspseca.consulta_oferta");
    expect(form?.method).toBe("post");
    expect(orphan?.action).toBeNull();
    expect(orphan?.fields.map((field) => field.name)).toEqual(["fuera"]);
  });

  it("reads selects with unclosed options, decoding entities", () => {
    const select = form?.fields.find((field) => field.tag === "select");

    expect(select).toMatchObject({ name: "ciclop", id: "cicloID" });
    expect(select?.options).toEqual([
      { value: "202620", label: "202620 - Calendario 26 B", selected: false },
      { value: "202710", label: "202710 - Calendario 27 A", selected: true },
    ]);
  });

  it("reads input types, values and checked state, defaulting the type to text", () => {
    const inputs = form?.fields.filter((field) => field.tag === "input");

    expect(inputs).toEqual([
      expect.objectContaining({ name: "lup", type: "checkbox", value: "M", checked: true }),
      expect.objectContaining({ name: "crsep", type: "text", value: null, checked: false }),
    ]);
  });

  it("includes textareas", () => {
    expect(form?.fields.at(-1)).toMatchObject({ tag: "textarea", name: "notas", type: null });
  });
});
