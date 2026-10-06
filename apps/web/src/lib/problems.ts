import type { ApiErrorKind } from "@haycupo/worker/contract";

/** What we tell the student for each kind of problem. Plain Spanish, and what they can do. */
export const PROBLEM_MESSAGES: Record<ApiErrorKind, { title: string; detail: string }> = {
  invalid_query: {
    title: "Revisa tu búsqueda",
    detail: "Escribe la clave de la materia (por ejemplo, I5890) o parte de su nombre.",
  },
  siiau_unavailable: {
    title: "SIIAU no está respondiendo",
    detail:
      "La Consulta de Oferta Académica no contestó o devolvió un error. Intenta de nuevo en unos minutos.",
  },
  siiau_changed: {
    title: "SIIAU cambió su página",
    detail:
      "Recibimos una página que no sabemos leer, así que preferimos no mostrar datos que podrían estar mal. Ya quedó registrado en la página de estado.",
  },
  busy: {
    title: "Hay muchas consultas en este momento",
    detail:
      "Le pedimos datos a SIIAU de uno en uno y con pausas, para no saturarlo. Intenta de nuevo en un minuto.",
  },
  paused: {
    title: "Las consultas a SIIAU están en pausa",
    detail:
      "Detuvimos las consultas un rato porque SIIAU falló varias veces seguidas, o por mantenimiento. Se reanudan solas.",
  },
  blocked: {
    title: "No podemos consultar SIIAU ahora",
    detail:
      "Las reglas de acceso de SIIAU (robots.txt) no permiten la consulta, o no pudimos leerlas. Respetamos esas reglas.",
  },
  unauthorized: {
    title: "Algo salió mal de nuestro lado",
    detail: "Error de configuración del servicio. Si sigue pasando, avísanos.",
  },
  not_found: {
    title: "Algo salió mal de nuestro lado",
    detail: "Intenta de nuevo en unos minutos.",
  },
  internal: {
    title: "Algo salió mal de nuestro lado",
    detail: "Intenta de nuevo en unos minutos.",
  },
};
