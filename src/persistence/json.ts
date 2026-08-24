/**
 * Formato nativo: JSON legible, extension `.caser.json`.
 */

import type { Documento, Escritor, Lector } from './types'
import { modeloVacio, pipelineInicial } from '../domain/types'

export const VERSION_FORMATO = 1

export const lectorJson: Lector = {
  nombre: 'Modelo CasER (JSON)',
  extensiones: ['.json'],

  reconoce(bytes, nombreArchivo) {
    if (nombreArchivo.toLowerCase().endsWith('.json')) return true
    // Un JSON siempre arranca con `{` (con o sin espacios delante).
    const inicio = new TextDecoder().decode(bytes.slice(0, 32)).trimStart()
    return inicio.startsWith('{')
  },

  leer(bytes) {
    let crudo: unknown
    try {
      crudo = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      throw new Error('El archivo no contiene JSON válido.')
    }
    return normalizar(crudo)
  },
}

export const escritorJson: Escritor = {
  nombre: 'Modelo CasER (JSON)',
  extension: '.caser.json',

  escribir(doc) {
    const salida: Documento = { ...doc, version: VERSION_FORMATO }
    return new Blob([JSON.stringify(salida, null, 2)], {
      type: 'application/json',
    })
  },
}

/**
 * Valida y completa un documento leido. Tolera archivos de versiones anteriores
 * a las que les falten campos nuevos, en vez de explotar.
 */
function normalizar(crudo: unknown): Documento {
  if (typeof crudo !== 'object' || crudo === null) {
    throw new Error('El archivo no tiene la forma de un modelo de CasER.')
  }
  const d = crudo as Partial<Documento>
  if (!d.modelo || typeof d.modelo !== 'object') {
    throw new Error('El archivo no contiene un modelo.')
  }

  const base = modeloVacio()
  const modelo = { ...base, ...d.modelo }

  // Los arrays son obligatorios para que el resto del codigo no tenga que
  // defenderse de undefined.
  for (const clave of [
    'entidades',
    'relaciones',
    'atributos',
    'identificadores',
    'jerarquias',
    'tablas',
  ] as const) {
    if (!Array.isArray(modelo[clave])) {
      throw new Error(`El modelo tiene "${clave}" con un formato inesperado.`)
    }
  }

  // `seq` debe quedar por encima de todo id existente, o los ids nuevos chocan.
  const maxSeq = Math.max(
    0,
    ...[
      ...modelo.entidades,
      ...modelo.relaciones,
      ...modelo.atributos,
      ...modelo.identificadores,
      ...modelo.jerarquias,
    ].map((o) => Number(String(o.id).replace(/^[a-z]+/i, '')) || 0),
  )
  modelo.seq = Math.max(modelo.seq ?? 0, maxSeq)

  return {
    version: d.version ?? VERSION_FORMATO,
    modelo,
    pipeline: { ...pipelineInicial(), ...(d.pipeline ?? {}) },
    bitacora: d.bitacora ?? null,
  }
}

/** Lectores disponibles, en orden de prueba. */
export const LECTORES: Lector[] = [lectorJson]

export function leerDocumento(bytes: Uint8Array, nombreArchivo: string): Documento {
  const lector = LECTORES.find((l) => l.reconoce(bytes, nombreArchivo))
  if (!lector) {
    throw new Error(
      'Formato no reconocido. Esta versión abre modelos guardados por esta misma app (.caser.json).',
    )
  }
  return lector.leer(bytes)
}
