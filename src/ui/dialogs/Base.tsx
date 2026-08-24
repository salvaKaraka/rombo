/**
 * Armazon de dialogos y piezas reutilizables.
 *
 * El original usa wizards de JFace: titulo, mensaje descriptivo, cuerpo y
 * botones Aceptar / Cancelar. Se conserva esa estructura.
 */

import { useEffect, useRef, type ReactNode } from 'react'

interface DialogoProps {
  titulo: string
  mensaje?: ReactNode
  children?: ReactNode
  ancho?: boolean
  /** Etiqueta del boton primario. Por defecto "Aceptar". */
  aceptar?: string
  onAceptar?: () => void
  aceptarHabilitado?: boolean
  /** Si falta, no se muestra el boton de cancelar (dialogo informativo). */
  onCancelar?: () => void
  cancelar?: string
}

export function Dialogo({
  titulo,
  mensaje,
  children,
  ancho,
  aceptar = 'Aceptar',
  onAceptar,
  aceptarHabilitado = true,
  onCancelar,
  cancelar = 'Cancelar',
}: DialogoProps) {
  const primario = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primario.current?.focus()
  }, [])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onCancelar) {
        e.preventDefault()
        onCancelar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCancelar])

  return (
    <div
      className="velo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onCancelar) onCancelar()
      }}
    >
      <div
        className={`dlg${ancho ? ' ancho' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="dlg-cab">
          <h2>{titulo}</h2>
          {mensaje && <p>{mensaje}</p>}
        </div>
        {children && <div className="dlg-cuerpo">{children}</div>}
        <div className="dlg-pie">
          {onCancelar && (
            <button type="button" className="btn" onClick={onCancelar}>
              {cancelar}
            </button>
          )}
          {onAceptar && (
            <button
              ref={primario}
              type="button"
              className="btn primario"
              onClick={onAceptar}
              disabled={!aceptarHabilitado}
            >
              {aceptar}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Dialogo informativo de un solo boton — equivale a `MessageDialog.openInformation`. */
export function Mensaje({
  titulo,
  texto,
  onCerrar,
  aceptar = 'Aceptar',
}: {
  titulo: string
  texto: ReactNode
  onCerrar: () => void
  aceptar?: string
}) {
  return <Dialogo titulo={titulo} mensaje={texto} onAceptar={onCerrar} aceptar={aceptar} />
}

/** Confirmacion Si / No — equivale a `MessageDialog.openQuestion`. */
export function Confirmar({
  titulo,
  texto,
  onSi,
  onNo,
}: {
  titulo: string
  texto: ReactNode
  onSi: () => void
  onNo: () => void
}) {
  return (
    <Dialogo
      titulo={titulo}
      mensaje={texto}
      onAceptar={onSi}
      aceptar="Sí"
      onCancelar={onNo}
      cancelar="No"
    />
  )
}

// ---------------------------------------------------------------------------
// Lista de opciones A / B / C
// ---------------------------------------------------------------------------

export interface OpcionDef<T extends string> {
  valor: T
  titulo: string
  texto: string
  /** Si esta presente, la opcion se muestra deshabilitada con esta nota. */
  bloqueada?: string
}

export function ListaOpciones<T extends string>({
  opciones,
  elegida,
  onElegir,
  nombre,
}: {
  opciones: OpcionDef<T>[]
  elegida: T | null
  onElegir: (v: T) => void
  nombre: string
}) {
  return (
    <div className="opciones">
      {opciones.map((o) => {
        const deshabilitada = !!o.bloqueada
        const clases = [
          'opcion',
          elegida === o.valor ? 'elegida' : '',
          deshabilitada ? 'deshabilitada' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <label key={o.valor} className={clases}>
            <input
              type="radio"
              name={nombre}
              checked={elegida === o.valor}
              disabled={deshabilitada}
              onChange={() => onElegir(o.valor)}
            />
            <span>
              <span className="tit">{o.titulo}</span>
              <span className="txt">{o.texto}</span>
              {o.bloqueada && <span className="nota">{o.bloqueada}</span>}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pestañas internas
// ---------------------------------------------------------------------------

export function DlgTabs<T extends string>({
  tabs,
  activa,
  onCambiar,
}: {
  tabs: { clave: T; etiqueta: string }[]
  activa: T
  onCambiar: (t: T) => void
}) {
  return (
    <div className="dlg-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.clave}
          type="button"
          role="tab"
          className="dlg-tab"
          aria-selected={activa === t.clave}
          onClick={() => onCambiar(t.clave)}
        >
          {t.etiqueta}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Listas con << >>
// ---------------------------------------------------------------------------

export function Transfer({
  disponibles,
  elegidos,
  tituloDisponibles,
  tituloElegidos,
  onCambiar,
}: {
  disponibles: { id: string; etiqueta: string }[]
  elegidos: { id: string; etiqueta: string }[]
  tituloDisponibles: string
  tituloElegidos: string
  onCambiar: (elegidos: string[]) => void
}) {
  const idsElegidos = elegidos.map((e) => e.id)

  return (
    <div className="transfer">
      <div className="caja">
        <h4>{tituloDisponibles}</h4>
        {disponibles.length === 0 && <div className="vacio-mini">Sin elementos</div>}
        {disponibles.map((d) => (
          <button
            key={d.id}
            type="button"
            className="item"
            onClick={() => onCambiar([...idsElegidos, d.id])}
          >
            {d.etiqueta}
          </button>
        ))}
      </div>
      <div className="flechas">
        <button
          type="button"
          title="Agregar todos"
          disabled={disponibles.length === 0}
          onClick={() => onCambiar([...idsElegidos, ...disponibles.map((d) => d.id)])}
        >
          {'>>'}
        </button>
        <button
          type="button"
          title="Quitar todos"
          disabled={elegidos.length === 0}
          onClick={() => onCambiar([])}
        >
          {'<<'}
        </button>
      </div>
      <div className="caja">
        <h4>{tituloElegidos}</h4>
        {elegidos.length === 0 && <div className="vacio-mini">Sin elementos</div>}
        {elegidos.map((e) => (
          <button
            key={e.id}
            type="button"
            className="item sel"
            title="Quitar"
            onClick={() => onCambiar(idsElegidos.filter((x) => x !== e.id))}
          >
            {e.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}
