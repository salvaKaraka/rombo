/**
 * Arbol del modelo — `editors/ArbolPage.java` y `parts/tree/*`.
 *
 * Lista entidades (con sus atributos e identificadores), relaciones y
 * jerarquias. Todo lo que se puede editar es clickeable: un clic selecciona,
 * doble clic abre el formulario, y las filas tienen su boton de eliminar.
 */

import type { Id, Modelo, RefSeleccion } from '../domain/types'
import { coberturaAbreviatura } from '../domain/types'
import {
  atributosDe,
  atributosDeEntidad,
  entidad,
  identificadoresDe,
  hijosDeCompuesto,
} from '../domain/queries'
import { porCreacion } from './canvas/layout'

interface Props {
  modelo: Modelo
  seleccion: RefSeleccion | null
  onSeleccionar: (ref: RefSeleccion) => void
  onEditar: (ref: RefSeleccion) => void
  /** null cuando el modelo es derivado y no se edita. */
  onBorrar: ((ref: RefSeleccion) => void) | null
}

export function ModelTree({ modelo, seleccion, onSeleccionar, onEditar, onBorrar }: Props) {
  const sel = (ref: RefSeleccion) =>
    seleccion?.tipo === ref.tipo && seleccion.id === ref.id ? ' sel' : ''

  /** Fila del arbol: selecciona, edita con doble clic y ofrece eliminar. */
  const fila = (
    ref: RefSeleccion,
    glifo: string,
    etiqueta: string,
    clase: string,
    anexo?: string,
  ) => (
    <div className={`nodo-fila${sel(ref)}`} key={`${ref.tipo}:${ref.id}`}>
      <button
        type="button"
        className={`nodo ${clase}${sel(ref)}`}
        onClick={() => onSeleccionar(ref)}
        onDoubleClick={() => onEditar(ref)}
        title={`${etiqueta} — doble clic para editar`}
      >
        <span className="glifo" aria-hidden>
          {glifo}
        </span>
        <span className="nodo-texto">{etiqueta}</span>
        {anexo && <span className="anexo">{anexo}</span>}
      </button>
      {onBorrar && (
        <button
          type="button"
          className="nodo-borrar"
          title={`Eliminar ${etiqueta}`}
          aria-label={`Eliminar ${etiqueta}`}
          onClick={() => onBorrar(ref)}
        >
          ✕
        </button>
      )}
    </div>
  )

  const cardinalidad = (cardMin: string, cardMax: string) =>
    cardMin === '0' || cardMax === 'n' ? `(${cardMin},${cardMax})` : undefined

  const glifoAtributo = (tipo: string) =>
    tipo === 'identificador' ? '●' : tipo === 'compuesto' ? '◍' : '○'

  /** Atributos de un portador, con sus hijos si alguno es compuesto. */
  const listaAtributos = (
    ref: { tipo: 'entidad' | 'relacion'; id: Id },
    nivel: 'hijo' | 'nieto' = 'hijo',
  ) =>
    atributosDe(modelo, ref).map((a) =>
      a.tipo === 'compuesto' ? (
        <div key={a.id}>
          {fila({ tipo: 'compuesto', id: a.id }, '◍', a.nombre, nivel, 'comp')}
          {hijosDeCompuesto(modelo, a.id).map((h) =>
            fila(
              { tipo: 'atributo', id: h.id },
              glifoAtributo(h.tipo),
              h.nombre,
              'nieto',
              cardinalidad(h.cardMin, h.cardMax),
            ),
          )}
        </div>
      ) : (
        fila(
          { tipo: 'atributo', id: a.id },
          glifoAtributo(a.tipo),
          a.nombre,
          nivel,
          cardinalidad(a.cardMin, a.cardMax),
        )
      ),
    )

  return (
    <aside className="arbol">
      <h2>Entidades ({modelo.entidades.length})</h2>
      {modelo.entidades.length === 0 && <div className="vacio">Todavía no hay entidades.</div>}
      {porCreacion(modelo.entidades).map((e) => {
        const ids = identificadoresDe(modelo, e.id)
        return (
          <div key={e.id}>
            {fila(
              { tipo: 'entidad', id: e.id },
              '▭',
              e.nombre,
              '',
              atributosDeEntidad(modelo, e.id).length > 0
                ? `${atributosDeEntidad(modelo, e.id).length} atr`
                : undefined,
            )}
            {listaAtributos({ tipo: 'entidad', id: e.id })}
            {ids
              .filter((i) => i.compuesto)
              .map((i) => (
                <div key={i.id} className="nodo-fila">
                  <button
                    type="button"
                    className="nodo hijo"
                    onClick={() => onSeleccionar({ tipo: 'entidad', id: e.id })}
                    onDoubleClick={() => onEditar({ tipo: 'entidad', id: e.id })}
                    title="Identificador compuesto — doble clic abre la entidad"
                  >
                    <span className="glifo" aria-hidden>
                      ⊙
                    </span>
                    <span className="nodo-texto">{i.nombre}</span>
                    <span className="anexo">
                      {i.entidadesExternasIds.length > 0 ? 'externo' : 'compuesto'}
                    </span>
                  </button>
                </div>
              ))}
          </div>
        )
      })}

      <h2>Relaciones ({modelo.relaciones.length})</h2>
      {modelo.relaciones.length === 0 && <div className="vacio">Todavía no hay relaciones.</div>}
      {porCreacion(modelo.relaciones).map((r) => (
        <div key={r.id}>
          {fila(
            { tipo: 'relacion', id: r.id },
            '◇',
            r.nombre,
            '',
            r.patas.length === 3 ? 'tern' : undefined,
          )}
          {r.patas.map((p, i) => (
            <div key={i} className="nodo nieto estatico">
              <span className="glifo" aria-hidden>
                ↳
              </span>
              <span className="nodo-texto">{entidad(modelo, p.entidadId)?.nombre ?? '?'}</span>
              <span className="anexo">
                ({p.cardMin},{p.cardMax})
              </span>
            </div>
          ))}
          {listaAtributos({ tipo: 'relacion', id: r.id })}
        </div>
      ))}

      {modelo.jerarquias.filter((j) => j.hijosIds.length > 0).length > 0 && (
        <>
          <h2>Jerarquías</h2>
          {modelo.jerarquias
            .filter((j) => j.hijosIds.length > 0)
            .map((j) => (
              <div key={j.id}>
                <div className="nodo estatico">
                  <span className="glifo" aria-hidden>
                    ⑃
                  </span>
                  <span className="nodo-texto">
                    {entidad(modelo, j.padreId)?.nombre ?? '?'}
                  </span>
                  <span className="anexo">{coberturaAbreviatura(j.cobertura)}</span>
                </div>
                {j.hijosIds.map((h) => (
                  <div key={h} className="nodo nieto estatico">
                    <span className="glifo" aria-hidden>
                      ↳
                    </span>
                    <span className="nodo-texto">{entidad(modelo, h)?.nombre ?? '?'}</span>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
    </aside>
  )
}
