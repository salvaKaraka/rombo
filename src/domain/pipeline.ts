/**
 * Maquina de estados del pasaje — `actions/ControladorProcesoLogico.java` mas
 * los tres `ControladorProceso*` y `PasarAFisico`.
 *
 * El original mezcla control de flujo con dialogos SWT. Aca la separacion es
 * explicita: `proximaAccion` dice que hay que preguntar, la UI pregunta, y
 * `aplicarDecision` avanza el modelo. Todo el estado del pasaje vive en
 * `EstadoPipeline`, asi que "Deshacer paso" es restaurar el trio
 * (modelo, pipeline, bitacora) anterior.
 */

import type {
  Atributo,
  CardMax,
  CardMin,
  EstadoPipeline,
  ItemProgreso,
  Jerarquia,
  Modelo,
  OpcionCompuesto,
  OpcionJerarquia,
  PasoLogico,
} from './types'
import type { Bitacora } from './log'
import { registrar } from './log'
import {
  atributosDe,
  nombreDe,
  portadores,
  primerCompuesto,
  primeraJerarquia,
  primerPolivalente,
  opcionesJerarquia,
  etiquetaJerarquia,
} from './queries'
import { esPolivalente } from './types'
import { eliminarCompuesto, opcionesCompuesto } from './transform/compuestos'
import { eliminarPolivalente, mensajePolivalente } from './transform/polivalentes'
import { eliminarJerarquia } from './transform/jerarquias'

// ---------------------------------------------------------------------------
// Mensajes literales del original
// ---------------------------------------------------------------------------

export const MENSAJES = {
  faltaFinalizar:
    'Para pasar el modelo a Lógico, antes debe finalizar el Modelo Conceptual.',
  logicoYaComenzo:
    "El pasaje al Modelo Lógico ya comenzó. Presione 'Siguiente paso' para continuar.",
  logicoYaHecho: 'El modelo ya ha sido pasado al Modelo Lógico.',
  faltaLogico: 'Para pasar el modelo a Físico, antes debe pasar al modelo Lógico.',
  faltaFinLogico: 'Para realizar el proceso físico, debe finalizar el proceso lógico.',
  fisicoYaHecho: 'El modelo ya ha sido pasado al Modelo Físico.',
  debeComenzar:
    'Primero debe presionar el botón correspondiente al pasaje lógico para comenzar el proceso.',
  logicoFinalizado: 'El pasaje a Modelo Lógico ha finalizado.',
  finLogico: 'Finalizó el pasaje al Modelo Lógico.',
  paso1: 'Paso 1: Eliminación de Atributos Compuestos.',
  paso2: 'Paso 2: Eliminación de Atributos Polivalentes.',
  paso3: 'Paso 3: Eliminación de Jerarquías.',
  sinCompuestos: 'No hay atributos compuestos para eliminar.',
  sinPolivalentes: 'No hay atributos polivalentes para eliminar.',
  sinJerarquias: 'No hay jerarquías para eliminar.',
  confirmarDeshacer: '¿Desea deshacer la operación realizada?',
} as const

const ANUNCIO: Record<Exclude<PasoLogico, 'fin'>, string> = {
  compuestos: MENSAJES.paso1,
  polivalentes: MENSAJES.paso2,
  jerarquias: MENSAJES.paso3,
}

// ---------------------------------------------------------------------------
// Lo que el pipeline le pide a la UI
// ---------------------------------------------------------------------------

export type Peticion =
  | { tipo: 'compuesto'; atributo: Atributo; opciones: OpcionCompuesto[]; propietario: string }
  | { tipo: 'polivalente'; atributo: Atributo; mensaje: string }
  | {
      tipo: 'jerarquia'
      jerarquia: Jerarquia
      etiqueta: string
      opciones: OpcionJerarquia[]
      forzada: boolean
      motivo?: string
    }
  /** No queda nada por eliminar en este paso: se informa y se avanza. */
  | { tipo: 'sinItems'; paso: Exclude<PasoLogico, 'fin'>; mensaje: string }
  | { tipo: 'fin'; mensaje: string }

export interface Accion {
  /** Mensaje "Paso N: ..." a mostrar antes de la peticion, la primera vez. */
  anuncio?: string
  peticion: Peticion
}

/** Decision que devuelve la UI. */
export type Decision =
  | { tipo: 'compuesto'; opcion: OpcionCompuesto }
  | { tipo: 'polivalente'; cardMin: CardMin; cardMax: CardMax }
  | { tipo: 'jerarquia'; opcion: OpcionJerarquia }
  | { tipo: 'sinItems' }
  | { tipo: 'fin' }

// ---------------------------------------------------------------------------
// Arranque del pasaje logico
// ---------------------------------------------------------------------------

/**
 * Snapshot de lo que hay que eliminar, para la ventana Progreso
 * (`actions/ContadorLogico.recuperoCompuestosPoliyJerarquias`).
 *
 * Igual que el original, solo mira los atributos de primer nivel de cada
 * portador: un polivalente que este adentro de un compuesto todavia no es
 * visible aca y aparecera cuando el paso 1 lo destape.
 */
export function snapshotProgreso(modelo: Modelo): ItemProgreso[] {
  const items: ItemProgreso[] = []

  for (const ref of portadores(modelo)) {
    for (const a of atributosDe(modelo, ref)) {
      if (a.tipo === 'compuesto') {
        items.push({
          clase: 'compuesto',
          etiqueta: `${a.nombre} (${nombreDe(modelo, ref)})`,
          eliminado: false,
        })
      }
    }
  }
  for (const ref of portadores(modelo)) {
    for (const a of atributosDe(modelo, ref)) {
      if (a.tipo !== 'compuesto' && esPolivalente(a.cardMax)) {
        items.push({
          clase: 'polivalente',
          etiqueta: `${a.nombre} (${nombreDe(modelo, ref)})`,
          eliminado: false,
        })
      }
    }
  }
  for (const j of modelo.jerarquias) {
    if (j.hijosIds.length > 0) {
      items.push({
        clase: 'jerarquia',
        etiqueta: etiquetaJerarquia(modelo, j),
        eliminado: false,
      })
    }
  }
  return items
}

/** Marca un item del progreso como eliminado. Si no estaba, lo agrega ya hecho. */
function marcarProgreso(
  progreso: ItemProgreso[],
  clase: ItemProgreso['clase'],
  etiqueta: string,
): ItemProgreso[] {
  const i = progreso.findIndex(
    (p) => p.clase === clase && p.etiqueta === etiqueta && !p.eliminado,
  )
  if (i === -1) return [...progreso, { clase, etiqueta, eliminado: true }]
  const copia = [...progreso]
  copia[i] = { ...copia[i], eliminado: true }
  return copia
}

/** ¿Se puede comenzar el pasaje a logico? */
export function puedeComenzarLogico(modelo: Modelo): { ok: boolean; mensaje?: string } {
  if (modelo.estado === 'MLAN') return { ok: false, mensaje: MENSAJES.logicoYaComenzo }
  if (modelo.estado === 'MFAN') return { ok: false, mensaje: MENSAJES.logicoYaHecho }
  if (modelo.estado !== 'MCdef') return { ok: false, mensaje: MENSAJES.faltaFinalizar }
  return { ok: true }
}

/** Marca el modelo como MLAN y arma el snapshot de progreso. */
export function comenzarLogico(
  modelo: Modelo,
  pipeline: EstadoPipeline,
): { modelo: Modelo; pipeline: EstadoPipeline } {
  return {
    modelo: { ...modelo, estado: 'MLAN' },
    pipeline: {
      ...pipeline,
      iniciado: true,
      paso: 'compuestos',
      anunciados: [],
      progreso: snapshotProgreso(modelo),
      finLogico: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Que hacer en el proximo "Siguiente paso"
// ---------------------------------------------------------------------------

export function proximaAccion(modelo: Modelo, pipeline: EstadoPipeline): Accion {
  const anunciar = (paso: Exclude<PasoLogico, 'fin'>) =>
    pipeline.anunciados.includes(paso) ? undefined : ANUNCIO[paso]

  if (pipeline.paso === 'compuestos') {
    const a = primerCompuesto(modelo)
    if (a) {
      return {
        anuncio: anunciar('compuestos'),
        peticion: {
          tipo: 'compuesto',
          atributo: a,
          opciones: opcionesCompuesto(modelo, a),
          propietario: nombreDe(modelo, a.propietario),
        },
      }
    }
    return {
      anuncio: anunciar('compuestos'),
      peticion: {
        tipo: 'sinItems',
        paso: 'compuestos',
        mensaje: MENSAJES.sinCompuestos,
      },
    }
  }

  if (pipeline.paso === 'polivalentes') {
    const a = primerPolivalente(modelo)
    if (a) {
      return {
        anuncio: anunciar('polivalentes'),
        peticion: {
          tipo: 'polivalente',
          atributo: a,
          mensaje: mensajePolivalente(modelo, a),
        },
      }
    }
    return {
      anuncio: anunciar('polivalentes'),
      peticion: {
        tipo: 'sinItems',
        paso: 'polivalentes',
        mensaje: MENSAJES.sinPolivalentes,
      },
    }
  }

  if (pipeline.paso === 'jerarquias') {
    const j = primeraJerarquia(modelo)
    if (j) {
      const { opciones, forzada, motivo } = opcionesJerarquia(modelo, j)
      return {
        anuncio: anunciar('jerarquias'),
        peticion: {
          tipo: 'jerarquia',
          jerarquia: j,
          etiqueta: etiquetaJerarquia(modelo, j),
          opciones,
          forzada,
          motivo,
        },
      }
    }
    return {
      anuncio: anunciar('jerarquias'),
      peticion: {
        tipo: 'sinItems',
        paso: 'jerarquias',
        mensaje: MENSAJES.sinJerarquias,
      },
    }
  }

  return { peticion: { tipo: 'fin', mensaje: MENSAJES.finLogico } }
}

// ---------------------------------------------------------------------------
// Aplicar la decision
// ---------------------------------------------------------------------------

export interface EstadoCompleto {
  modelo: Modelo
  pipeline: EstadoPipeline
  bitacora: Bitacora
}

const SIGUIENTE: Record<Exclude<PasoLogico, 'fin'>, PasoLogico> = {
  compuestos: 'polivalentes',
  polivalentes: 'jerarquias',
  jerarquias: 'fin',
}

export function aplicarDecision(
  estado: EstadoCompleto,
  peticion: Peticion,
  decision: Decision,
): EstadoCompleto {
  const { modelo, pipeline, bitacora } = estado

  // El anuncio del paso se considera visto en cuanto se responde algo de ese paso.
  const anunciados = (paso: Exclude<PasoLogico, 'fin'>) =>
    pipeline.anunciados.includes(paso) ? pipeline.anunciados : [...pipeline.anunciados, paso]

  if (peticion.tipo === 'compuesto' && decision.tipo === 'compuesto') {
    const etiqueta = `${peticion.atributo.nombre} (${peticion.propietario})`
    const r = eliminarCompuesto(modelo, bitacora, peticion.atributo, decision.opcion)
    // Si se eligió C estando bloqueada, el modelo no cambia y el item sigue pendiente.
    const cambio = r.modelo !== modelo
    return {
      modelo: r.modelo,
      bitacora: r.bitacora,
      pipeline: {
        ...pipeline,
        anunciados: anunciados('compuestos'),
        progreso: cambio
          ? marcarProgreso(pipeline.progreso, 'compuesto', etiqueta)
          : pipeline.progreso,
      },
    }
  }

  if (peticion.tipo === 'polivalente' && decision.tipo === 'polivalente') {
    const etiqueta = `${peticion.atributo.nombre} (${nombreDe(
      modelo,
      peticion.atributo.propietario,
    )})`
    const r = eliminarPolivalente(modelo, bitacora, peticion.atributo, {
      min: decision.cardMin,
      max: decision.cardMax,
    })
    return {
      modelo: r.modelo,
      bitacora: r.bitacora,
      pipeline: {
        ...pipeline,
        anunciados: anunciados('polivalentes'),
        progreso: marcarProgreso(pipeline.progreso, 'polivalente', etiqueta),
      },
    }
  }

  if (peticion.tipo === 'jerarquia' && decision.tipo === 'jerarquia') {
    const r = eliminarJerarquia(modelo, bitacora, peticion.jerarquia, decision.opcion)
    return {
      modelo: r.modelo,
      bitacora: r.bitacora,
      pipeline: {
        ...pipeline,
        anunciados: anunciados('jerarquias'),
        progreso: marcarProgreso(pipeline.progreso, 'jerarquia', peticion.etiqueta),
      },
    }
  }

  if (peticion.tipo === 'sinItems') {
    const paso = peticion.paso
    const proximo = SIGUIENTE[paso]
    const sub =
      paso === 'compuestos' ? 'compuestos' : paso === 'polivalentes' ? 'polivalentes' : 'jerarquias'
    let log = registrar(bitacora, sub, textoSinItems(paso))
    let finLogico = pipeline.finLogico
    if (proximo === 'fin') {
      finLogico = true
      log = registrar(log, 'jerarquias', MENSAJES.finLogico, true)
    }
    return {
      modelo,
      bitacora: log,
      pipeline: {
        ...pipeline,
        paso: proximo,
        anunciados: anunciados(paso),
        finLogico,
      },
    }
  }

  if (peticion.tipo === 'fin') {
    return {
      modelo,
      bitacora,
      pipeline: { ...pipeline, paso: 'fin', finLogico: true },
    }
  }

  return estado
}

function textoSinItems(paso: Exclude<PasoLogico, 'fin'>): string {
  switch (paso) {
    case 'compuestos':
      return 'No se encontraron atributos compuestos para eliminar.'
    case 'polivalentes':
      return 'No se encontraron atributos polivalentes para eliminar.'
    case 'jerarquias':
      return 'No se encontraron jerarquías para eliminar.'
  }
}

/** ¿Se puede comenzar el pasaje a fisico? */
export function puedeComenzarFisico(
  modelo: Modelo,
  pipeline: EstadoPipeline,
): { ok: boolean; mensaje?: string } {
  if (modelo.estado === 'MFAN') return { ok: false, mensaje: MENSAJES.fisicoYaHecho }
  if (modelo.estado !== 'MLAN') return { ok: false, mensaje: MENSAJES.faltaLogico }
  if (!pipeline.finLogico) return { ok: false, mensaje: MENSAJES.faltaFinLogico }
  return { ok: true }
}
