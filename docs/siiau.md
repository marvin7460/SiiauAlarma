# Análisis técnico: Consulta de Oferta Académica de SIIAU (UdeG)

Documento de referencia para el proyecto **¿Hay Cupo?**. Guárdalo en el repo como `docs/siiau.md` y actualízalo cuando algo cambie.

Fecha del análisis: 5 de octubre de 2026. Fuentes: consultas reales a la versión HTTPS de SIIAU y el código de tres scrapers de código abierto (al final).

## 1. Endpoints

Hay dos direcciones del mismo sistema (Oracle PL/SQL):

| Uso         | URL                                      | Notas                                       |
| ----------- | ---------------------------------------- | ------------------------------------------- |
| Recomendada | `https://siiauescolar.siiau.udg.mx/wal/` | HTTPS. Funciona con GET y POST.             |
| Antigua     | `http://consulta.siiau.udg.mx/wco/`      | Solo HTTP; si pides HTTPS, redirige a HTTP. |

Páginas:

- `sspseca.forma_consulta`: formulario de búsqueda (de aquí salen ciclos y centros).
- `sspseca.consulta_oferta`: resultados (la tabla de secciones con cupos).
- `sspseca.lista_carreras?cup={centro}`: carreras de un centro (filas con un `<a>` que contiene la clave de la carrera y una celda con el nombre).
- `/wco/scpcata.cataxcarr`: catálogo de materias por carrera (parámetros `carrerap`, `ordenp`, `mostrarp`, `tipop=T`). Útil para el autocompletado.
- `/wco/scpcata.detmate?subclavep={area},{clave},{ciclo de inicio}&pEntra=OAP`: detalle de una materia del catálogo (lo usa Kyostenas; nadie sabe qué significa `pEntra`). No lo necesitamos por ahora.

## 2. Parámetros de `sspseca.consulta_oferta`

| Parámetro           | Significado                                                                   | Ejemplo     |
| ------------------- | ----------------------------------------------------------------------------- | ----------- |
| `ciclop`            | Ciclo                                                                         | `202620`    |
| `cup`               | Centro universitario                                                          | `D` (CUCEI) |
| `majrp`             | Carrera (opcional)                                                            | `INNI`      |
| `crsep`             | Clave de materia                                                              | `I5890`     |
| `clasep`            | Nombre de la materia (opcional)                                               |             |
| `horaip` / `horafp` | Hora inicio / fin, formato 24 h                                               | `0700`      |
| `edifp` / `aulap`   | Edificio / aula (opcional)                                                    |             |
| `ordenp`            | Orden: 0 = materia (los otros valores, por clave o NRC, hay que confirmarlos) | `0`         |
| `mostrarp`          | Registros por página (el formulario ofrece 100, 200, 500)                     | `500`       |

Pendiente de confirmar en el HTML real: el nombre de los campos de días (LU a SA) y el del checkbox "Incluir sólo las secciones con lugares disponibles".

> **Fase 0:** ninguno de los tres scrapers usa esos campos (Kyostenas recibe un argumento `con_cupos`, pero nunca lo manda), así que siguen pendientes. `pnpm capture` guarda el formulario y escribe `packages/siiau/test/fixtures/forma-consulta.fields.json` con el nombre, tipo y valor de cada campo; de ahí saldrá la respuesta. Kyostenas manda `mostrarp=100000`, lo que sugiere que el servidor acepta valores fuera de 100/200/500; no dependeremos de eso.

Ejemplo real:

```
GET https://siiauescolar.siiau.udg.mx/wal/sspseca.consulta_oferta?ciclop=202620&cup=D&crsep=I5890&mostrarp=500
```

## 3. Ciclos y centros

- **Ciclos:** `select#cicloID`. El texto de cada opción tiene el formato `CODIGO - Descripción`. `AAAA10` = calendario A (enero a junio) y `AAAA20` = calendario B (agosto a diciembre). Los códigos con `80` o con letras (por ejemplo `2026C`) son calendarios especiales: lee la descripción, no adivines.
- **Centros:** `select[name=cup]`. Códigos 3, 4, 5, 6 y de la A a la Z. Confirmados: `D` = CUCEI y `C` = CUCEA.
- Kyostenas lee los mismos dos `select` de otra página, `/wal/sgpofer.secciones?pidmp=&majrp=`. Es una fuente alterna si `forma_consulta` cambia.

## 4. Estructura de la página de resultados

- **Encabezado:** ciclo y nombre del centro (por ejemplo, "CENTRO UNIVERSITARIO DE CIENCIAS EXACTAS E INGENIERIAS").
- **Una fila por sección,** con celdas `td.tddatos`, en este orden:
  1. NRC
  2. Clave
  3. Materia
  4. Sección
  5. Créditos (CR)
  6. Cupo total (CUP)
  7. Disponibles (DIS)
- **Sesiones:** tabla interna (`table.td1`) con una fila por sesión:
  - Ses (número de sesión)
  - Hora (`HHMM-HHMM`, por ejemplo `1300-1455`)
  - Días (patrón con puntos para los días vacíos, separado por espacios)
  - Edificio
  - Aula
  - Periodo (`dd/mm/aa - dd/mm/aa`)
- **Profesores:** celdas `td.tdprofesor` (número de sesión y nombre en formato `APELLIDOS, NOMBRE`).
- **Pie:** `Total de registros: N`.

Ejemplo real (2026B, CUCEI, I5890 BASES DE DATOS): NRC 78088, sección D02, cupo 23, disponibles 21, dos sesiones (lunes y jueves de 13:00 a 14:55, en edificios distintos), del 17/08/26 al 11/12/26, un profesor.

> **Fase 0, según el código de los scrapers** (hay que confirmarlo con los fixtures):
>
> - **HTML de estilo antiguo:** etiquetas en mayúsculas y atributos a veces sin comillas. El prototipo de 3vilware (2017) busca literalmente `<TD class=tddatos>` y `<TD class="tdprofesor">`. Por eso el parser no puede depender de expresiones regulares sobre el texto: usará un parser HTML real que normaliza mayúsculas y comillas.
> - **Profesores:** Kyostenas trata la 8.ª celda `td.tddatos` de cada fila como el contenedor de profesores, con pares (sesión, nombre) en celdas `td.tdprofesor`. De su lógica se deduce que las sesiones (`table.td1`) van en una celda sin la clase `tddatos`.
> - **Días:** seis posiciones separadas por espacios, de lunes a sábado, con `.` en los días sin clase. Kyostenas las lee por posición y ManuelDeAlba se queda con las letras al quitar puntos y espacios. Leer por posición es más seguro: no depende de qué letra use SIIAU para cada día.
> - **Paginación:** ninguno de los tres pagina. Kyostenas pide `mostrarp=100000` y ManuelDeAlba `500`.

## 5. Casos especiales que el parser debe manejar

- **Varias sesiones por sección.** Uno de los scrapers abiertos sobrescribe las sesiones y se queda solo con la última; no repitas ese error.
- **Varios profesores,** o ninguno.
- **Celdas vacías** con `&nbsp;` (`\xa0`).
- **Codificación ISO-8859-1** (latin1): decodifica bien para no romper acentos ni la Ñ.
- **Texto en mayúsculas,** casi siempre sin acentos.
- **Oferta no publicada:** la tabla viene vacía con `Total de registros: 0`. Al 5 de octubre de 2026, el ciclo 202710 (2027A) ya aparece en la lista, pero todavía sin secciones.
- **Materias con muchas secciones:** revisa si hace falta paginar según `mostrarp`.

## 6. Fechas clave

Según el calendario escolar 2026-2027, el registro de materias de 2027A es del lunes 11 al viernes 15 de enero de 2027. Es el momento en que más se buscan cupos.

## 7. Uso responsable (obligatorio)

- **Consultar por materia, no por alumno:** agrupar las alertas por (ciclo, centro, clave). Una sola consulta trae todas las secciones de esa materia.
- **Solo materias con alguien esperando:** si nadie vigila una materia, no se consulta.
- **Límite global:** una petición a la vez, con al menos 2–3 segundos entre peticiones.
- **Intervalo por materia:** 5 minutos normalmente; durante el registro, mínimo 2 minutos (configurable).
- **Errores:** backoff exponencial, y pausar todo si SIIAU falla seguido.
- **Identificarse:** User-Agent con nombre del proyecto y correo de contacto. Respetar `robots.txt`.
- **Nunca** automatizar el registro de materias, pedir contraseñas de SIIAU ni saltarse captchas.
- **Aclarar** en el sitio que el proyecto no está afiliado a la Universidad de Guadalajara, y no usar sus logotipos.

## 8. Estado de la verificación (Fase 0)

> **Fase 1:** el parser (`packages/siiau`) ya está implementado y probado con fixtures **sintéticos** que siguen este documento (`test/fixtures/synthetic/`). `test/real-fixtures.test.ts` lo correrá sobre cada captura real en cuanto se suba; si algo de este documento no coincide con SIIAU, esa prueba fallará y se corrige aquí.

El 5 de octubre de 2026 no se pudo consultar SIIAU desde el entorno de desarrollo en la nube: su política de red bloquea ambos dominios (el 403 lo da el proxy del entorno, no SIIAU). La verificación en vivo se hará con `pnpm capture` (desde una red con acceso) y, ya desplegada la app, con una búsqueda real desde la VM (ver `docs/deploy.md`).

| Punto                                                               | Estado                                          | Cómo se confirma                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| Endpoints, parámetros básicos y estructura de la tabla              | Coinciden en el análisis y en los tres scrapers | Fixtures `oferta-*`                                                 |
| Mismo HTML en el host antiguo y en el nuevo                         | Pendiente                                       | `oferta-i5890-2026b` contra `oferta-i5890-2026b-legacy`             |
| Nombres de los campos de días y del checkbox de lugares disponibles | Pendiente                                       | `forma-consulta.fields.json`                                        |
| Valores de `ordenp`                                                 | Pendiente                                       | `forma-consulta.fields.json` (opciones del `select`)                |
| Paginación con `mostrarp`                                           | Pendiente                                       | `oferta-inni-2026b-pagina-1`                                        |
| Oferta no publicada contra clave inexistente                        | Pendiente                                       | `oferta-i5890-2027a-sin-publicar` contra `oferta-clave-inexistente` |
| Codificación declarada por el servidor                              | Pendiente                                       | `content-type` en los `.meta.json`                                  |
| `robots.txt`                                                        | Pendiente                                       | `robots-current.txt` y `robots-legacy.txt`                          |
| SIIAU responde a peticiones desde el servidor                       | Pendiente                                       | Una búsqueda real y la tabla de peticiones en `/estado`             |
| Decodificación de ISO-8859-1 / windows-1252 en Node                 | Confirmado (tabla propia; decisión 9)           | Pruebas de `packages/siiau/src/encoding.test.ts`                    |

## Fuentes

- [Consulta de Oferta Académica (HTTPS)](https://siiauescolar.siiau.udg.mx/wal/sspseca.forma_consulta)
- [ManuelDeAlba/siiau-scraper](https://github.com/ManuelDeAlba/siiau-scraper) (selectores y parámetros)
- [Kyostenas/siiau_consultas_api](https://github.com/Kyostenas/siiau_consultas_api) (parámetros completos, latin1, `table.td1`)
- [3vilware/siiauScraper](https://github.com/3vilware/siiauScraper) (prototipo en PHP que revisaba un NRC recargando cada 2 segundos; ejemplo de lo que no hay que hacer)
- [Calendario escolar UdeG 2026-2027](https://escolar.udg.mx/calendario-escolar-para-centros-universitarios-2026-2027)
