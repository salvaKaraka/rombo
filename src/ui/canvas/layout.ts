/**
 * Calculo de la geometria del diagrama. Modulo puro: no toca el DOM.
 *
 * Reproduce la notacion de `figures/*.java` (Chen / Batini, la que usa la
 * catedra):
 *   - entidad          rectangulo
 *   - relacion         rombo
 *   - atributo         linea terminada en circulo; vacio si es simple, negro
 *                      relleno si es identificador
 *   - at. compuesto    elipse, con sus atributos colgando
 *   - id compuesto     arco que cruza las lineas de los atributos que lo forman,
 *                      con un circulo negro
 *   - id externo       circulo negro sobre el conector de la relacion
 *   - jerarquia        linea horizontal del padre a los hijos, con la cobertura
 *   - cardinalidad     etiqueta sobre el conector; en atributos solo se muestra
 *                      cuando es (0,1) o (0,n)
 */

import type { Atributo, Id, Modelo, Punto, RefPropietario } from '../../domain/types'
import { coberturaAbreviatura } from '../../domain/types'
import {
  atributosDe,
  atributosDeEntidad,
  entidad,
  identificadoresDe,
  ordenCreacion,
} from '../../domain/queries'

// --------------------------------------------------------------- dimensiones

export const ENTIDAD_ALTO = 44
export const RELACION_ANCHO = 112
export const RELACION_ALTO = 58
const CHAR = 7.1
const PADDING_CAJA = 26
const RADIO_ATRIBUTO = 74
const RADIO_COMPUESTO = 104
const COMPUESTO_RX = 40
const COMPUESTO_RY = 20
const SEPARACION_JERARQUIA = 30

export function anchoEntidad(nombre: string): number {
  return Math.max(104, nombre.length * CHAR + PADDING_CAJA)
}

// ------------------------------------------------------------------- figuras

export interface FigNodo {
  ref: RefPropietario
  tipo: 'entidad' | 'relacion'
  nombre: string
  centro: Punto
  ancho: number
  alto: number
}

export interface FigPuntoAtributo {
  atributoId: Id
  nombre: string
  /** Desde donde arranca la linea (borde del propietario). */
  desde: Punto
  /** Donde esta el circulo. */
  hasta: Punto
  /** Posicion y anclaje del texto. */
  texto: Punto
  anclaje: 'start' | 'middle' | 'end'
  /** true = circulo negro relleno (identificador). */
  identificador: boolean
  /** Etiqueta de cardinalidad, o null si no corresponde mostrarla. */
  cardinalidad: string | null
}

export interface FigCompuesto {
  atributoId: Id
  nombre: string
  desde: Punto
  centro: Punto
  rx: number
  ry: number
  hijos: FigPuntoAtributo[]
}

export interface FigArcoId {
  /** Path del arco que cruza las lineas de los atributos de la clave. */
  path: string
  /** Punto donde va el circulo negro. */
  punto: Punto
  etiqueta: string | null
}

export interface FigConector {
  relacionId: Id
  entidadId: Id
  desde: Punto
  hasta: Punto
  cardinalidad: string
  cardPos: Punto
  cardAnclaje: 'start' | 'middle' | 'end'
  /** true si esta relacion participa de un identificador externo. */
  idExterno: boolean
  puntoExterno: Punto
}

export interface FigJerarquia {
  id: Id
  /** Bajada del padre hasta el bus. */
  vertPadre: [Punto, Punto]
  /** Linea horizontal. */
  bus: [Punto, Punto]
  /** Bajadas del bus a cada hijo. */
  vertHijos: [Punto, Punto][]
  etiqueta: string
  etiquetaPos: Punto
}

export interface Layout {
  nodos: FigNodo[]
  atributos: FigPuntoAtributo[]
  compuestos: FigCompuesto[]
  arcos: FigArcoId[]
  conectores: FigConector[]
  jerarquias: FigJerarquia[]
  /** Caja que contiene todo, con margen. */
  caja: { x: number; y: number; ancho: number; alto: number }
}

// ------------------------------------------------------------------ geometria

/**
 * Interseccion de un rayo que sale del centro con el borde de la figura.
 * Para el rombo usa la ecuacion |dx|/a + |dy|/b = 1; para el rectangulo, el
 * borde mas cercano.
 */
function borde(n: FigNodo, ang: number): Punto {
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const a = n.ancho / 2
  const b = n.alto / 2

  if (n.tipo === 'relacion') {
    const denom = Math.abs(dx) / a + Math.abs(dy) / b
    const t = denom === 0 ? 0 : 1 / denom
    return { x: n.centro.x + dx * t, y: n.centro.y + dy * t }
  }

  const tx = dx === 0 ? Infinity : a / Math.abs(dx)
  const ty = dy === 0 ? Infinity : b / Math.abs(dy)
  const t = Math.min(tx, ty)
  return { x: n.centro.x + dx * t, y: n.centro.y + dy * t }
}

function anclajePara(dx: number): 'start' | 'middle' | 'end' {
  if (dx > 0.28) return 'start'
  if (dx < -0.28) return 'end'
  return 'middle'
}

/**
 * Posicion del texto de un atributo respecto de su circulo.
 *
 * Cuando el atributo sale casi vertical el anclaje es 'middle', y poner el texto
 * a la altura del circulo lo tapa; en ese caso se corre por encima o por debajo
 * segun hacia donde salga.
 */
function textoDeAtributo(
  hasta: Punto,
  dx: number,
  dy: number,
): { texto: Punto; anclaje: 'start' | 'middle' | 'end' } {
  const anclaje = anclajePara(dx)
  if (anclaje === 'middle') {
    return { texto: { x: hasta.x, y: hasta.y + (dy < 0 ? -11 : 17) }, anclaje }
  }
  return { texto: { x: hasta.x + Math.sign(dx) * 10, y: hasta.y + 3.5 }, anclaje }
}

/**
 * Angulos para repartir N atributos alrededor de un nodo.
 *
 * Las entidades abren el abanico hacia arriba y las relaciones hacia abajo, que
 * es como quedan los diagramas de la catedra: los rombos con sus atributos por
 * debajo y las cajas con los suyos por encima.
 */
function angulos(cantidad: number, centro: number): number[] {
  if (cantidad === 0) return []
  if (cantidad === 1) return [centro]

  // Abanico contenido: pasado cierto ancho los nombres empiezan a chocar con el
  // propio nodo y con los conectores de las relaciones. Lo que da aire de verdad
  // es el radio escalonado de `radios()`, no abrir mas el angulo.
  const apertura = Math.min(2.0, 0.36 * (cantidad - 1) + 0.5)
  const paso = apertura / (cantidad - 1)
  return Array.from({ length: cantidad }, (_, i) => centro - apertura / 2 + i * paso)
}

/**
 * Radios escalonados: los atributos vecinos se alternan entre dos distancias,
 * asi dos nombres contiguos nunca quedan a la misma altura y no se superponen.
 */
function radios(cantidad: number, base: number): number[] {
  const crecimiento = Math.min(46, Math.max(0, cantidad - 2) * 9)
  return Array.from({ length: cantidad }, (_, i) =>
    base + crecimiento + (i % 2 === 1 ? 26 : 0),
  )
}

/** Etiqueta de cardinalidad de un atributo, o null si no se muestra. */
export function cardinalidadAtributo(a: Atributo): string | null {
  // Manual §3: "En caso de que la cardinalidad sea no obligatorio monovalente o
  // polivalente (0,1) o (0,n), esto se verá reflejado en el diagrama, en otro
  // caso no."
  if (a.cardMin === '0' || a.cardMax === 'n') return `(${a.cardMin},${a.cardMax})`
  return null
}

// -------------------------------------------------------------------- layout

export function calcularLayout(modelo: Modelo): Layout {
  const nodos: FigNodo[] = [
    ...modelo.entidades.map<FigNodo>((e) => ({
      ref: { tipo: 'entidad', id: e.id },
      tipo: 'entidad',
      nombre: e.nombre,
      centro: e.pos,
      ancho: anchoEntidad(e.nombre),
      alto: ENTIDAD_ALTO,
    })),
    ...modelo.relaciones.map<FigNodo>((r) => ({
      ref: { tipo: 'relacion', id: r.id },
      tipo: 'relacion',
      nombre: r.nombre,
      centro: r.pos,
      ancho: Math.max(RELACION_ANCHO, r.nombre.length * CHAR + 34),
      alto: RELACION_ALTO,
    })),
  ]

  const porId = new Map(nodos.map((n) => [`${n.ref.tipo}:${n.ref.id}`, n]))
  const buscar = (ref: RefPropietario) => porId.get(`${ref.tipo}:${ref.id}`)

  const atributos: FigPuntoAtributo[] = []
  const compuestos: FigCompuesto[] = []
  const arcos: FigArcoId[] = []

  // --- atributos de cada nodo --------------------------------------------
  for (const nodo of nodos) {
    const propios = atributosDe(modelo, nodo.ref)
    if (propios.length === 0) continue

    const centroFan = nodo.tipo === 'entidad' ? -Math.PI / 2 : Math.PI / 2
    const angs = angulos(propios.length, centroFan)
    const rads = radios(propios.length, RADIO_ATRIBUTO)
    const puntosDeAtributo = new Map<Id, Punto>()

    propios.forEach((a, i) => {
      const ang = angs[i]
      const desde = borde(nodo, ang)
      const esCompuesto = a.tipo === 'compuesto'
      const radio = esCompuesto ? rads[i] + (RADIO_COMPUESTO - RADIO_ATRIBUTO) : rads[i]
      const dx = Math.cos(ang)
      const dy = Math.sin(ang)
      const hasta = {
        x: nodo.centro.x + dx * (radio + nodo.ancho / 2),
        y: nodo.centro.y + dy * (radio + nodo.alto / 2),
      }

      if (esCompuesto) {
        const hijos = atributosDe(modelo, { tipo: 'compuesto', id: a.id })
        // Los hijos abren su propio abanico centrado en la direccion en la que
        // salio el compuesto, para alejarse del nodo propietario en vez de
        // volver sobre el.
        const angsHijos = angulos(hijos.length, ang)
        const radsHijos = radios(hijos.length, 56)

        const figHijos: FigPuntoAtributo[] = hijos.map((h, j) => {
          const ah = angsHijos[j]
          const hdx = Math.cos(ah)
          const hdy = Math.sin(ah)
          const hd = {
            x: hasta.x + hdx * COMPUESTO_RX,
            y: hasta.y + hdy * COMPUESTO_RY,
          }
          const hh = {
            x: hasta.x + hdx * (COMPUESTO_RX + radsHijos[j]),
            y: hasta.y + hdy * (COMPUESTO_RY + radsHijos[j]),
          }
          return {
            atributoId: h.id,
            nombre: h.nombre,
            desde: hd,
            hasta: hh,
            ...textoDeAtributo(hh, hdx, hdy),
            identificador: h.tipo === 'identificador',
            cardinalidad: cardinalidadAtributo(h),
          }
        })

        compuestos.push({
          atributoId: a.id,
          nombre: a.nombre,
          desde,
          centro: hasta,
          rx: COMPUESTO_RX,
          ry: COMPUESTO_RY,
          hijos: figHijos,
        })
      } else {
        atributos.push({
          atributoId: a.id,
          nombre: a.nombre,
          desde,
          hasta,
          ...textoDeAtributo(hasta, dx, dy),
          identificador: a.tipo === 'identificador',
          cardinalidad: cardinalidadAtributo(a),
        })
        puntosDeAtributo.set(a.id, hasta)
      }
    })

    // --- arco del identificador compuesto --------------------------------
    if (nodo.tipo === 'entidad') {
      for (const idf of identificadoresDe(modelo, nodo.ref.id)) {
        if (!idf.compuesto) continue
        const puntos = idf.atributoIds
          .map((aid) => puntosDeAtributo.get(aid))
          .filter((p): p is Punto => !!p)
        if (puntos.length < 2) continue

        // El arco cruza las lineas de los atributos a mitad de camino, para que
        // se lea como "estos atributos juntos son la clave".
        const medios = puntos.map((p) => ({
          x: nodo.centro.x + (p.x - nodo.centro.x) * 0.55,
          y: nodo.centro.y + (p.y - nodo.centro.y) * 0.55,
        }))

        // Curva suave que pasa por los cortes, abombada hacia afuera del nodo:
        // asi se lee como un arco y no como una polilinea quebrada.
        const path = medios
          .map((p, k) => {
            if (k === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
            const prev = medios[k - 1]
            const mx = (prev.x + p.x) / 2
            const my = (prev.y + p.y) / 2
            // Se empuja el control alejandolo del centro del nodo.
            const vx = mx - nodo.centro.x
            const vy = my - nodo.centro.y
            const largo = Math.hypot(vx, vy) || 1
            const cx = mx + (vx / largo) * 10
            const cy = my + (vy / largo) * 10
            return `Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
          })
          .join(' ')

        arcos.push({
          path,
          punto: medios[0],
          etiqueta: idf.entidadesExternasIds.length > 0 ? 'id externo' : null,
        })
      }
    }
  }

  // --- conectores de relaciones -------------------------------------------
  const conectores: FigConector[] = []
  for (const rel of modelo.relaciones) {
    const nodoRel = buscar({ tipo: 'relacion', id: rel.id })
    if (!nodoRel) continue

    rel.patas.forEach((pata, indice) => {
      const nodoEnt = buscar({ tipo: 'entidad', id: pata.entidadId })
      if (!nodoEnt) return

      let ang = Math.atan2(
        nodoEnt.centro.y - nodoRel.centro.y,
        nodoEnt.centro.x - nodoRel.centro.x,
      )
      // Relacion recursiva: ambas patas van a la misma entidad, hay que
      // separarlas o se superponen.
      if (nodoEnt.centro.x === nodoRel.centro.x && nodoEnt.centro.y === nodoRel.centro.y) {
        ang = indice * Math.PI
      } else if (
        rel.patas.filter((p) => p.entidadId === pata.entidadId).length > 1
      ) {
        ang += (indice === 0 ? -1 : 1) * 0.34
      }

      const desde = borde(nodoRel, ang)
      const hasta = borde(nodoEnt, ang + Math.PI)

      // La etiqueta va del lado de la entidad, a distancia fija del borde y
      // corrida en perpendicular. Con una fraccion del segmento quedaba adentro
      // de la caja cuando el rombo y la entidad estaban cerca.
      const largo = Math.hypot(hasta.x - desde.x, hasta.y - desde.y) || 1
      const ux = (hasta.x - desde.x) / largo
      const uy = (hasta.y - desde.y) / largo
      const retroceso = Math.min(30, largo * 0.45)
      const cardPos = {
        x: hasta.x - ux * retroceso - uy * 8,
        y: hasta.y - uy * retroceso + ux * 8 + 3,
      }

      // ¿Esta entidad usa esta relacion como identificador externo?
      const idExterno = modelo.identificadores.some(
        (i) =>
          i.entidadesExternasIds.includes(pata.entidadId) &&
          rel.patas.some((p) => p.entidadId === i.entidadId),
      )

      conectores.push({
        relacionId: rel.id,
        entidadId: pata.entidadId,
        desde,
        hasta,
        cardinalidad: `(${pata.cardMin},${pata.cardMax})`,
        cardPos,
        // El texto tiene que crecer hacia el rombo, o se mete abajo de la caja
        // de la entidad: se ancla segun `-u`, la direccion de vuelta al rombo.
        cardAnclaje: anclajePara(-ux),
        idExterno,
        puntoExterno: {
          x: desde.x + (hasta.x - desde.x) * 0.5,
          y: desde.y + (hasta.y - desde.y) * 0.5,
        },
      })
    })
  }

  // --- jerarquias ---------------------------------------------------------
  const jerarquias: FigJerarquia[] = []
  for (const j of modelo.jerarquias) {
    if (j.hijosIds.length === 0) continue
    const padre = buscar({ tipo: 'entidad', id: j.padreId })
    if (!padre) continue
    const hijos = j.hijosIds
      .map((h) => buscar({ tipo: 'entidad', id: h }))
      .filter((n): n is FigNodo => !!n)
    if (hijos.length === 0) continue

    const yBus = Math.max(
      padre.centro.y + padre.alto / 2 + SEPARACION_JERARQUIA,
      Math.min(...hijos.map((h) => h.centro.y - h.alto / 2)) - SEPARACION_JERARQUIA,
    )
    const xs = hijos.map((h) => h.centro.x)
    const xMin = Math.min(...xs, padre.centro.x)
    const xMax = Math.max(...xs, padre.centro.x)

    jerarquias.push({
      id: j.id,
      vertPadre: [
        { x: padre.centro.x, y: padre.centro.y + padre.alto / 2 },
        { x: padre.centro.x, y: yBus },
      ],
      bus: [
        { x: xMin, y: yBus },
        { x: xMax, y: yBus },
      ],
      vertHijos: hijos.map((h) => [
        { x: h.centro.x, y: yBus },
        { x: h.centro.x, y: h.centro.y - h.alto / 2 },
      ]),
      etiqueta: coberturaAbreviatura(j.cobertura),
      etiquetaPos: { x: padre.centro.x + 8, y: yBus - 6 },
    })
  }

  return { nodos, atributos, compuestos, arcos, conectores, jerarquias, caja: caja(nodos, atributos, compuestos, jerarquias) }
}

/** Caja que contiene todo el dibujo, con margen. */
function caja(
  nodos: FigNodo[],
  atributos: FigPuntoAtributo[],
  compuestos: FigCompuesto[],
  jerarquias: FigJerarquia[],
): Layout['caja'] {
  const xs: number[] = []
  const ys: number[] = []

  const sumar = (p: Punto, holgura = 0) => {
    xs.push(p.x - holgura, p.x + holgura)
    ys.push(p.y - holgura, p.y + holgura)
  }

  for (const n of nodos) {
    xs.push(n.centro.x - n.ancho / 2, n.centro.x + n.ancho / 2)
    ys.push(n.centro.y - n.alto / 2, n.centro.y + n.alto / 2)
  }
  // Los nombres de atributo son lo que mas se escapa hacia los costados.
  for (const a of atributos) sumar(a.texto, a.nombre.length * CHAR)
  for (const c of compuestos) {
    sumar(c.centro, Math.max(c.rx, c.nombre.length * CHAR * 0.6))
    for (const h of c.hijos) sumar(h.texto, h.nombre.length * CHAR)
  }
  for (const j of jerarquias) {
    sumar(j.bus[0])
    sumar(j.bus[1])
    for (const v of j.vertHijos) sumar(v[1])
  }

  if (xs.length === 0) return { x: 0, y: 0, ancho: 900, alto: 560 }

  const margen = 52
  const x = Math.min(...xs) - margen
  const y = Math.min(...ys) - margen
  return {
    x,
    y,
    ancho: Math.max(420, Math.max(...xs) + margen - x),
    alto: Math.max(300, Math.max(...ys) + margen - y),
  }
}

/** Resumen textual de una entidad, para el arbol. */
export function resumenEntidad(modelo: Modelo, entidadId: Id): string {
  const atrs = atributosDeEntidad(modelo, entidadId)
  const claves = identificadoresDe(modelo, entidadId).length
  const partes: string[] = []
  if (atrs.length > 0) partes.push(`${atrs.length} atr`)
  if (claves > 0) partes.push(`${claves} id`)
  return partes.join(' · ')
}

/** Orden estable para listar entidades y relaciones. */
export function porCreacion<T extends { id: Id }>(items: T[]): T[] {
  return [...items].sort((a, b) => ordenCreacion(a.id) - ordenCreacion(b.id))
}

/** Nombre de una entidad, o "?" si ya no existe. */
export function nombreEntidad(modelo: Modelo, id: Id): string {
  return entidad(modelo, id)?.nombre ?? '?'
}
