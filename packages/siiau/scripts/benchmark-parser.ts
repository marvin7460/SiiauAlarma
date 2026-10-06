/**
 * How much CPU does parsing cost? Decode + parse + validate, per page size.
 *
 *   pnpm --filter @haycupo/siiau benchmark
 *
 * Pages are built by repeating a section row in SIIAU's style (two sessions, two professors).
 */
import { decodeSiiauBody } from "../src/encoding";
import { parseOfferPage } from "../src/offer";

function sectionRow(index: number): string {
  const nrc = String(70000 + index);
  return `<TR BGCOLOR="#E5E5E5">
<TD class=tddatos>${nrc}</TD><TD class=tddatos><A HREF="x">I5890</A></TD>
<TD class=tddatos><A HREF="x">BASES DE DATOS</A></TD><TD class=tddatos>D${String(index % 100).padStart(2, "0")}</TD>
<TD class=tddatos>8</TD><TD class=tddatos>40</TD><TD class=tddatos>${String(index % 3)}</TD>
<TD><TABLE class=td1 WIDTH=100% BORDER=0>
<TR><TD>01</TD><TD>1300-1455</TD><TD>L . . . . .</TD><TD>DUCT1</TD><TD>LC03</TD><TD>17/08/26 - 11/12/26</TD></TR>
<TR><TD>02</TD><TD>1300-1455</TD><TD>. . . J . .</TD><TD>DUCT2</TD><TD>A007</TD><TD>17/08/26 - 11/12/26</TD></TR>
</TABLE></TD>
<TD class=tddatos><TABLE WIDTH=100% BORDER=0>
<TR><TD class="tdprofesor">01</TD><TD class="tdprofesor">MUÑOZ PEÑA, JOSE ANGEL</TD></TR>
<TR><TD class="tdprofesor">02</TD><TD class="tdprofesor">GARCIA LOPEZ, MARIA</TD></TR>
</TABLE></TD></TR>`;
}

function latin1Page(sections: number): Uint8Array {
  const rows = Array.from({ length: sections }, (_, index) => sectionRow(index)).join("\r\n");
  const html = `<HTML><HEAD><TITLE>Consulta</TITLE></HEAD><BODY><TABLE BORDER=1>\r\n${rows}\r\n</TABLE><P>Total de registros: <B>${String(sections)}</B></P></BODY></HTML>`;
  return Uint8Array.from(html, (char) => char.charCodeAt(0));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const RUNS = 50;
console.log("sections | bytes   | median ms (decode + parse + validate)");
for (const sections of [5, 30, 100, 500]) {
  const bytes = latin1Page(sections);
  for (let warmup = 0; warmup < 5; warmup += 1) parseOfferPage(decodeSiiauBody(bytes));
  const timings: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    parseOfferPage(decodeSiiauBody(bytes));
    timings.push(performance.now() - started);
  }
  console.log(
    `${String(sections).padStart(8)} | ${String(bytes.byteLength).padStart(7)} | ${median(timings).toFixed(2)}`,
  );
}
