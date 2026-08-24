/**
 * Paso 2 del pasaje a logico: eliminacion de atributos polivalentes.
 *
 * Espeja `ConectorAtributo.convertirAtributoPolivalente`. A diferencia del paso
 * 1 no hay opciones: siempre se crea una entidad nueva con el nombre del
 * atributo y una relacion con el propietario. Lo unico que decide el usuario es
 * la cardinalidad del lado de la entidad nueva (el original abre
 * `DeleteAtributoPolivalenteWizard` para pedirla).
 */

import type { Atributo, CardMax, CardMin, Modelo } from '../types'
import type { Bitacora } from '../log'
import { registrar } from '../log'
import {
  agregarAtributo,
  agregarEntidad,
  agregarIdentificador,
  agregarRelacion,
  editar,
  quitarAtributo,
} from '../edits'
import { nombreDe } from '../queries'
import type { ResultadoPaso } from './compuestos'

/** Cardinalidad por defecto del lado de la entidad nueva. */
export const CARD_POLIVALENTE_DEFECTO: { min: CardMin; max: CardMax } = { min: '1', max: 'n' }

export function mensajePolivalente(modelo: Modelo, a: Atributo): string {
  const propietario = nombreDe(modelo, a.propietario).toUpperCase()
  return (
    `Se va a eliminar el atributo polivalente ${a.nombre.toUpperCase()} de la entidad ` +
    `${propietario}. Se va a crear una relación y una entidad.`
  )
}

/**
 * Elimina el atributo polivalente creando entidad + relacion.
 *
 * El lado del propietario queda en (1,n) —fijo en el original— y el lado de la
 * entidad nueva toma la cardinalidad que eligio el usuario.
 */
export function eliminarPolivalente(
  modelo: Modelo,
  bitacora: Bitacora,
  polivalente: Atributo,
  card: { min: CardMin; max: CardMax },
): ResultadoPaso {
  const nombreAtr = polivalente.nombre
  const nombreOrigen = nombreDe(modelo, polivalente.propietario)

  const nuevo = editar(modelo, (m) => {
    const nuevaId = agregarEntidad(m, nombreAtr)
    const ent = m.entidades.find((e) => e.id === nuevaId)!
    // Marca que la entidad nacio de un atributo polivalente: en el pasaje a
    // tablas su clave es el nombre del atributo, no un identificador propio
    // (`Entidad.tomoIds` mira `nacioDeAtrPoli`).
    ent.nacioDeAtrPoli = nombreAtr

    // El identificador de la entidad nueva es el propio nombre del atributo.
    const idAttr = agregarAtributo(m, {
      nombre: nombreAtr,
      propietario: { tipo: 'entidad', id: nuevaId },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: nuevaId,
      nombre: nombreAtr,
      compuesto: false,
      atributoIds: [idAttr],
      entidadesExternasIds: [],
    })

    if (polivalente.propietario.tipo === 'relacion') {
      // Polivalente colgando de una relacion: la entidad nueva se suma como pata.
      const rel = m.relaciones.find((r) => r.id === polivalente.propietario.id)
      if (rel) rel.patas.push({ entidadId: nuevaId, cardMin: card.min, cardMax: card.max })
    } else {
      agregarRelacion(m, `${nombreOrigen}_${nombreAtr}`.toLowerCase(), [
        { entidadId: polivalente.propietario.id, cardMin: '1', cardMax: 'n' },
        { entidadId: nuevaId, cardMin: card.min, cardMax: card.max },
      ])
    }

    quitarAtributo(m, polivalente.id)
  })

  let log = registrar(
    bitacora,
    'polivalentes',
    `El atributo polivalente ${nombreAtr.toUpperCase()} pertenece a la entidad ` +
      `${nombreOrigen.toUpperCase()}.`,
  )
  log = registrar(
    log,
    'polivalentes',
    `Se crea una nueva entidad con el nombre del atributo polivalente: ${nombreAtr.toUpperCase()}.`,
    true,
  )
  log = registrar(
    log,
    'polivalentes',
    `Se crea una relación con el nombre: ${nombreOrigen.toUpperCase()}_${nombreAtr.toUpperCase()}, ` +
      `con cardinalidad (1,n) del lado de ${nombreOrigen.toUpperCase()} y ` +
      `(${card.min},${card.max}) del lado de ${nombreAtr.toUpperCase()}.`,
  )
  return { modelo: nuevo, bitacora: log }
}
