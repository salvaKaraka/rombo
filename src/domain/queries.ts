/**
 * Consultas y helpers de lectura sobre el modelo. Sin efectos.
 *
 * Espeja `modelo/Diagrama.java` y los metodos de consulta de `Entidad` /
 * `Relacion` / `ObjetoCaser` (tieneAtrCompuesto, tienePolivalente, ...).
 */

import type {
  Atributo,
  Cobertura,
  Entidad,
  Id,
  Identificador,
  Jerarquia,
  Modelo,
  Relacion,
  RefPropietario,
  RefSeleccion,
  TipoPropietario,
} from './types'
import { esPolivalente } from './types'

// ---------------------------------------------------------------------------
// Ids y orden de creacion
// ---------------------------------------------------------------------------

/**
 * Genera un id nuevo con el prefijo dado. El numero es un contador global del
 * modelo, asi que el orden numerico de los ids ES el orden de creacion — que es
 * lo que recorre `Diagrama.getEntidadesRelacionesAtCompuestos()`.
 */
export function nuevoId(modelo: Modelo, prefijo: string): { id: Id; seq: number } {
  const seq = modelo.seq + 1
  return { id: `${prefijo}${seq}`, seq }
}

/** Extrae el numero de secuencia de un id, para ordenar por creacion. */
export function ordenCreacion(id: Id): number {
  const n = Number(id.replace(/^[a-z]+/i, ''))
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function entidad(modelo: Modelo, id: Id): Entidad | undefined {
  return modelo.entidades.find((e) => e.id === id)
}

export function relacion(modelo: Modelo, id: Id): Relacion | undefined {
  return modelo.relaciones.find((r) => r.id === id)
}

export function atributo(modelo: Modelo, id: Id): Atributo | undefined {
  return modelo.atributos.find((a) => a.id === id)
}

export function identificador(modelo: Modelo, id: Id): Identificador | undefined {
  return modelo.identificadores.find((i) => i.id === id)
}

/** Nombre de cualquier objeto referenciable, para mensajes y logs. */
export function nombreDe(modelo: Modelo, ref: RefPropietario): string {
  switch (ref.tipo) {
    case 'entidad':
      return entidad(modelo, ref.id)?.nombre ?? '?'
    case 'relacion':
      return relacion(modelo, ref.id)?.nombre ?? '?'
    case 'compuesto':
      return atributo(modelo, ref.id)?.nombre ?? '?'
  }
}

export function mismaRef(a: RefPropietario, b: RefPropietario): boolean {
  return a.tipo === b.tipo && a.id === b.id
}

/** Nombre de cualquier cosa seleccionable, incluidos los atributos simples. */
export function nombreDeSeleccion(modelo: Modelo, ref: RefSeleccion): string {
  if (ref.tipo === 'atributo') return atributo(modelo, ref.id)?.nombre ?? '?'
  return nombreDe(modelo, ref)
}

// ---------------------------------------------------------------------------
// Portadores de atributos, en orden de creacion
// ---------------------------------------------------------------------------

/**
 * Entidades, relaciones y atributos compuestos, en orden de creacion.
 * Equivalente a `Diagrama.getEntidadesRelacionesAtCompuestos()`.
 */
export function portadores(modelo: Modelo): RefPropietario[] {
  const refs: { ref: RefPropietario; orden: number }[] = [
    ...modelo.entidades.map((e) => ({
      ref: { tipo: 'entidad' as TipoPropietario, id: e.id },
      orden: ordenCreacion(e.id),
    })),
    ...modelo.relaciones.map((r) => ({
      ref: { tipo: 'relacion' as TipoPropietario, id: r.id },
      orden: ordenCreacion(r.id),
    })),
    ...modelo.atributos
      .filter((a) => a.tipo === 'compuesto')
      .map((a) => ({
        ref: { tipo: 'compuesto' as TipoPropietario, id: a.id },
        orden: ordenCreacion(a.id),
      })),
  ]
  refs.sort((a, b) => a.orden - b.orden)
  return refs.map((x) => x.ref)
}

/** Atributos que pertenecen al portador dado, en orden de creacion. */
export function atributosDe(modelo: Modelo, ref: RefPropietario): Atributo[] {
  return modelo.atributos
    .filter((a) => mismaRef(a.propietario, ref))
    .sort((a, b) => ordenCreacion(a.id) - ordenCreacion(b.id))
}

export function atributosDeEntidad(modelo: Modelo, entidadId: Id): Atributo[] {
  return atributosDe(modelo, { tipo: 'entidad', id: entidadId })
}

// ---------------------------------------------------------------------------
// Deteccion para el pasaje a logico
// ---------------------------------------------------------------------------

/**
 * Primer atributo compuesto del modelo, recorriendo los portadores en orden de
 * creacion. `null` si no hay ninguno. Equivalente al par
 * `hayCompuesto()` / `dameAtrCompuesto()`.
 */
export function primerCompuesto(modelo: Modelo): Atributo | null {
  for (const ref of portadores(modelo)) {
    const encontrado = atributosDe(modelo, ref).find((a) => a.tipo === 'compuesto')
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Primer atributo polivalente (cardMax = n) que NO sea compuesto.
 *
 * El original chequea `isPolivaliente()` sobre el conector, que solo mira la
 * cardinalidad maxima; pero los compuestos ya se eliminaron en el paso 1, asi
 * que en la practica solo quedan simples e identificadores. Excluirlos explicito
 * hace el paso 2 independiente del orden de ejecucion.
 */
export function primerPolivalente(modelo: Modelo): Atributo | null {
  for (const ref of portadores(modelo)) {
    const encontrado = atributosDe(modelo, ref).find(
      (a) => a.tipo !== 'compuesto' && esPolivalente(a.cardMax),
    )
    if (encontrado) return encontrado
  }
  return null
}

/** Primera jerarquia con al menos un hijo, en orden de creacion del padre. */
export function primeraJerarquia(modelo: Modelo): Jerarquia | null {
  const conHijos = modelo.jerarquias.filter((j) => j.hijosIds.length > 0)
  if (conHijos.length === 0) return null
  conHijos.sort((a, b) => ordenCreacion(a.padreId) - ordenCreacion(b.padreId))
  return conHijos[0]
}

/** Primer identificador externo (id compuesto que incluye entidades externas). */
export function primerIdExterno(modelo: Modelo): Identificador | null {
  const ordenados = [...modelo.identificadores].sort(
    (a, b) => ordenCreacion(a.entidadId) - ordenCreacion(b.entidadId),
  )
  return ordenados.find((i) => i.compuesto && i.entidadesExternasIds.length > 0) ?? null
}

// ---------------------------------------------------------------------------
// Jerarquias
// ---------------------------------------------------------------------------

export function jerarquiaComoPadre(modelo: Modelo, entidadId: Id): Jerarquia | undefined {
  return modelo.jerarquias.find((j) => j.padreId === entidadId)
}

export function jerarquiaComoHijo(modelo: Modelo, entidadId: Id): Jerarquia | undefined {
  return modelo.jerarquias.find((j) => j.hijosIds.includes(entidadId))
}

export function esPadre(modelo: Modelo, entidadId: Id): boolean {
  const j = jerarquiaComoPadre(modelo, entidadId)
  return !!j && j.hijosIds.length > 0
}

export function esHijo(modelo: Modelo, entidadId: Id): boolean {
  return !!jerarquiaComoHijo(modelo, entidadId)
}

/**
 * true si algun hijo de la jerarquia es a su vez padre de otra jerarquia.
 * En ese caso el original NO ofrece eliminar los hijos y fuerza "conservar todo"
 * (`Entidad.hijosSonPadresDeOtrasJerarquias`).
 */
export function hijosSonPadresDeOtrasJerarquias(modelo: Modelo, j: Jerarquia): boolean {
  return j.hijosIds.some((h) => esPadre(modelo, h))
}

/** Etiqueta "padre/hijo1/hijo2" — `Entidad.dameJerarquiaString()`. */
export function etiquetaJerarquia(modelo: Modelo, j: Jerarquia): string {
  const padre = entidad(modelo, j.padreId)?.nombre ?? '?'
  const hijos = j.hijosIds.map((h) => entidad(modelo, h)?.nombre ?? '?')
  return [padre, ...hijos].join('/')
}

/** Nombres de los hijos separados por " / " — `Entidad.nombresHijos()`. */
export function nombresHijos(modelo: Modelo, j: Jerarquia): string {
  return j.hijosIds.map((h) => entidad(modelo, h)?.nombre ?? '?').join(' / ')
}

/** Opciones disponibles al bajar una jerarquia, segun cobertura y estructura. */
export function opcionesJerarquia(
  modelo: Modelo,
  j: Jerarquia,
): { opciones: ('A' | 'B' | 'C')[]; forzada: boolean; motivo?: string } {
  if (hijosSonPadresDeOtrasJerarquias(modelo, j)) {
    return {
      opciones: ['B'],
      forzada: true,
      motivo:
        'Al haber alguna entidad hija que forma parte de otra jerarquía, no le damos la opción de eliminar a los hijos, se deja todo.',
    }
  }
  const total: Cobertura[] = ['TE', 'TS']
  return total.includes(j.cobertura)
    ? { opciones: ['A', 'B', 'C'], forzada: false }
    : { opciones: ['A', 'B'], forzada: false }
}

// ---------------------------------------------------------------------------
// Relaciones e identificadores
// ---------------------------------------------------------------------------

export function relacionesDeEntidad(modelo: Modelo, entidadId: Id): Relacion[] {
  return modelo.relaciones
    .filter((r) => r.patas.some((p) => p.entidadId === entidadId))
    .sort((a, b) => ordenCreacion(a.id) - ordenCreacion(b.id))
}

export function identificadoresDe(modelo: Modelo, entidadId: Id): Identificador[] {
  return modelo.identificadores
    .filter((i) => i.entidadId === entidadId)
    .sort((a, b) => ordenCreacion(a.id) - ordenCreacion(b.id))
}

/**
 * Nombres de los campos que forman la clave de una entidad.
 * Un identificador compuesto aporta todos sus atributos; uno simple, su nombre.
 */
export function camposClave(modelo: Modelo, entidadId: Id): string[] {
  const ids = identificadoresDe(modelo, entidadId)
  if (ids.length === 0) return []
  const primero = ids[0]
  if (primero.compuesto) {
    return primero.atributoIds
      .map((aid) => atributo(modelo, aid)?.nombre)
      .filter((n): n is string => !!n)
  }
  return [primero.nombre]
}

/**
 * Un identificador externo requiere que la relacion entre la entidad y la
 * entidad externa tenga cardinalidad (1,1) de un lado.
 * Manual §3, Fig. 22: "lo mas importante para crear el identificador externo es
 * que la relacion entre la entidad Oficina y la entidad Sucursal tenga en un
 * lado la cardinalidad en (1,1)".
 */
export function puedeSerIdExterno(
  modelo: Modelo,
  entidadId: Id,
  entidadExternaId: Id,
): boolean {
  return modelo.relaciones.some((r) => {
    const propia = r.patas.find((p) => p.entidadId === entidadId)
    const externa = r.patas.find((p) => p.entidadId === entidadExternaId)
    if (!propia || !externa) return false
    const es11 = (min: string, max: string) => min === '1' && max === '1'
    return es11(propia.cardMin, propia.cardMax) || es11(externa.cardMin, externa.cardMax)
  })
}

/** Entidades candidatas a formar un identificador externo de `entidadId`. */
export function candidatasIdExterno(modelo: Modelo, entidadId: Id): Entidad[] {
  return modelo.entidades.filter(
    (e) => e.id !== entidadId && puedeSerIdExterno(modelo, entidadId, e.id),
  )
}

// ---------------------------------------------------------------------------
// Atributos compuestos
// ---------------------------------------------------------------------------

/** Atributos simples que forman el atributo compuesto dado. */
export function hijosDeCompuesto(modelo: Modelo, compuestoId: Id): Atributo[] {
  return atributosDe(modelo, { tipo: 'compuesto', id: compuestoId })
}

/**
 * Cuantas patas tiene la relacion propietaria de un atributo.
 * `ConectorAtributo.calculoTamrelacion()`: si es 3, la opcion C queda bloqueada
 * porque implicaria una relacion 4-naria.
 */
export function tamanoRelacionPropietaria(modelo: Modelo, a: Atributo): number {
  if (a.propietario.tipo !== 'relacion') return 0
  return relacion(modelo, a.propietario.id)?.patas.length ?? 0
}

// ---------------------------------------------------------------------------
// Utilidades varias
// ---------------------------------------------------------------------------

/** Genera un nombre libre a partir de `base`, agregando sufijos numericos. */
export function nombreLibre(usados: Set<string>, base: string): string {
  if (!usados.has(base)) return base
  let i = 2
  while (usados.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export function nombresDeEntidades(modelo: Modelo): Set<string> {
  return new Set(modelo.entidades.map((e) => e.nombre))
}
