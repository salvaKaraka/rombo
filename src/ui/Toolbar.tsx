/**
 * Barra de herramientas. Reproduce los `actionSet` de `plugin.xml` y el orden
 * que describe el manual §1, sumando el exportar a imagen y el selector de tema.
 */

interface Accion {
  clave: string
  icono: string
  etiqueta: string
  titulo: string
  onClick: () => void
  deshabilitado?: boolean
  destacado?: boolean
  /** Oculta la etiqueta textual en pantallas angostas pero deja el icono. */
  soloIcono?: boolean
}

interface Props {
  grupos: Accion[][]
}

export function Toolbar({ grupos }: Props) {
  return (
    <div className="toolbar" role="toolbar">
      {grupos.map((grupo, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="tb-sep" aria-hidden />}
          {grupo.map((a) => (
            <button
              key={a.clave}
              type="button"
              className={`tb${a.destacado ? ' destacado' : ''}`}
              title={a.titulo}
              aria-label={a.etiqueta}
              disabled={a.deshabilitado}
              onClick={a.onClick}
            >
              <span className="ico" aria-hidden>
                {a.icono}
              </span>
              {!a.soloIcono && <span className="tb-etiqueta">{a.etiqueta}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export type { Accion as AccionToolbar }
