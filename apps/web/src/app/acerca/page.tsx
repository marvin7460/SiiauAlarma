import type { Metadata } from "next";
import Link from "next/link";

import { publicContactEmail } from "@/lib/env";

export const metadata: Metadata = {
  title: "Acerca de",
  description: "Qué es ¿Hay Cupo?, cómo funciona y cómo cuida a SIIAU.",
};

const REPOSITORY = "https://github.com/marvin7460/SiiauAlarma";

function Section(props: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={props.id} className="space-y-2">
      <h2 id={props.id} className="text-lg font-semibold">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export default function AboutPage() {
  const contact = publicContactEmail();
  return (
    <article className="space-y-6 text-stone-800 dark:text-stone-200 [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">
      <h1 className="text-2xl font-bold">Acerca de ¿Hay Cupo?</h1>

      <p>
        En el registro de materias, los lugares se liberan cuando alguien da de baja una sección, y
        se vuelven a llenar en minutos. La única forma de enterarse era recargar la Consulta de
        Oferta Académica de SIIAU una y otra vez. ¿Hay Cupo? la revisa por ti y te avisa (por
        correo, Telegram o notificación) en cuanto una sección pasa de 0 a 1 o más lugares.
      </p>

      <div
        role="note"
        className="rounded-xl border border-stone-300 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
      >
        <p>
          <strong>Proyecto independiente.</strong> ¿Hay Cupo? no está afiliado, patrocinado ni
          respaldado por la Universidad de Guadalajara. «SIIAU» y «UdeG» se mencionan solo para
          explicar de dónde vienen los datos. Para registrar materias, usa siempre SIIAU.
        </p>
      </div>

      <Section id="como-funciona" title="Cómo funciona">
        <ul className="space-y-1">
          <li>
            Los datos vienen de la Consulta de Oferta Académica de SIIAU, la misma página pública
            que cualquiera puede abrir sin iniciar sesión.
          </li>
          <li>
            Un servicio revisa, cada pocos minutos, las materias que alguien está esperando y
            compara los lugares libres con la revisión anterior.
          </li>
          <li>
            Solo avisa cuando una sección pasa de 0 a 1 o más lugares. Si SIIAU falla o responde
            algo raro, no avisa: preferimos callar a mandarte una falsa alarma.
          </li>
          <li>Las alertas se apagan solas cuando termina el periodo de registro del ciclo.</li>
        </ul>
      </Section>

      <Section id="uso-responsable" title="Uso responsable de SIIAU">
        <p>SIIAU es de todos los estudiantes. Para no cargarlo:</p>
        <ul className="space-y-1">
          <li>
            Consultamos <strong>por materia, no por alumno</strong>: cien personas esperando la
            misma materia son una sola consulta.
          </li>
          <li>Solo revisamos materias que alguien está esperando.</li>
          <li>
            <strong>Una consulta a la vez</strong>, con al menos 3 segundos entre una y otra.
          </li>
          <li>
            Cada materia se revisa cada 5 minutos; durante la semana de registro, cada 2. Si la
            oferta aún no se publica, una vez por hora.
          </li>
          <li>
            Si SIIAU falla, esperamos cada vez más antes de reintentar, y si falla varias veces
            seguidas nos detenemos por completo (freno automático). También hay un freno manual.
          </li>
          <li>
            Cada consulta se identifica con el nombre del proyecto y un correo de contacto, y
            respetamos el archivo <code>robots.txt</code> de SIIAU.
          </li>
          <li>
            <strong>Nunca</strong> registramos materias por ti, pedimos contraseñas de SIIAU ni
            saltamos captchas.
          </li>
        </ul>
        <p>
          Puedes ver en todo momento si el servicio está consultando o en pausa en la página de{" "}
          <Link href="/estado" className="underline">
            estado
          </Link>
          .
        </p>
      </Section>

      <Section id="codigo" title="Código abierto">
        <p>
          El código está en{" "}
          <a href={REPOSITORY} className="underline">
            GitHub
          </a>
          , con la explicación de cada decisión técnica.
        </p>
      </Section>

      <Section id="contacto" title="Contacto">
        <p>
          {contact ? (
            <>
              Dudas, errores o si representas a la UdeG y algo te preocupa:{" "}
              <a href={`mailto:${contact}`} className="underline">
                {contact}
              </a>
              .
            </>
          ) : (
            <>
              Dudas o errores: abre un issue en{" "}
              <a href={REPOSITORY} className="underline">
                GitHub
              </a>
              .
            </>
          )}
        </p>
      </Section>
    </article>
  );
}
