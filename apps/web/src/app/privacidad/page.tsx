import { RETENTION } from "@haycupo/engine/retention";
import type { Metadata } from "next";
import Link from "next/link";

import { publicContactEmail } from "@/lib/env";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description: "Qué datos guarda ¿Hay Cupo?, para qué, con quién y cómo borrarlos.",
};

/** Change it whenever the text changes in substance. */
const UPDATED = "6 de octubre de 2026";

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

export default function PrivacyPage() {
  const contact = publicContactEmail();
  const contactLink = contact ? (
    <a href={`mailto:${contact}`} className="underline">
      {contact}
    </a>
  ) : (
    "el correo de contacto del repositorio del proyecto"
  );

  return (
    <article className="max-w-none space-y-6 text-stone-800 dark:text-stone-200 [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Aviso de privacidad</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">Actualizado el {UPDATED}.</p>
      </div>

      <p>
        ¿Hay Cupo? es un proyecto independiente y sin fines de lucro que avisa cuando se libera un
        lugar en una materia de la Universidad de Guadalajara. <strong>No está afiliado</strong> a
        la UdeG. Quien mantiene el proyecto es responsable de tus datos; puedes escribir a{" "}
        {contactLink}.
      </p>

      <Section id="que-guardamos" title="Qué datos guardamos">
        <ul className="space-y-1">
          <li>
            <strong>Tu correo electrónico</strong>, para entrar (con un enlace, sin contraseña) y
            para avisarte.
          </li>
          <li>
            <strong>Tus alertas</strong>: ciclo, centro, materia, NRC o filtros (días, horario,
            profesor) y por dónde quieres el aviso.
          </li>
          <li>
            <strong>Si conectas Telegram</strong>: el número que identifica tu chat con el bot. No
            vemos tu teléfono ni tus otros chats.
          </li>
          <li>
            <strong>Si activas notificaciones</strong>: la dirección de suscripción que entrega tu
            navegador y sus llaves de cifrado, para poder mandarte el aviso.
          </li>
          <li>
            <strong>Registro de avisos</strong>: qué aviso se mandó, por qué canal y cuándo.
          </li>
        </ul>
        <p>
          <strong>Nunca</strong> te pedimos tu contraseña de SIIAU ni tu código de estudiante, no
          registramos materias por ti y no guardamos tu nombre, tu dirección IP ni tu ubicación en
          nuestra base de datos.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          Solo una: <code>hc_sesion</code>, para que sigas dentro después de entrar (dura 30 días o
          hasta que salgas). No usamos cookies de análisis ni de publicidad, ni rastreadores. Las
          cifras de la página de{" "}
          <Link href="/impacto" className="underline">
            impacto
          </Link>{" "}
          son conteos diarios que no identifican a nadie.
        </p>
      </Section>

      <Section id="para-que" title="Para qué los usamos">
        <ul className="space-y-1">
          <li>Revisar las materias que esperas y avisarte cuando se libere un lugar.</li>
          <li>Que puedas entrar a tu cuenta y administrar tus alertas.</li>
          <li>
            Evitar abusos (por ejemplo, limitar cuántos enlaces de entrada se piden por correo).
          </li>
        </ul>
        <p>No vendemos tus datos, no los usamos para publicidad y no te mandamos otros correos.</p>
      </Section>

      <Section id="con-quien" title="Con quién se comparten">
        <p>
          Con los servicios que hacen funcionar el proyecto, solo para eso. Algunos guardan o
          procesan datos fuera de México, principalmente en Estados Unidos:
        </p>
        <ul className="space-y-1">
          <li>Turso: la base de datos.</li>
          <li>Netlify: donde corre el sitio (que también consulta SIIAU y envía los avisos).</li>
          <li>Resend: el envío de correos.</li>
          <li>Telegram: los mensajes del bot, si lo conectas.</li>
          <li>
            El servicio de notificaciones de tu navegador (Google, Mozilla, Apple o Microsoft), si
            las activas. El contenido del aviso va cifrado.
          </li>
        </ul>
      </Section>

      <Section id="cuanto-tiempo" title="Cuánto tiempo los guardamos">
        <ul className="space-y-1">
          <li>Tu cuenta: hasta que la borres.</li>
          <li>
            Alertas: mientras estén activas (se apagan solas al terminar el registro del ciclo) y{" "}
            {RETENTION.endedAlertsDays} días después, para que veas tu historial.
          </li>
          <li>Registro de avisos enviados: {RETENTION.notificationsDays} días.</li>
          <li>
            Enlaces para entrar: 15 minutos de validez; se borran {RETENTION.loginTokensDays} día
            después de vencer. Sesiones: 30 días.
          </li>
          <li>
            No guardamos registros de acceso: el sitio no anota tu dirección IP. Los servicios de
            arriba (por ejemplo Netlify, que recibe cada visita) llevan sus propios registros
            técnicos, según sus políticas.
          </li>
        </ul>
      </Section>

      <Section id="tus-derechos" title="Tus derechos">
        <p>
          Puedes acceder a tus datos, corregirlos, cancelarlos u oponerte a su uso (derechos ARCO):
        </p>
        <ul className="space-y-1">
          <li>
            <strong>Acceso:</strong> en «Mis alertas» → «Descargar mis datos» obtienes todo lo que
            guardamos sobre ti.
          </li>
          <li>
            <strong>Cancelación:</strong> «Borrar mi cuenta» elimina de inmediato tu correo, tus
            alertas y todo lo relacionado.
          </li>
          <li>
            <strong>Oposición:</strong> cancela cualquier alerta (también desde el enlace de cada
            aviso) o desconecta Telegram y las notificaciones cuando quieras.
          </li>
          <li>
            <strong>Rectificación</strong> o cualquier duda: escribe a {contactLink}. Respondemos en
            un plazo máximo de 20 días hábiles.
          </li>
        </ul>
      </Section>

      <Section id="cambios" title="Cambios a este aviso">
        <p>Si cambia algo importante, lo publicaremos aquí con la nueva fecha.</p>
      </Section>
    </article>
  );
}
