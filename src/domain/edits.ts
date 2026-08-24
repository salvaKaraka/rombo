/**
 * Ediciones del modelo. Cada funcion es pura: clona el modelo, muta el clon y
 * lo devuelve.
 *
 * El patron es `editar(modelo, (m) => { ... })`: cuerpo imperativo sobre un
 * borrador, resultado inmutable. Mantiene las transformaciones legibles y
 * parecidas al Java original, sin renunciar a que "Deshacer" sea guardar el
 * modelo anterior.
 */

import type {
  Atributo,
  CardMax,
  CardMin,
  Cobertura,
  Id,
  Modelo,
  Pata,
  Punto,
  RefPropietario,
  TipoAtributo,
} from './types'
import { atributosDe, mismaRef, nuevoId } from './queries'

/** Clona el modelo, aplica `fn` sobre el clon y lo devuelve. */
export function editar(modelo: Modelo, fn: (m: Modelo) => void): Modelo {
  const copia: Modelo = structuredClone(modelo)
  fn(copia)
  return copia
}

// ---------------------------------------------------------------------------
// Alta de objetos. Operan sobre un borrador ya clonado y devuelven el id nuevo.
// ---------------------------------------------------------------------------

export function agregarEntidad(m: Modelo, nombre: string, pos?: Punto): Id {
  const { id, seq } = nuevoId(m, 'e')
  m.seq = seq
  m.entidades.push({
    id,
    nombre,
    pos: pos ?? posicionLibre(m),
  })
  return id
}

export function agregarRelacion(m: Modelo, nombre: string, patas: Pata[], pos?: Punto): Id {
  const { id, seq } = nuevoId(m, 'r')
  m.seq = seq
  m.relaciones.push({
    id,
    nombre,
    // Una relacion se dibuja entre las entidades que vincula: ponerla en la
    // primera celda libre de la grilla la dejaria lejos, con los conectores
    // cruzando todo el diagrama.
    pos: pos ?? posicionEntreEntidades(m, patas),
    patas,
  })
  return id
}

/**
 * Centroide de las entidades que participan de la relacion, corrido si ya hay
 * otro objeto ocupando ese punto.
 */
function posicionEntreEntidades(m: Modelo, patas: Pata[]): Punto {
  const puntos = patas
    .map((p) => m.entidades.find((e) => e.id === p.entidadId)?.pos)
    .filter((p): p is Punto => !!p)

  if (puntos.length === 0) return posicionLibre(m)

  const centro = {
    x: Math.round(puntos.reduce((s, p) => s + p.x, 0) / puntos.length),
    y: Math.round(puntos.reduce((s, p) => s + p.y, 0) / puntos.length),
  }

  // Una relacion recursiva, o dos relaciones entre el mismo par, caerian en el
  // mismo centroide: se desplazan en diagonal hasta encontrar lugar.
  const ocupado = (p: Punto) =>
    [...m.entidades, ...m.relaciones].some(
      (o) => Math.abs(o.pos.x - p.x) < 80 && Math.abs(o.pos.y - p.y) < 70,
    )

  let candidato = centro
  for (let i = 1; ocupado(candidato) && i <= 8; i++) {
    candidato = { x: centro.x + i * 70, y: centro.y - i * 60 }
  }
  return candidato
}

export function agregarAtributo(
  m: Modelo,
  datos: {
    nombre: string
    propietario: RefPropietario
    tipo: TipoAtributo
    cardMin: CardMin
    cardMax: CardMax
  },
): Id {
  const { id, seq } = nuevoId(m, datos.tipo === 'compuesto' ? 'c' : 'a')
  m.seq = seq
  m.atributos.push({ id, ...datos })
  return id
}

export function agregarIdentificador(
  m: Modelo,
  datos: {
    entidadId: Id
    nombre: string
    compuesto: boolean
    atributoIds: Id[]
    entidadesExternasIds: Id[]
  },
): Id {
  const { id, seq } = nuevoId(m, 'i')
  m.seq = seq
  m.identificadores.push({ id, ...datos })
  return id
}

export function agregarJerarquia(
  m: Modelo,
  padreId: Id,
  hijosIds: Id[],
  cobertura: Cobertura,
): Id {
  const existente = m.jerarquias.find((j) => j.padreId === padreId)
  if (existente) {
    for (const h of hijosIds) {
      if (!existente.hijosIds.includes(h)) existente.hijosIds.push(h)
    }
    existente.cobertura = cobertura
    return existente.id
  }
  const { id, seq } = nuevoId(m, 'j')
  m.seq = seq
  m.jerarquias.push({ id, padreId, hijosIds, cobertura })
  return id
}

// ---------------------------------------------------------------------------
// Baja de objetos, con limpieza de referencias
// ---------------------------------------------------------------------------

/** Elimina un atributo y, si es compuesto, todos sus atributos hijos. */
export function quitarAtributo(m: Modelo, atributoId: Id): void {
  const a = m.atributos.find((x) => x.id === atributoId)
  if (!a) return

  if (a.tipo === 'compuesto') {
    for (const hijo of atributosDe(m, { tipo: 'compuesto', id: atributoId })) {
      quitarAtributo(m, hijo.id)
    }
  }

  m.atributos = m.atributos.filter((x) => x.id !== atributoId)

  // Sacarlo de los identificadores que lo referencian; si un identificador
  // compuesto queda sin atributos ni entidades externas, desaparece.
  for (const id of m.identificadores) {
    id.atributoIds = id.atributoIds.filter((x) => x !== atributoId)
  }
  m.identificadores = m.identificadores.filter(
    (id) => !id.compuesto || id.atributoIds.length > 0 || id.entidadesExternasIds.length > 0,
  )
}

/** Elimina una relacion. */
export function quitarRelacion(m: Modelo, relacionId: Id): void {
  for (const a of atributosDe(m, { tipo: 'relacion', id: relacionId })) {
    quitarAtributo(m, a.id)
  }
  m.relaciones = m.relaciones.filter((r) => r.id !== relacionId)
}

/**
 * Elimina una entidad y todo lo que cuelga de ella: sus atributos, sus
 * identificadores, las relaciones en las que participa y su lugar en las
 * jerarquias.
 */
export function quitarEntidad(m: Modelo, entidadId: Id): void {
  for (const a of atributosDe(m, { tipo: 'entidad', id: entidadId })) {
    quitarAtributo(m, a.id)
  }
  m.identificadores = m.identificadores.filter((i) => i.entidadId !== entidadId)
  for (const i of m.identificadores) {
    i.entidadesExternasIds = i.entidadesExternasIds.filter((x) => x !== entidadId)
  }
  for (const r of [...m.relaciones]) {
    if (r.patas.some((p) => p.entidadId === entidadId)) quitarRelacion(m, r.id)
  }
  for (const j of m.jerarquias) {
    j.hijosIds = j.hijosIds.filter((h) => h !== entidadId)
  }
  m.jerarquias = m.jerarquias.filter((j) => j.padreId !== entidadId && j.hijosIds.length > 0)
  m.entidades = m.entidades.filter((e) => e.id !== entidadId)
}

export function quitarJerarquia(m: Modelo, jerarquiaId: Id): void {
  m.jerarquias = m.jerarquias.filter((j) => j.id !== jerarquiaId)
}

export function quitarIdentificador(m: Modelo, identificadorId: Id): void {
  m.identificadores = m.identificadores.filter((i) => i.id !== identificadorId)
}

// ---------------------------------------------------------------------------
// Copia de atributos entre propietarios
// ---------------------------------------------------------------------------

/**
 * Copia un atributo a un propietario nuevo, permitiendo forzar tipo y
 * cardinalidad. Devuelve el id del atributo creado.
 *
 * Se usa al subir atributos de hijos al padre (jerarquia opcion A), al bajar los
 * del padre a los hijos (opcion C) y al resolver identificadores externos.
 */
export function copiarAtributo(
  m: Modelo,
  origen: Atributo,
  destino: RefPropietario,
  overrides: Partial<Pick<Atributo, 'nombre' | 'tipo' | 'cardMin' | 'cardMax'>> = {},
): Id {
  const nuevo = agregarAtributo(m, {
    nombre: overrides.nombre ?? origen.nombre,
    propietario: destino,
    tipo: overrides.tipo ?? origen.tipo,
    cardMin: overrides.cardMin ?? origen.cardMin,
    cardMax: overrides.cardMax ?? origen.cardMax,
  })

  // Si el atributo copiado es compuesto, arrastra sus hijos.
  if ((overrides.tipo ?? origen.tipo) === 'compuesto') {
    for (const hijo of atributosDe(m, { tipo: 'compuesto', id: origen.id })) {
      copiarAtributo(m, hijo, { tipo: 'compuesto', id: nuevo })
    }
  }
  return nuevo
}

/** Mueve un atributo a otro propietario, sin copiarlo. */
export function moverAtributo(m: Modelo, atributoId: Id, destino: RefPropietario): void {
  const a = m.atributos.find((x) => x.id === atributoId)
  if (a && !mismaRef(a.propietario, destino)) a.propietario = destino
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const ANCHO_CELDA = 260
const ALTO_CELDA = 200
const COLUMNAS = 4

/** Ubica un objeto nuevo en la primera celda libre de una grilla. */
export function posicionLibre(m: Modelo): Punto {
  const ocupadas = [...m.entidades, ...m.relaciones].map((o) => o.pos)
  for (let i = 0; i < 400; i++) {
    const p = {
      x: 90 + (i % COLUMNAS) * ANCHO_CELDA,
      y: 90 + Math.floor(i / COLUMNAS) * ALTO_CELDA,
    }
    const libre = !ocupadas.some((o) => Math.abs(o.x - p.x) < 60 && Math.abs(o.y - p.y) < 60)
    if (libre) return p
  }
  return { x: 90, y: 90 }
}
