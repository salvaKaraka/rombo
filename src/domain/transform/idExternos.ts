/**
 * Paso 1 del pasaje a fisico: eliminacion de identificadores externos.
 *
 * Espeja `actions/EliminarIdExternos.java`. Un identificador externo es un
 * identificador compuesto que, ademas de atributos propios, incluye una o mas
 * entidades. Eliminarlo significa traer los atributos identificatorios de esas
 * entidades a la entidad que los referencia, formando un identificador
 * compuesto puramente local.
 */

import type { Modelo } from '../types'
import type { Bitacora } from '../log'
import { registrar } from '../log'
import { copiarAtributo, editar } from '../edits'
import { atributo, camposClave, entidad, identificadoresDe } from '../queries'
import type { ResultadoPaso } from './compuestos'

/** Elimina todos los identificadores externos del modelo, de una pasada. */
export function eliminarIdExternos(modelo: Modelo, bitacora: Bitacora): ResultadoPaso {
  const externos = modelo.identificadores.filter(
    (i) => i.compuesto && i.entidadesExternasIds.length > 0,
  )

  if (externos.length === 0) {
    return {
      modelo,
      bitacora: registrar(
        bitacora,
        'idExternos',
        'No se encontraron identificadores externos para eliminar.',
      ),
    }
  }

  let log = bitacora

  for (const ext of externos) {
    const entNombre = entidad(modelo, ext.entidadId)?.nombre ?? '?'
    log = registrar(
      log,
      'idExternos',
      `Se eliminan los identificadores externos de la entidad: ${entNombre.toUpperCase()}.`,
    )
    for (const externaId of ext.entidadesExternasIds) {
      const externaNombre = entidad(modelo, externaId)?.nombre ?? '?'
      const clavesPropias = ext.atributoIds
        .map((aid) => atributo(modelo, aid)?.nombre)
        .filter((n): n is string => !!n)
      log = registrar(
        log,
        'idExternos',
        `El identificador externo que se va a eliminar está formado por: ` +
          `${clavesPropias.join(', ').toUpperCase()} y el identificador de la entidad ` +
          `${externaNombre.toUpperCase()}.`,
      )
      log = registrar(
        log,
        'idExternos',
        `Se toma el identificador de la entidad ${externaNombre.toUpperCase()} y se pasa a la ` +
          `entidad ${entNombre.toUpperCase()}, formando parte del nuevo identificador compuesto.`,
        true,
      )
    }
  }

  const nuevo = editar(modelo, (m) => {
    for (const ext of m.identificadores.filter(
      (i) => i.compuesto && i.entidadesExternasIds.length > 0,
    )) {
      const componentes = [...ext.atributoIds]

      for (const externaId of ext.entidadesExternasIds) {
        // Los atributos que forman la clave de la entidad externa se copian a la
        // entidad, ya como identificadores locales.
        for (const idExterno of identificadoresDe(m, externaId)) {
          for (const aid of idExterno.atributoIds) {
            const origen = m.atributos.find((a) => a.id === aid)
            if (!origen) continue
            const nombreDestino = nombreSinChocar(m, ext.entidadId, origen.nombre, externaId)
            const copia = copiarAtributo(
              m,
              origen,
              { tipo: 'entidad', id: ext.entidadId },
              { nombre: nombreDestino, tipo: 'identificador', cardMin: '1', cardMax: '1' },
            )
            componentes.push(copia)
          }
        }
      }

      ext.atributoIds = componentes
      ext.entidadesExternasIds = []
      ext.compuesto = componentes.length > 1
      ext.nombre = camposClave(m, ext.entidadId).join('+') || ext.nombre
    }
  })

  return { modelo: nuevo, bitacora: log }
}

/**
 * Evita colisiones al traer la clave de la entidad externa: si la entidad ya
 * tiene un atributo con ese nombre, se sufija con el nombre de la entidad
 * externa (`nro` -> `nro_sucursal`).
 */
function nombreSinChocar(
  m: Modelo,
  entidadId: string,
  nombre: string,
  externaId: string,
): string {
  const usados = new Set(
    m.atributos
      .filter((a) => a.propietario.tipo === 'entidad' && a.propietario.id === entidadId)
      .map((a) => a.nombre),
  )
  if (!usados.has(nombre)) return nombre
  const externaNombre = entidad(m, externaId)?.nombre ?? 'ext'
  const candidato = `${nombre}_${externaNombre}`
  if (!usados.has(candidato)) return candidato
  let i = 2
  while (usados.has(`${candidato}_${i}`)) i++
  return `${candidato}_${i}`
}
