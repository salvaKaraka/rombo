/**
 * Contrato de persistencia.
 *
 * Todo lo que se guarda o abre pasa por aca. El formato nativo es JSON
 * (`json.ts`), pero la interfaz existe para poder sumar despues un lector del
 * formato original de CasER — serializacion Java, header `AC ED 00 05`, ver
 * `editors/util/LoadSaveUtils.java` en el JAR. Ese lector solo tendria que
 * implementar `Lector` y registrarse en `LECTORES`.
 */

import type { Modelo } from '../domain/types'
import type { Bitacora } from '../domain/log'
import type { EstadoPipeline } from '../domain/types'

/** Lo que se persiste: el modelo mas el estado del pasaje y la bitacora. */
export interface Documento {
  version: number
  modelo: Modelo
  pipeline: EstadoPipeline
  bitacora: Bitacora | null
}

export interface Lector {
  /** Nombre para mostrar en el dialogo de apertura. */
  nombre: string
  /** Extensiones que maneja, con el punto. */
  extensiones: string[]
  /** true si el contenido parece ser de este formato. */
  reconoce(bytes: Uint8Array, nombreArchivo: string): boolean
  /** Parsea el contenido. Debe tirar un Error con mensaje util si falla. */
  leer(bytes: Uint8Array): Documento
}

export interface Escritor {
  nombre: string
  extension: string
  escribir(doc: Documento): Blob
}
