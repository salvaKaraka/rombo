/**
 * Diagrama en SVG. Dibuja el layout calculado en `layout.ts` y maneja el
 * arrastre de nodos, la seleccion y el doble clic para editar.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { Id, Modelo, Punto, RefPropietario, RefSeleccion } from '../../domain/types'
import { calcularLayout, type FigNodo } from './layout'

interface Props {
  modelo: Modelo
  seleccion: RefSeleccion | null
  zoom: number
  /** null = solo lectura (modelo logico o fisico ya derivado). */
  onMover: ((ref: RefPropietario, pos: Punto) => void) | null
  onSeleccionar: (ref: RefSeleccion | null) => void
  onEditar?: (ref: RefSeleccion) => void
  onMenu?: (ref: RefSeleccion, en: { x: number; y: number }) => void
  /** Se expone el <svg> para poder exportarlo. */
  svgRef?: React.Ref<SVGSVGElement>
  vacio?: { titulo: string; texto: string }
}

export function DiagramCanvas({
  modelo,
  seleccion,
  zoom,
  onMover,
  onSeleccionar,
  onEditar,
  onMenu,
  svgRef,
  vacio,
}: Props) {
  const layout = useMemo(() => calcularLayout(modelo), [modelo])
  const contenedor = useRef<HTMLDivElement>(null)

  // Arrastre: se guarda el offset entre el puntero y el centro del nodo, mas la
  // posicion provisoria para que el nodo siga al puntero sin re-render del modelo.
  const [arrastre, setArrastre] = useState<{
    ref: RefPropietario
    offset: Punto
    pos: Punto
  } | null>(null)

  const aCoordenadas = useCallback(
    (e: { clientX: number; clientY: number }): Punto => {
      const caja = contenedor.current?.getBoundingClientRect()
      const scroll = contenedor.current
      if (!caja || !scroll) return { x: 0, y: 0 }
      return {
        x: (e.clientX - caja.left + scroll.scrollLeft) / zoom + layout.caja.x,
        y: (e.clientY - caja.top + scroll.scrollTop) / zoom + layout.caja.y,
      }
    },
    [zoom, layout.caja.x, layout.caja.y],
  )

  const empezarArrastre = useCallback(
    (e: React.PointerEvent, nodo: FigNodo) => {
      if (e.button !== 0) return
      onSeleccionar(nodo.ref)
      if (!onMover) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = aCoordenadas(e)
      setArrastre({
        ref: nodo.ref,
        offset: { x: p.x - nodo.centro.x, y: p.y - nodo.centro.y },
        pos: nodo.centro,
      })
    },
    [onMover, onSeleccionar, aCoordenadas],
  )

  const moverArrastre = useCallback(
    (e: React.PointerEvent) => {
      if (!arrastre) return
      const p = aCoordenadas(e)
      setArrastre({
        ...arrastre,
        pos: {
          x: Math.round(p.x - arrastre.offset.x),
          y: Math.round(p.y - arrastre.offset.y),
        },
      })
    },
    [arrastre, aCoordenadas],
  )

  const terminarArrastre = useCallback(() => {
    if (arrastre && onMover) onMover(arrastre.ref, arrastre.pos)
    setArrastre(null)
  }, [arrastre, onMover])

  const esArrastrado = (ref: RefPropietario) =>
    arrastre?.ref.tipo === ref.tipo && arrastre.ref.id === ref.id

  const centroDe = (nodo: FigNodo) => (esArrastrado(nodo.ref) ? arrastre!.pos : nodo.centro)

  const estaSeleccionado = (ref: RefSeleccion) =>
    seleccion?.tipo === ref.tipo && seleccion.id === ref.id

  /**
   * Handlers de un atributo dibujado: seleccionar con un clic, editar con doble.
   * `stopPropagation` evita que el clic llegue al SVG y limpie la selección.
   */
  const handlersAtributo = (id: Id, tipo: 'atributo' | 'compuesto' = 'atributo') => ({
    className: `fig-atributo${estaSeleccionado({ tipo, id }) ? ' sel' : ''}`,
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation()
      onSeleccionar({ tipo, id })
    },
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      onEditar?.({ tipo, id })
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (!onMenu) return
      e.preventDefault()
      e.stopPropagation()
      onSeleccionar({ tipo, id })
      onMenu({ tipo, id }, { x: e.clientX, y: e.clientY })
    },
  })

  const sinContenido = modelo.entidades.length === 0 && modelo.relaciones.length === 0

  return (
    <div className="lienzo-wrap" ref={contenedor}>
      <svg
        ref={svgRef}
        width={layout.caja.ancho * zoom}
        height={layout.caja.alto * zoom}
        viewBox={`${layout.caja.x} ${layout.caja.y} ${layout.caja.ancho} ${layout.caja.alto}`}
        onPointerMove={moverArrastre}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSeleccionar(null)
        }}
      >
        {/* jerarquias, al fondo */}
        {layout.jerarquias.map((j) => (
          <g key={j.id}>
            <line
              className="fig-linea"
              x1={j.vertPadre[0].x}
              y1={j.vertPadre[0].y}
              x2={j.vertPadre[1].x}
              y2={j.vertPadre[1].y}
            />
            <line
              className="fig-linea"
              x1={j.bus[0].x}
              y1={j.bus[0].y}
              x2={j.bus[1].x}
              y2={j.bus[1].y}
              strokeWidth={2}
            />
            {j.vertHijos.map((v, i) => (
              <line
                key={i}
                className="fig-linea"
                x1={v[0].x}
                y1={v[0].y}
                x2={v[1].x}
                y2={v[1].y}
              />
            ))}
            <text className="fig-cobertura" x={j.etiquetaPos.x} y={j.etiquetaPos.y}>
              {j.etiqueta}
            </text>
          </g>
        ))}

        {/* conectores de relaciones */}
        {layout.conectores.map((c, i) => (
          <g key={`${c.relacionId}-${c.entidadId}-${i}`}>
            <line
              className="fig-linea"
              x1={c.desde.x}
              y1={c.desde.y}
              x2={c.hasta.x}
              y2={c.hasta.y}
            />
            {c.idExterno && (
              <circle
                className="fig-punto-lleno"
                cx={c.puntoExterno.x}
                cy={c.puntoExterno.y}
                r={4.2}
              />
            )}
            <text
              className="fig-card"
              x={c.cardPos.x}
              y={c.cardPos.y}
              textAnchor={c.cardAnclaje}
            >
              {c.cardinalidad}
            </text>
          </g>
        ))}

        {/* atributos simples */}
        {layout.atributos.map((a) => (
          <g key={a.atributoId} {...handlersAtributo(a.atributoId)}>
            {/* Zona de click generosa: el círculo solo es muy chico para acertarle. */}
            <line
              className="fig-golpe"
              x1={a.desde.x}
              y1={a.desde.y}
              x2={a.hasta.x}
              y2={a.hasta.y}
            />
            <line
              className="fig-linea"
              x1={a.desde.x}
              y1={a.desde.y}
              x2={a.hasta.x}
              y2={a.hasta.y}
            />
            <circle
              className={a.identificador ? 'fig-punto-lleno' : 'fig-punto-vacio'}
              cx={a.hasta.x}
              cy={a.hasta.y}
              r={4.2}
            />
            <text className="fig-attr" x={a.texto.x} y={a.texto.y} textAnchor={a.anclaje}>
              {a.nombre}
              {a.cardinalidad && <tspan className="fig-card"> {a.cardinalidad}</tspan>}
            </text>
          </g>
        ))}

        {/* arcos de identificador compuesto */}
        {layout.arcos.map((arco, i) => (
          <g key={i}>
            <path className="fig-arco-id" d={arco.path} />
            <circle className="fig-punto-lleno" cx={arco.punto.x} cy={arco.punto.y} r={4.6} />
          </g>
        ))}

        {/* atributos compuestos */}
        {layout.compuestos.map((c) => (
          <g key={c.atributoId}>
            {c.hijos.map((h) => (
              <g key={h.atributoId} {...handlersAtributo(h.atributoId)}>
                <line
                  className="fig-golpe"
                  x1={h.desde.x}
                  y1={h.desde.y}
                  x2={h.hasta.x}
                  y2={h.hasta.y}
                />
                <line
                  className="fig-linea"
                  x1={h.desde.x}
                  y1={h.desde.y}
                  x2={h.hasta.x}
                  y2={h.hasta.y}
                />
                <circle
                  className={h.identificador ? 'fig-punto-lleno' : 'fig-punto-vacio'}
                  cx={h.hasta.x}
                  cy={h.hasta.y}
                  r={3.6}
                />
                <text
                  className="fig-attr"
                  x={h.texto.x}
                  y={h.texto.y}
                  textAnchor={h.anclaje}
                  fontSize={10}
                >
                  {h.nombre}
                  {h.cardinalidad && <tspan className="fig-card"> {h.cardinalidad}</tspan>}
                </text>
              </g>
            ))}

            {/* La elipse va después de los hijos para quedar por encima. */}
            <g {...handlersAtributo(c.atributoId, 'compuesto')}>
              <line
                className="fig-golpe"
                x1={c.desde.x}
                y1={c.desde.y}
                x2={c.centro.x}
                y2={c.centro.y}
              />
              <line
                className="fig-linea"
                x1={c.desde.x}
                y1={c.desde.y}
                x2={c.centro.x}
                y2={c.centro.y}
              />
              <ellipse
                className="fig-caja"
                cx={c.centro.x}
                cy={c.centro.y}
                rx={c.rx}
                ry={c.ry}
              />
              <text
                className="fig-attr"
                x={c.centro.x}
                y={c.centro.y + 3.5}
                textAnchor="middle"
                fontWeight={600}
              >
                {c.nombre}
              </text>
            </g>
          </g>
        ))}

        {/* nodos: entidades y relaciones, al frente */}
        {layout.nodos.map((n) => {
          const centro = centroDe(n)
          const sel = estaSeleccionado(n.ref)
          const clases = [
            'fig-nodo',
            sel ? 'sel' : '',
            esArrastrado(n.ref) ? 'arrastrando' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <g
              key={`${n.ref.tipo}:${n.ref.id}`}
              className={clases}
              onPointerDown={(e) => empezarArrastre(e, n)}
              onDoubleClick={() => onEditar?.(n.ref)}
              onContextMenu={(e) => {
                if (!onMenu) return
                e.preventDefault()
                onSeleccionar(n.ref)
                onMenu(n.ref, { x: e.clientX, y: e.clientY })
              }}
            >
              {n.tipo === 'entidad' ? (
                <rect
                  className="fig-caja"
                  x={centro.x - n.ancho / 2}
                  y={centro.y - n.alto / 2}
                  width={n.ancho}
                  height={n.alto}
                  rx={3}
                />
              ) : (
                <polygon
                  className="fig-caja"
                  points={[
                    `${centro.x},${centro.y - n.alto / 2}`,
                    `${centro.x + n.ancho / 2},${centro.y}`,
                    `${centro.x},${centro.y + n.alto / 2}`,
                    `${centro.x - n.ancho / 2},${centro.y}`,
                  ].join(' ')}
                />
              )}
              <text
                className="fig-nombre"
                x={centro.x}
                y={centro.y + 4.5}
                textAnchor="middle"
              >
                {n.nombre}
              </text>
            </g>
          )
        })}
      </svg>

      {sinContenido && vacio && (
        <div className="lienzo-vacio">
          <h3>{vacio.titulo}</h3>
          <p>{vacio.texto}</p>
        </div>
      )}

      {!sinContenido && <div className="zoom-chip">{Math.round(zoom * 100)}%</div>}
    </div>
  )
}
