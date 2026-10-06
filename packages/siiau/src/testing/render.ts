/**
 * Renders pages in SIIAU's style from our own data, for fake servers in tests and local
 * development. The markup follows test/fixtures/synthetic (and therefore docs/siiau.md); a
 * round-trip test guarantees the parser reads back exactly what was rendered.
 */
import { WEEKDAYS, type SearchForm, type Section, type Session } from "../model";

const DAY_LETTERS = ["L", "M", "I", "J", "V", "S"] as const;

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function cell(text: string | null): string {
  return text ? escapeHtml(text) : "&nbsp;";
}

function toSiiauDate(iso: string | null): string {
  if (!iso) return "";
  const [year = "", month = "", day = ""] = iso.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function renderSession(session: Session): string {
  const time =
    session.start && session.end
      ? `${session.start.replace(":", "")}-${session.end.replace(":", "")}`
      : null;
  const days = WEEKDAYS.map((day, index) =>
    session.days.includes(day) ? DAY_LETTERS[index] : ".",
  ).join(" ");
  const period =
    session.startDate && session.endDate
      ? `${toSiiauDate(session.startDate)} - ${toSiiauDate(session.endDate)}`
      : null;
  return `<TR><TD>${session.number}</TD><TD>${cell(time)}</TD><TD>${days}</TD><TD>${cell(session.building)}</TD><TD>${cell(session.room)}</TD><TD>${cell(period)}</TD></TR>`;
}

function renderSection(section: Section, index: number): string {
  const professors = section.professors.length
    ? `<TABLE WIDTH=100% BORDER=0>${section.professors
        .map(
          (professor) =>
            `<TR><TD class="tdprofesor">${cell(professor.session)}</TD><TD class="tdprofesor">${escapeHtml(professor.name)}</TD></TR>`,
        )
        .join("\r\n")}</TABLE>`
    : "&nbsp;";
  return `<TR BGCOLOR="${index % 2 ? "#FFFFFF" : "#E5E5E5"}">
<TD class=tddatos>${section.nrc}</TD>
<TD class=tddatos><A HREF="#">${escapeHtml(section.subjectCode)}</A></TD>
<TD class=tddatos><A HREF="#">${escapeHtml(section.subjectName)}</A></TD>
<TD class=tddatos>${escapeHtml(section.section)}</TD>
<TD class=tddatos>${String(section.credits)}</TD>
<TD class=tddatos>${String(section.capacity)}</TD>
<TD class=tddatos>${String(section.available)}</TD>
<TD><TABLE class=td1 WIDTH=100% BORDER=0>
${section.sessions.map(renderSession).join("\r\n")}
</TABLE></TD>
<TD class=tddatos>${professors}</TD>
</TR>`;
}

export function renderOfferPage(
  sections: readonly Section[],
  heading = "CENTRO UNIVERSITARIO",
): string {
  return `<HTML>
<HEAD><TITLE>Consulta de Oferta Académica</TITLE></HEAD>
<BODY BGCOLOR="#FFFFFF">
<CENTER><B>${escapeHtml(heading)}</B></CENTER>
<TABLE BORDER=1 WIDTH=100% CELLSPACING=0>
<TR><TH CLASS=tdtitulo>NRC</TH><TH CLASS=tdtitulo>Clave</TH><TH CLASS=tdtitulo>Materia</TH><TH CLASS=tdtitulo>Sec</TH><TH CLASS=tdtitulo>CR</TH><TH CLASS=tdtitulo>CUP</TH><TH CLASS=tdtitulo>DIS</TH><TH CLASS=tdtitulo>Ses/Hora/Días/Edif/Aula/Periodo</TH><TH CLASS=tdtitulo>Ses/Profesor</TH></TR>
${sections.map(renderSection).join("\r\n")}
</TABLE>
<P>Total de registros: <B>${String(sections.length)}</B></P>
</BODY>
</HTML>`.replaceAll(/\r?\n/g, "\r\n");
}

export function renderSearchForm(form: SearchForm): string {
  const cycles = form.cycles
    .map((cycle) => `<OPTION VALUE=${cycle.code}>${cycle.code} - ${escapeHtml(cycle.label)}`)
    .join("\r\n");
  const centers = form.centers
    .map((center) => `<OPTION VALUE=${center.code}>${center.code} - ${escapeHtml(center.name)}`)
    .join("\r\n");
  return `<HTML><HEAD><TITLE>Consulta de Oferta Académica</TITLE></HEAD><BODY>
<FORM NAME=forma ACTION="sspseca.consulta_oferta" METHOD=POST>
<SELECT NAME=ciclop ID=cicloID>
${cycles}
</SELECT>
<SELECT NAME=cup>
<OPTION VALUE="">Seleccione un centro
${centers}
</SELECT>
<INPUT TYPE=TEXT NAME=crsep><INPUT TYPE=TEXT NAME=clasep>
</FORM></BODY></HTML>`;
}

/** ISO-8859-1 bytes, like SIIAU sends. Throws on characters it cannot represent. */
export function encodeLatin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 0xff) throw new Error(`Cannot encode "${text.charAt(index)}" in ISO-8859-1`);
    bytes[index] = code;
  }
  return bytes;
}
