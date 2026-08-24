/**
 * Editor de la especificacion del problema.
 *
 * Es el punto de entrada del flujo de CasER: se selecciona una palabra del
 * texto, clic derecho, y se crea el objeto con ese nombre ya cargado
 * (`editors/TextEditor.java` + `menus/AppContextMenuProvider`).
 *
 * Tras "Finalizar" el texto queda de solo lectura, pero los objetos y el arbol
 * se siguen pudiendo editar.
 */

import { useCallback, useRef, useState } from 'react'

export type TipoObjeto = 'entidad' | 'relacion' | 'atributo'

interface Props {
  texto: string
  bloqueado: boolean
  onCambiar: (texto: string) => void
  onCrear: (tipo: TipoObjeto, nombre: string) => void
}

export function SpecEditor({ texto, bloqueado, onCambiar, onCrear }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; seleccion: string } | null>(null)

  /**
   * Toma la seleccion; si no hay, expande la palabra que esta bajo el cursor —
   * asi el clic derecho sobre una palabra alcanza, sin obligar a arrastrar.
   */
  const seleccionActual = useCallback((): string => {
    const el = area.current
    if (!el) return ''
    const { selectionStart: ini, selectionEnd: fin, value } = el
    if (fin > ini) return value.slice(ini, fin).trim()

    const esPalabra = (c: string) => /[\p{L}\p{N}_]/u.test(c)
    let a = ini
    let b = ini
    while (a > 0 && esPalabra(value[a - 1])) a--
    while (b < value.length && esPalabra(value[b])) b++
    return value.slice(a, b).trim()
  }, [])

  const abrirMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const seleccion = seleccionActual()
      setMenu({ x: e.clientX, y: e.clientY, seleccion })
    },
    [seleccionActual],
  )

  const crear = (tipo: TipoObjeto) => {
    if (!menu) return
    onCrear(tipo, normalizar(menu.seleccion))
    setMenu(null)
  }

  return (
    <div className="spec">
      {bloqueado && (
        <div className="spec-aviso">
          <span aria-hidden>🔒</span>
          El Modelo Conceptual fue finalizado: la especificación quedó de solo lectura. Los
          objetos del modelo y el árbol se siguen pudiendo editar.
        </div>
      )}

      <textarea
        ref={area}
        value={texto}
        readOnly={bloqueado}
        spellCheck={false}
        onChange={(e) => onCambiar(e.target.value)}
        onContextMenu={abrirMenu}
        placeholder={
          'Escribí acá la especificación del problema, o usá Importar para cargarla desde un archivo de texto.\n\n' +
          'Después seleccioná una palabra, clic derecho, y elegí si es una Entidad, una Relación o un Atributo.'
        }
      />

      <div className="spec-pie">
        Seleccioná una palabra y hacé <kbd>clic derecho</kbd> para agregarla al diagrama como
        entidad, relación o atributo.
      </div>

      {menu && (
        <>
          {/* Capa para cerrar el menu al hacer clic afuera. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 55 }}
            onMouseDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="menu-ctx"
            style={{
              left: Math.min(menu.x, window.innerWidth - 224),
              top: Math.min(menu.y, window.innerHeight - 176),
            }}
          >
            <div className="menu-ctx-titulo">
              {menu.seleccion ? `“${menu.seleccion}”` : 'Sin selección'}
            </div>
            <button type="button" onClick={() => crear('entidad')}>
              <span className="glifo">▭</span> Agregar como Entidad
            </button>
            <button type="button" onClick={() => crear('relacion')}>
              <span className="glifo">◇</span> Agregar como Relación
            </button>
            <button type="button" onClick={() => crear('atributo')}>
              <span className="glifo">○</span> Agregar como Atributo
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Los nombres del modelo van en minuscula y con guiones bajos, como en el original. */
function normalizar(palabra: string): string {
  return palabra
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
}
