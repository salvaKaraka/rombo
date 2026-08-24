/**
 * Bitacora de decisiones del pasaje — `editors/FileOutHtml.java`.
 *
 * El original escribe HTML a mano, intercalado con la logica. Aca la bitacora es
 * una estructura de datos y el HTML se genera al final, asi que la misma
 * informacion sirve para la pestaña Log, para descargar y para testear.
 */

export type SeccionLog = 'logico' | 'fisico'

export type SubseccionLog =
  | 'compuestos'
  | 'polivalentes'
  | 'jerarquias'
  | 'idExternos'
  | 'tablas'

export interface EntradaLog {
  seccion: SeccionLog
  subseccion: SubseccionLog
  texto: string
  /** Marca los hitos (decision tomada, fin de un paso). */
  destacado?: boolean
}

export interface Bitacora {
  /** Momento en que arranco el pasaje, ya formateado. */
  fecha: string
  hora: string
  entradas: EntradaLog[]
}

export const SUBSECCIONES: {
  clave: SubseccionLog
  seccion: SeccionLog
  titulo: string
  icono: string
}[] = [
  {
    clave: 'compuestos',
    seccion: 'logico',
    titulo: 'Eliminación de Atributos compuestos',
    icono: '◍',
  },
  {
    clave: 'polivalentes',
    seccion: 'logico',
    titulo: 'Eliminación de Atributos polivalentes',
    icono: '◎',
  },
  { clave: 'jerarquias', seccion: 'logico', titulo: 'Eliminación de Jerarquías', icono: '⑃' },
  {
    clave: 'idExternos',
    seccion: 'fisico',
    titulo: 'Eliminación de Identificadores externos',
    icono: '⊙',
  },
  { clave: 'tablas', seccion: 'fisico', titulo: 'Tablas generadas', icono: '▦' },
]

export function bitacoraVacia(ahora: Date = new Date()): Bitacora {
  return {
    fecha: ahora.toLocaleDateString('es-AR'),
    hora: ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
    entradas: [],
  }
}

/** Agrega una entrada. Devuelve una bitacora nueva. */
export function registrar(
  b: Bitacora,
  subseccion: SubseccionLog,
  texto: string,
  destacado = false,
): Bitacora {
  const seccion = SUBSECCIONES.find((s) => s.clave === subseccion)!.seccion
  return { ...b, entradas: [...b.entradas, { seccion, subseccion, texto, destacado }] }
}

/** Agrega varias entradas de la misma subseccion. */
export function registrarVarias(
  b: Bitacora,
  subseccion: SubseccionLog,
  textos: string[],
): Bitacora {
  return textos.reduce((acc, t) => registrar(acc, subseccion, t), b)
}

export function entradasDe(b: Bitacora, subseccion: SubseccionLog): EntradaLog[] {
  return b.entradas.filter((e) => e.subseccion === subseccion)
}

export function tieneSeccion(b: Bitacora, seccion: SeccionLog): boolean {
  return b.entradas.some((e) => e.seccion === seccion)
}

// ---------------------------------------------------------------------------
// Render a HTML autocontenido, para descargar
// ---------------------------------------------------------------------------

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function bitacoraHtml(b: Bitacora): string {
  const seccion = (clave: SeccionLog, titulo: string, icono: string) => {
    if (!tieneSeccion(b, clave)) return ''
    const subs = SUBSECCIONES.filter((s) => s.seccion === clave)
      .map((s) => {
        const entradas = entradasDe(b, s.clave)
        if (entradas.length === 0) return ''
        const items = entradas
          .map(
            (e) =>
              `<p class="${e.destacado ? 'hito' : ''}">${escapar(e.texto)}</p>`,
          )
          .join('\n')
        return `<section class="sub"><h3><span class="ico">${s.icono}</span> ${s.titulo}:</h3>${items}</section>`
      })
      .join('\n')
    return `<section class="paso"><h2><span class="ico">${icono}</span> ${titulo}</h2>${subs}</section>`
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>rombo — log del pasaje</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-serif, Georgia, "Times New Roman", serif; max-width: 60rem;
         margin: 0 auto; padding: 2.5rem 1.5rem; line-height: 1.65;
         background: #fbfbfd; color: #16161a; }
  header { border: 3px double #b9b9c6; background: #ececf1; padding: 1.25rem;
           text-align: center; border-radius: 4px; }
  header h1 { margin: 0; font-size: 1.6rem; letter-spacing: .02em; }
  .meta { text-align: right; color: #5b5b6b; font-size: .9rem; margin: .75rem 0 2rem; }
  h2 { color: #6E0CB8; font-size: 1.3rem; margin: 2.25rem 0 .5rem;
       border-bottom: 1px solid #e2e2ea; padding-bottom: .35rem; }
  h3 { color: #4501CC; font-size: 1.05rem; margin: 1.5rem 0 .5rem; }
  .sub { padding-left: 1.5rem; }
  p { margin: .4rem 0; }
  .hito { font-weight: 700; }
  .ico { font-family: ui-sans-serif, system-ui, sans-serif; opacity: .75; }
  @media (prefers-color-scheme: dark) {
    body { background: #14141a; color: #e8e8ef; }
    header { background: #22222c; border-color: #44444f; }
    h2 { color: #c39bf0; border-bottom-color: #2e2e3a; }
    h3 { color: #9db4ff; }
    .meta { color: #9b9baa; }
  }
</style></head>
<body>
  <header><h1>rombo &mdash; log del pasaje</h1></header>
  <p class="meta">${escapar(b.fecha)} &nbsp;&middot;&nbsp; ${escapar(b.hora)}</p>
  ${seccion('logico', 'Pasaje a Modelo Lógico', '◈')}
  ${seccion('fisico', 'Pasaje a Modelo Físico', '▤')}
</body></html>`
}
