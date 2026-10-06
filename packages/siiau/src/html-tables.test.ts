import { describe, expect, it } from "vitest";

import { allRows, extractTables, roughText } from "./html-tables";

describe("extractTables", () => {
  it("keeps nested tables inside their cell and out of the cell's text", () => {
    const tables = extractTables(
      "<TABLE class=outer><TR><TD class=a>1</TD><TD>x<TABLE class=inner><TR><TD>2</TD></TR></TABLE>y</TD></TR></TABLE>",
    );

    expect(tables).toHaveLength(1);
    const [first, second] = tables[0]?.rows[0]?.cells ?? [];
    expect(first).toMatchObject({ text: "1", classes: ["a"] });
    expect(second?.text).toBe("x y");
    expect(second?.tables[0]?.rows[0]?.cells[0]?.text).toBe("2");
  });

  it("closes cells and rows that have no end tag", () => {
    const tables = extractTables("<table><tr><td>a<td>b<tr><td>c</table>");

    expect(tables[0]?.rows.map((row) => row.cells.map((cell) => cell.text))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("normalizes whitespace, &nbsp; and <br>", () => {
    const tables = extractTables("<table><tr><td>  ANA&nbsp;SOFIA<br>LOPEZ\r\n </td></tr></table>");

    expect(tables[0]?.rows[0]?.cells[0]?.text).toBe("ANA SOFIA LOPEZ");
  });

  it("does not split words at inline tags", () => {
    const tables = extractTables(
      "<table><tr><td>BASES <a href=x>DE</a><b>DATOS</b></td></tr></table>",
    );

    expect(tables[0]?.rows[0]?.cells[0]?.text).toBe("BASES DEDATOS");
  });

  it("ignores script, style and title contents", () => {
    const tables = extractTables(
      '<title>t</title><script>var x = "<td>no</td>";</script><style>td{}</style><table><tr><td>yes</td></tr></table>',
    );

    expect([...allRows(tables)].flatMap((row) => row.cells.map((c) => c.text))).toEqual(["yes"]);
  });

  it("walks rows of nested tables depth-first", () => {
    const tables = extractTables(
      "<table><tr><td>A<table><tr><td>A1</td></tr></table></td></tr><tr><td>B</td></tr></table>",
    );

    expect([...allRows(tables)].map((row) => row.cells[0]?.text)).toEqual(["A", "A1", "B"]);
  });
});

describe("roughText", () => {
  it("strips tags, scripts and &nbsp; for error messages", () => {
    expect(roughText("<h2>No&nbsp;disponible</h2><script>x()</script><p>Intente</p>")).toBe(
      "No disponible Intente",
    );
  });
});
