import { Parser } from "htmlparser2";

/**
 * A minimal view of the tables in a page: only <table>, <tr>, <td>/<th> and their text.
 * SIIAU's results are tables nested inside tables, and this is all the parser needs.
 * Built in one streaming pass with htmlparser2, without a full DOM.
 */
export interface TableNode {
  classes: readonly string[];
  rows: RowNode[];
}

export interface RowNode {
  classes: readonly string[];
  cells: CellNode[];
}

export interface CellNode {
  tag: "td" | "th";
  classes: readonly string[];
  /** Text of the cell itself, whitespace-normalized; text of nested tables is excluded. */
  text: string;
  tables: TableNode[];
}

type OpenNode =
  | { kind: "table"; node: TableNode }
  | { kind: "tr"; node: RowNode }
  | { kind: "cell"; node: CellNode; rawText: string[] };

const SKIPPED_TEXT_TAGS = new Set(["script", "style", "noscript", "title"]);
const NO_CLASSES: readonly string[] = [];

/** Collapses every run of whitespace (including the &nbsp; character) into one space. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function classList(value: string | undefined): readonly string[] {
  return value ? value.toLowerCase().split(/\s+/).filter(Boolean) : NO_CLASSES;
}

export function hasClass(node: { classes: readonly string[] }, name: string): boolean {
  return node.classes.includes(name);
}

/** Top-level tables of the page, in document order. */
export function extractTables(html: string): TableNode[] {
  const tables: TableNode[] = [];
  const stack: OpenNode[] = [];
  let skippedDepth = 0;

  const innermostTable = (): TableNode | undefined => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const open = stack[index];
      if (open?.kind === "table") return open.node;
    }
    return undefined;
  };

  const popTop = () => {
    const open = stack.pop();
    if (open?.kind === "cell") open.node.text = normalizeWhitespace(open.rawText.join(""));
    return open;
  };

  /** Pops open nodes until one of `kind` has been closed (missing end tags are common). */
  const closeUpTo = (kind: OpenNode["kind"]) => {
    if (!stack.some((open) => open.kind === kind)) return;
    while (popTop()?.kind !== kind) {
      // keep popping
    }
  };

  const openTable = (classes: readonly string[]) => {
    const table: TableNode = { classes, rows: [] };
    const top = stack.at(-1);
    if (top?.kind === "cell") {
      top.node.tables.push(table);
      top.rawText.push(" "); // text before and after the nested table are separate words
    } else {
      tables.push(table);
    }
    stack.push({ kind: "table", node: table });
    return table;
  };

  const openRow = (classes: readonly string[]) => {
    // A <tr> belongs to the innermost table; anything still open inside that table ends here.
    const table = innermostTable() ?? openTable(NO_CLASSES);
    while (stack.at(-1)?.kind !== "table") popTop();
    const row: RowNode = { classes, cells: [] };
    table.rows.push(row);
    stack.push({ kind: "tr", node: row });
    return row;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        switch (name) {
          case "table":
            openTable(classList(attribs.class));
            break;
          case "tr":
            openRow(classList(attribs.class));
            break;
          case "td":
          case "th": {
            if (stack.at(-1)?.kind === "cell") popTop();
            const top = stack.at(-1);
            const row = top?.kind === "tr" ? top.node : openRow(NO_CLASSES);
            const cell: CellNode = {
              tag: name,
              classes: classList(attribs.class),
              text: "",
              tables: [],
            };
            row.cells.push(cell);
            stack.push({ kind: "cell", node: cell, rawText: [] });
            break;
          }
          case "br": {
            const top = stack.at(-1);
            if (top?.kind === "cell") top.rawText.push(" ");
            break;
          }
          default:
            if (SKIPPED_TEXT_TAGS.has(name)) skippedDepth += 1;
        }
      },
      ontext(text) {
        if (skippedDepth > 0) return;
        const top = stack.at(-1);
        if (top?.kind === "cell") top.rawText.push(text);
      },
      onclosetag(name) {
        switch (name) {
          case "table":
            closeUpTo("table");
            break;
          case "tr":
            closeUpTo("tr");
            break;
          case "td":
          case "th":
            closeUpTo("cell");
            break;
          default:
            if (SKIPPED_TEXT_TAGS.has(name)) skippedDepth = Math.max(0, skippedDepth - 1);
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  while (stack.length > 0) popTop();
  return tables;
}

/** Every row of every table, depth-first, including rows of nested tables. */
export function* allRows(tables: readonly TableNode[]): Generator<RowNode> {
  for (const table of tables) {
    for (const row of table.rows) {
      yield row;
      for (const cell of row.cells) yield* allRows(cell.tables);
    }
  }
}

/** Visible text of a page, for error messages. Not used on the hot path. */
export function roughText(html: string, maxLength = 300): string {
  return normalizeWhitespace(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " "),
  ).slice(0, maxLength);
}
