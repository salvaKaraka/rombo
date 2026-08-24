/**
 * Paso 1 del pasaje a logico: eliminacion de atributos compuestos.
 *
 * Espeja `ConectorAtributo.convertirAtributoCompuestoOp1/2/3` y las variantes
 * `...DeRelacion`. Las tres opciones son las del wizard
 * `AddOpcionesEliminarAtrCompuesto`.
 */

import type { Atributo, Modelo, OpcionCompuesto } from '../types'
import type { Bitacora } from '../log'
import { registrar } from '../log'
import {
  agregarAtributo,
  agregarEntidad,
  agregarIdentificador,
  agregarRelacion,
  copiarAtributo,
  editar,
  quitarAtributo,
} from '../edits'
import { hijosDeCompuesto, nombreDe, tamanoRelacionPropietaria } from '../queries'

export interface ResultadoPaso {
  modelo: Modelo
  bitacora: Bitacora
}

/**
 * La opcion C crea una entidad nueva y la relaciona con el propietario. Si el
 * propietario ya es una relacion ternaria, eso daria una 4-naria, que CasER no
 * contempla — `ConectorAtributo.calculoTamrelacion()`.
 */
export function opcionCBloqueada(modelo: Modelo, a: Atributo): boolean {
  return tamanoRelacionPropietaria(modelo, a) === 3
}

export const MENSAJE_C_BLOQUEADA =
  'CasER no contempla relaciones 4-narias, por lo tanto la opción C no se puede elegir ' +
  'porque implica crear una entidad nueva con los atributos del atributo compuesto. ' +
  'Por favor elija otra opción.'

/** Opciones ofrecidas para el atributo compuesto dado. */
export function opcionesCompuesto(modelo: Modelo, a: Atributo): OpcionCompuesto[] {
  return opcionCBloqueada(modelo, a) ? ['A', 'B'] : ['A', 'B', 'C']
}

/**
 * Aplica la opcion elegida al atributo compuesto y devuelve el modelo nuevo
 * junto con la bitacora actualizada.
 */
export function eliminarCompuesto(
  modelo: Modelo,
  bitacora: Bitacora,
  compuesto: Atributo,
  opcion: OpcionCompuesto,
): ResultadoPaso {
  const propietarioNombre = nombreDe(modelo, compuesto.propietario)
  const esDeRelacion = compuesto.propietario.tipo === 'relacion'

  let log = registrar(
    bitacora,
    'compuestos',
    `El atributo compuesto ${compuesto.nombre.toUpperCase()} pertenece a la ` +
      `${esDeRelacion ? 'relación' : 'entidad'} ${propietarioNombre.toUpperCase()}.`,
  )

  switch (opcion) {
    case 'A':
      return { modelo: aplicarA(modelo, compuesto), bitacora: logA(log, compuesto) }
    case 'B':
      return { modelo: aplicarB(modelo, compuesto), bitacora: logB(log, compuesto) }
    case 'C': {
      if (opcionCBloqueada(modelo, compuesto)) {
        log = registrar(log, 'compuestos', `Se eligió la opción C: ${MENSAJE_C_BLOQUEADA}`)
        return { modelo, bitacora: log }
      }
      return {
        modelo: aplicarC(modelo, compuesto),
        bitacora: logC(log, compuesto, propietarioNombre),
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Opcion A: un unico atributo que concatena los simples, unidos con "-"
// `ConectorAtributo.concatenarAtributos`
// ---------------------------------------------------------------------------

function aplicarA(modelo: Modelo, compuesto: Atributo): Modelo {
  return editar(modelo, (m) => {
    const hijos = hijosDeCompuesto(m, compuesto.id)
    const concatenado = hijos.map((h) => h.nombre).join('-')
    agregarAtributo(m, {
      nombre: concatenado,
      propietario: compuesto.propietario,
      tipo: 'simple',
      cardMin: compuesto.cardMin,
      cardMax: compuesto.cardMax,
    })
    quitarAtributo(m, compuesto.id)
  })
}

function logA(b: Bitacora, compuesto: Atributo): Bitacora {
  return registrar(
    b,
    'compuestos',
    'Se toma la opción A: Se genera un único atributo que es la concatenación de todos ' +
      `los atributos simples que contenía ${compuesto.nombre.toUpperCase()}.`,
    true,
  )
}

// ---------------------------------------------------------------------------
// Opcion B: los atributos simples pasan a ser independientes del propietario
// `ConectorAtributo.pasoAtributosDelCompuestoAatributosIndependientesB`
// ---------------------------------------------------------------------------

function aplicarB(modelo: Modelo, compuesto: Atributo): Modelo {
  return editar(modelo, (m) => {
    for (const hijo of hijosDeCompuesto(m, compuesto.id)) {
      copiarAtributo(m, hijo, compuesto.propietario)
    }
    quitarAtributo(m, compuesto.id)
  })
}

function logB(b: Bitacora, compuesto: Atributo): Bitacora {
  return registrar(
    b,
    'compuestos',
    'Se toma la opción B: Se definen los atributos simples sin un atributo compuesto que ' +
      'los resuma. La cantidad de atributos aumenta pero esta solución permite definir cada ' +
      `uno de los datos en forma independiente. Se eliminó ${compuesto.nombre.toUpperCase()}.`,
    true,
  )
}

// ---------------------------------------------------------------------------
// Opcion C: entidad nueva con los atributos simples, relacionada (1,1)-(1,1)
// `ConectorAtributo.convertirAtributoCompuestoOp3`
// ---------------------------------------------------------------------------

function aplicarC(modelo: Modelo, compuesto: Atributo): Modelo {
  return editar(modelo, (m) => {
    const nombreComp = compuesto.nombre
    const nuevaId = agregarEntidad(m, nombreComp)

    // Los atributos simples del compuesto pasan a la entidad nueva.
    for (const hijo of hijosDeCompuesto(m, compuesto.id)) {
      copiarAtributo(m, hijo, { tipo: 'entidad', id: nuevaId })
    }

    // Identificador propio: id_<compuesto>.
    const idAttr = agregarAtributo(m, {
      nombre: `id_${nombreComp}`,
      propietario: { tipo: 'entidad', id: nuevaId },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: nuevaId,
      nombre: `id_${nombreComp}`,
      compuesto: false,
      atributoIds: [idAttr],
      entidadesExternasIds: [],
    })

    if (compuesto.propietario.tipo === 'relacion') {
      // El compuesto colgaba de una relacion binaria: se le suma la entidad
      // nueva como tercera pata (`convertirAtributoCompuestoOp3DeRelacion`).
      const rel = m.relaciones.find((r) => r.id === compuesto.propietario.id)
      if (rel) rel.patas.push({ entidadId: nuevaId, cardMin: '1', cardMax: '1' })
    } else {
      const origenId = compuesto.propietario.id
      const nombreOrigen =
        m.entidades.find((e) => e.id === origenId)?.nombre ?? 'origen'
      agregarRelacion(
        m,
        `${nombreOrigen}_${nombreComp}`.toLowerCase(),
        [
          { entidadId: origenId, cardMin: '1', cardMax: '1' },
          { entidadId: nuevaId, cardMin: '1', cardMax: '1' },
        ],
      )
    }

    quitarAtributo(m, compuesto.id)
  })
}

function logC(b: Bitacora, compuesto: Atributo, propietario: string): Bitacora {
  let log = registrar(
    b,
    'compuestos',
    `Se toma la opción C: Se genera una nueva entidad (${compuesto.nombre.toUpperCase()}) ` +
      'que representa el atributo compuesto, conformada por cada uno de los atributos ' +
      'simples que contiene. Esta nueva entidad debe estar relacionada con la entidad a la ' +
      'cual pertenecía el atributo compuesto. Esta solución capta mejor la esencia del ' +
      'atributo compuesto. Es la opción más compleja.',
    true,
  )
  log = registrar(
    log,
    'compuestos',
    `El nombre de la nueva relación es: ${propietario.toUpperCase()}_${compuesto.nombre.toUpperCase()}.`,
  )
  return log
}
