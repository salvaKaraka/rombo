/**
 * Dialogos de decision del pasaje. Los textos son los del original
 * (`interfaz/AddOpcionesEliminarAtrCompuesto`, `AddopcionJerarquiaMHoDT`,
 * `AddopcionJerarquiaMHoDToMP`, `EleccionPasajeFisico`), que es lo que el alumno
 * lee para decidir.
 */

import { useState } from 'react'
import type {
  CardMax,
  CardMin,
  ItemProgreso,
  ModoFisico,
  OpcionCompuesto,
  OpcionJerarquia,
} from '../../domain/types'
import { Dialogo, ListaOpciones, type OpcionDef } from './Base'
import { MENSAJE_C_BLOQUEADA } from '../../domain/transform/compuestos'
import type { PasoTabla } from '../../domain/transform/tablas'

// ---------------------------------------------------------------------------
// Paso 1 — atributos compuestos
// ---------------------------------------------------------------------------

const TEXTO_COMPUESTO: Record<OpcionCompuesto, { titulo: string; texto: string }> = {
  A: {
    titulo: 'Opción A — Un atributo concatenado',
    texto:
      'Generar un único atributo que se convierta en la concatenación de todos los atributos ' +
      'simples que contiene el atributo compuesto.',
  },
  B: {
    titulo: 'Opción B — Atributos independientes',
    texto:
      'Definir los atributos simples sin un atributo compuesto que los resuma. La cantidad de ' +
      'atributos aumenta pero esta solución permite definir cada uno de los datos en forma ' +
      'independiente.',
  },
  C: {
    titulo: 'Opción C — Entidad nueva',
    texto:
      'Generar una nueva entidad, la que representa el atributo compuesto, conformada por cada ' +
      'uno de los atributos simples que contiene. Esta nueva entidad debe estar relacionada con ' +
      'la entidad a la cual pertenecía el atributo compuesto.',
  },
}

export function DialogoCompuesto({
  atributo,
  propietario,
  opciones,
  onAceptar,
  onCancelar,
}: {
  atributo: string
  propietario: string
  opciones: OpcionCompuesto[]
  onAceptar: (o: OpcionCompuesto) => void
  onCancelar: () => void
}) {
  const [elegida, setElegida] = useState<OpcionCompuesto>('A')
  const defs: OpcionDef<OpcionCompuesto>[] = (['A', 'B', 'C'] as OpcionCompuesto[]).map((v) => ({
    valor: v,
    ...TEXTO_COMPUESTO[v],
    bloqueada: opciones.includes(v) ? undefined : MENSAJE_C_BLOQUEADA,
  }))

  return (
    <Dialogo
      titulo={`Eliminación del atributo compuesto ${atributo.toUpperCase()}`}
      mensaje={
        <>
          Pertenece a <strong>{propietario.toUpperCase()}</strong>. Elija cuál de las siguientes
          opciones quiere utilizar:
        </>
      }
      onAceptar={() => onAceptar(elegida)}
      onCancelar={onCancelar}
    >
      <ListaOpciones
        nombre="opc-compuesto"
        opciones={defs}
        elegida={elegida}
        onElegir={setElegida}
      />
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// Paso 2 — atributos polivalentes
// ---------------------------------------------------------------------------

export function DialogoPolivalente({
  mensaje,
  onAceptar,
  onCancelar,
}: {
  mensaje: string
  onAceptar: (card: { cardMin: CardMin; cardMax: CardMax }) => void
  onCancelar: () => void
}) {
  const [cardMin, setCardMin] = useState<CardMin>('1')
  const [cardMax, setCardMax] = useState<CardMax>('n')

  return (
    <Dialogo
      titulo="Eliminación de atributo polivalente"
      mensaje={`${mensaje} Indique la cardinalidad del lado de la nueva entidad.`}
      onAceptar={() => onAceptar({ cardMin, cardMax })}
      onCancelar={onCancelar}
    >
      <div className="fila">
        <div className="campo">
          <label>Cardinalidad mínima</label>
          <div className="radios">
            {(['0', '1'] as CardMin[]).map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="poli-min"
                  checked={cardMin === v}
                  onChange={() => setCardMin(v)}
                />
                {v}
              </label>
            ))}
          </div>
        </div>
        <div className="campo">
          <label>Cardinalidad máxima</label>
          <div className="radios">
            {(['1', 'n'] as CardMax[]).map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="poli-max"
                  checked={cardMax === v}
                  onChange={() => setCardMax(v)}
                />
                {v}
              </label>
            ))}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--texto-3)' }}>
        Del lado de la entidad de origen la cardinalidad queda en (1,n).
      </p>
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// Paso 3 — jerarquias
// ---------------------------------------------------------------------------

const TEXTO_JERARQUIA: Record<OpcionJerarquia, { titulo: string; texto: string }> = {
  A: {
    titulo: 'Opción A — Eliminar las entidades hijas',
    texto:
      'Eliminar las entidades hijas, dejando solo la entidad padre, la cual incorpora todos los ' +
      'atributos de sus hijos. Cada uno de estos atributos deberá ser opcional (cardinalidad ' +
      'mínima cero).',
  },
  B: {
    titulo: 'Opción B — Conservar todas las entidades',
    texto:
      'Dejar todas las entidades de la jerarquía, convirtiéndola en relaciones uno a uno entre el ' +
      'padre y cada uno de los hijos. Esta solución permite que las entidades que conforman la ' +
      'jerarquía mantengan sus atributos originales, generando la relación explícita ES_UN entre ' +
      'padre e hijos.',
  },
  C: {
    titulo: 'Opción C — Eliminar la entidad padre',
    texto:
      'Eliminar la entidad padre, dejando solo las especializaciones. Con esta solución los ' +
      'atributos del padre deberán incluirse en cada uno de los hijos.',
  },
}

/** Explicacion de por que C no aplica con cobertura Parcial (texto del original). */
const C_NO_APLICA_PARCIAL =
  'No aplicable para cobertura Parcial: algunos elementos contenidos en el padre no están ' +
  'cubiertos por las especializaciones. Si se quita la entidad padre, dichos elementos no ' +
  'tendrán más cabida en el modelo. Esta conversión genera un modelo lógico que no es ' +
  'equivalente al Modelo Conceptual, ya que se pierde información.'

export function DialogoJerarquia({
  etiqueta,
  opciones,
  forzada,
  motivo,
  onAceptar,
  onCancelar,
}: {
  etiqueta: string
  opciones: OpcionJerarquia[]
  forzada: boolean
  motivo?: string
  onAceptar: (o: OpcionJerarquia) => void
  onCancelar: () => void
}) {
  const [elegida, setElegida] = useState<OpcionJerarquia>(opciones[0])

  const defs: OpcionDef<OpcionJerarquia>[] = (['A', 'B', 'C'] as OpcionJerarquia[]).map((v) => ({
    valor: v,
    ...TEXTO_JERARQUIA[v],
    bloqueada: opciones.includes(v)
      ? undefined
      : v === 'C'
        ? C_NO_APLICA_PARCIAL
        : motivo ??
          'No disponible para esta jerarquía.',
  }))

  return (
    <Dialogo
      ancho
      titulo={`Eliminación de la jerarquía ${etiqueta.toUpperCase()}`}
      mensaje={
        forzada && motivo
          ? motivo
          : 'Elija cuál de las siguientes opciones quiere utilizar para la eliminación de la jerarquía.'
      }
      onAceptar={() => onAceptar(elegida)}
      onCancelar={onCancelar}
    >
      <ListaOpciones
        nombre="opc-jerarquia"
        opciones={defs}
        elegida={elegida}
        onElegir={setElegida}
      />
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// Pasaje a fisico — eleccion de modo
// ---------------------------------------------------------------------------

export function DialogoEleccionFisico({
  onAceptar,
  onCancelar,
}: {
  onAceptar: (m: ModoFisico) => void
  onCancelar: () => void
}) {
  const [elegida, setElegida] = useState<ModoFisico>('A')

  const defs: OpcionDef<ModoFisico>[] = [
    {
      valor: 'A',
      titulo: 'Opción A — Generación automática (convención ideal)',
      texto:
        'Se transforman todas las relaciones de una sola vez, aplicando a cada una la regla que ' +
        'le corresponde según sus cardinalidades.',
    },
    {
      valor: 'B',
      titulo: 'Opción B — Generación paso a paso',
      texto:
        'Se recorre relación por relación, explicando en cada caso qué transformación se aplica y ' +
        'por qué, antes de mostrar las tablas resultantes.',
    },
  ]

  return (
    <Dialogo
      titulo="Elección de pasaje a Físico"
      mensaje="Elija cuál de las siguientes opciones quiere utilizar para el pasaje al modelo físico."
      onAceptar={() => onAceptar(elegida)}
      onCancelar={onCancelar}
    >
      <ListaOpciones nombre="opc-fisico" opciones={defs} elegida={elegida} onElegir={setElegida} />
    </Dialogo>
  )
}

/** Recorrido narrado del pasaje a tablas (opcion B). */
export function DialogoPasoAPaso({
  pasos,
  onCerrar,
}: {
  pasos: PasoTabla[]
  onCerrar: () => void
}) {
  const [i, setI] = useState(0)
  const paso = pasos[i]
  const ultimo = i === pasos.length - 1

  if (!paso) return null

  return (
    <Dialogo
      ancho
      titulo={`Pasaje físico paso a paso — ${i + 1} de ${pasos.length}`}
      mensaje={paso.titulo}
      aceptar={ultimo ? 'Finalizar' : 'Siguiente'}
      onAceptar={() => (ultimo ? onCerrar() : setI(i + 1))}
      onCancelar={onCerrar}
      cancelar="Cerrar"
    >
      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>{paso.descripcion}</p>
      {paso.tablas.length > 0 && (
        <p
          style={{
            margin: '0.9rem 0 0',
            fontSize: '0.76rem',
            color: 'var(--texto-3)',
            fontFamily: 'var(--mono)',
          }}
        >
          Tablas definidas hasta acá: {paso.tablas.map((t) => t.nombre).join(', ')}
        </p>
      )}
    </Dialogo>
  )
}

// ---------------------------------------------------------------------------
// Ventana Progreso — `actions/ContadorLogico.java`
// ---------------------------------------------------------------------------

const GRUPOS: { clase: ItemProgreso['clase']; titulo: string }[] = [
  { clase: 'compuesto', titulo: 'Atributos compuestos' },
  { clase: 'polivalente', titulo: 'Atributos polivalentes' },
  { clase: 'jerarquia', titulo: 'Jerarquías' },
]

export function DialogoProgreso({
  items,
  onCerrar,
}: {
  items: ItemProgreso[]
  onCerrar: () => void
}) {
  return (
    <Dialogo
      titulo="Progreso del pasaje a Modelo Lógico"
      mensaje="Los elementos con tick verde ya fueron eliminados del modelo; los que tienen cruz roja siguen pendientes."
      onAceptar={onCerrar}
      aceptar="Cerrar"
    >
      {items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--texto-3)', fontSize: '0.84rem' }}>
          El pasaje a Modelo Lógico todavía no comenzó, o el modelo no tenía atributos
          compuestos, polivalentes ni jerarquías que eliminar.
        </p>
      ) : (
        <div className="progreso-lista">
          {GRUPOS.map((g) => {
            const propios = items.filter((i) => i.clase === g.clase)
            if (propios.length === 0) return null
            const hechos = propios.filter((p) => p.eliminado).length
            return (
              <div key={g.clase} className="progreso-grupo">
                <h4>
                  {g.titulo}
                  <span className="cuenta">
                    {hechos}/{propios.length}
                  </span>
                </h4>
                {propios.map((p, i) => (
                  <div
                    key={`${p.etiqueta}-${i}`}
                    className={`progreso-item ${p.eliminado ? 'hecho' : 'pendiente'}`}
                  >
                    <span className="marca">{p.eliminado ? '✓' : '✕'}</span>
                    {p.etiqueta}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Dialogo>
  )
}
