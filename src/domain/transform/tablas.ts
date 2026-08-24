/**
 * Paso 2 del pasaje a fisico: paso a tablas.
 *
 * Espeja `Relacion.armarTabla` / `Entidad.armarTabla` y los textos explicativos
 * que el original muestra en cada transformacion.
 *
 * NOTA SOBRE FIDELIDAD
 * --------------------
 * El Java original resuelve esto con ramas superpuestas y varias condiciones
 * muertas (`variosN`, `unoNaCeroUno` con un `||` donde iba `&&`, y una tabla N:M
 * cuya clave primaria es un subrogado `id_<relacion>` mientras su propio texto
 * explicativo dice que la clave es la combinacion de las claves de ambas
 * entidades). Aca se implementa una matriz de cardinalidades completa y
 * consistente, siguiendo las reglas estandar de pasaje ER -> relacional que son
 * las que los textos del propio CasER describen. Los textos se reutilizan tal
 * cual.
 *
 * En esta notacion la cardinalidad escrita junto a una entidad cuenta en cuantas
 * instancias de la relacion participa cada ocurrencia de esa entidad. Por eso en
 * una 1:N el lado con maxima 1 es el que recibe la clave ajena.
 */

import type { Id, Modelo, Pata, Relacion, TablaFisica } from '../types'
import type { Bitacora } from '../log'
import { registrar } from '../log'
import { atributosDeEntidad, camposClave, entidad, identificadoresDe } from '../queries'

/** Un paso narrado del pasaje a tablas, para el modo "paso a paso". */
export interface PasoTabla {
  titulo: string
  descripcion: string
  /** Tablas que quedan definidas despues de este paso. */
  tablas: TablaFisica[]
}

export interface ResultadoFisico {
  tablas: TablaFisica[]
  pasos: PasoTabla[]
  bitacora: Bitacora
}

// ---------------------------------------------------------------------------
// Acumulador de tablas — `modelo/TablasFisicoDibujar.java`
// ---------------------------------------------------------------------------

class Tablas {
  private lista: TablaFisica[] = []
  /**
   * Entidades que ya quedaron representadas por alguna tabla. Hace falta
   * llevarlo aparte del nombre de la tabla: en la fusion (1,1)-(1,1) las dos
   * entidades caen en una sola tabla, y la absorbida no debe volver a aparecer
   * como tabla propia en el barrido final.
   */
  private representadas = new Set<Id>()

  marcarRepresentada(...ids: Id[]): void {
    for (const id of ids) this.representadas.add(id)
  }

  estaRepresentada(id: Id): boolean {
    return this.representadas.has(id)
  }

  existe(nombre: string): boolean {
    return this.lista.some((t) => t.nombre === nombre)
  }

  buscar(nombre: string): TablaFisica | undefined {
    return this.lista.find((t) => t.nombre === nombre)
  }

  guardar(t: TablaFisica): void {
    if (!this.existe(t.nombre)) this.lista.push(t)
  }

  /** Suma campos a una tabla existente, sin duplicar nombres. */
  sumarCampos(nombre: string, campos: string[], foraneas: string[] = []): void {
    const t = this.buscar(nombre)
    if (!t) return
    for (const c of campos) {
      if (!t.claves.includes(c) && !t.campos.includes(c)) t.campos.push(c)
    }
    for (const f of foraneas) {
      if (!t.foraneas.includes(f)) t.foraneas.push(f)
    }
  }

  snapshot(): TablaFisica[] {
    return structuredClone(this.lista)
  }

  todas(): TablaFisica[] {
    return this.lista
  }
}

// ---------------------------------------------------------------------------
// Entidad -> tabla — `Entidad.armarTabla`
// ---------------------------------------------------------------------------

/**
 * Clave primaria de una entidad.
 * Si nacio de un atributo polivalente, su clave es el nombre de ese atributo
 * (`Entidad.tomoIds` mira `nacioDeAtrPoli`). Si no tiene identificador, se le
 * genera `id_<entidad>`.
 */
function clavesDeEntidad(m: Modelo, entidadId: Id): string[] {
  const e = entidad(m, entidadId)
  if (!e) return []
  if (e.nacioDeAtrPoli) return [e.nacioDeAtrPoli]
  const claves = camposClave(m, entidadId)
  return claves.length > 0 ? claves : [`id_${e.nombre}`]
}

/** Atributos no identificatorios de la entidad, como campos. */
function camposDeEntidad(m: Modelo, entidadId: Id): string[] {
  return atributosDeEntidad(m, entidadId)
    .filter((a) => a.tipo !== 'identificador')
    .map((a) => a.nombre)
}

/**
 * Claves candidatas: los identificadores mas alla del primero pasan a campos
 * (`Entidad.pongoClavesCandidatasComoCampos`).
 */
function clavesCandidatas(m: Modelo, entidadId: Id): string[] {
  return identificadoresDe(m, entidadId)
    .slice(1)
    .map((i) => i.nombre)
}

function atributosDeRelacion(m: Modelo, relacionId: Id): string[] {
  return m.atributos
    .filter((a) => a.propietario.tipo === 'relacion' && a.propietario.id === relacionId)
    .map((a) => a.nombre)
}

/** Desambigua nombres repetidos dentro de una misma tabla. */
function sinRepetir(campos: string[], sufijos: Record<string, string> = {}): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const c of campos) {
    if (!vistos.has(c)) {
      vistos.add(c)
      salida.push(c)
      continue
    }
    const base = sufijos[c] ? `${c}_${sufijos[c]}` : `${c}_2`
    let candidato = base
    let i = 2
    while (vistos.has(candidato)) candidato = `${base}_${i++}`
    vistos.add(candidato)
    salida.push(candidato)
  }
  return salida
}

function tablaDeEntidad(m: Modelo, entidadId: Id, descripcion = ''): TablaFisica {
  const e = entidad(m, entidadId)!
  const claves = clavesDeEntidad(m, entidadId)
  const campos = [...camposDeEntidad(m, entidadId), ...clavesCandidatas(m, entidadId)].filter(
    (c) => !claves.includes(c),
  )
  return {
    nombre: e.nombre,
    claves,
    campos: sinRepetir(campos),
    descripcion,
    foraneas: [],
  }
}

// ---------------------------------------------------------------------------
// Clasificacion de una relacion binaria
// ---------------------------------------------------------------------------

export type TipoPasaje =
  | 'recursiva'
  | 'fusion_1a1'
  | 'uno_a_uno_opcional'
  | 'uno_a_n'
  | 'n_a_m'
  | 'ternaria'

export function clasificar(rel: Relacion): TipoPasaje {
  if (rel.patas.length >= 3) return 'ternaria'
  const [p1, p2] = rel.patas
  if (p1.entidadId === p2.entidadId) return 'recursiva'

  const nn = p1.cardMax === 'n' && p2.cardMax === 'n'
  if (nn) return 'n_a_m'

  const unaN = p1.cardMax === 'n' || p2.cardMax === 'n'
  if (unaN) return 'uno_a_n'

  // Ambas maximas en 1.
  const ambasObligatorias = p1.cardMin === '1' && p2.cardMin === '1'
  return ambasObligatorias ? 'fusion_1a1' : 'uno_a_uno_opcional'
}

function card(p: Pata): string {
  return `(${p.cardMin},${p.cardMax})`
}

// ---------------------------------------------------------------------------
// Pasaje completo
// ---------------------------------------------------------------------------

/**
 * Calcula todas las tablas del modelo fisico y la narracion paso a paso.
 *
 * El resultado no depende del modo elegido: en el original la opcion A y la B
 * generan las mismas tablas y solo difieren en que la B va mostrando el texto de
 * cada transformacion. Aca se devuelven las tablas y la lista de pasos, y la UI
 * decide si narra o no.
 */
export function pasarATablas(modelo: Modelo, bitacora: Bitacora): ResultadoFisico {
  const tablas = new Tablas()
  const pasos: PasoTabla[] = []
  let log = bitacora

  const anotar = (titulo: string, descripcion: string) => {
    pasos.push({ titulo, descripcion, tablas: tablas.snapshot() })
    log = registrar(log, 'tablas', descripcion)
  }

  /** Guarda la tabla de una entidad y la marca como ya representada. */
  const guardarEntidad = (entidadId: Id, descripcion = '') => {
    tablas.guardar(tablaDeEntidad(modelo, entidadId, descripcion))
    tablas.marcarRepresentada(entidadId)
  }

  // --- Relaciones, en orden de creacion -----------------------------------
  for (const rel of modelo.relaciones) {
    const tipo = clasificar(rel)
    const atributosRel = atributosDeRelacion(modelo, rel.id)

    switch (tipo) {
      case 'fusion_1a1': {
        const [p1, p2] = rel.patas
        const e1 = entidad(modelo, p1.entidadId)!
        const e2 = entidad(modelo, p2.entidadId)!
        const t1 = tablaDeEntidad(modelo, e1.id)
        const t2 = tablaDeEntidad(modelo, e2.id)
        const descripcion =
          `Transformación de la relación ${rel.nombre} (1,1) a (1,1): las dos entidades ` +
          `participan con cardinalidad máxima y mínima igual a uno. Las entidades ` +
          `${e1.nombre} y ${e2.nombre} se transforman en una sola tabla. Se toma el ` +
          `identificador de una de las dos entidades como identificador de la tabla.`

        tablas.guardar({
          nombre: e1.nombre,
          claves: t1.claves,
          campos: sinRepetir(
            [...t1.campos, ...t2.claves, ...t2.campos, ...atributosRel],
            { [t2.claves[0] ?? '']: e2.nombre },
          ).filter((c) => !t1.claves.includes(c)),
          descripcion,
          foraneas: [],
        })
        // Las dos entidades quedan en esta única tabla.
        tablas.marcarRepresentada(e1.id, e2.id)
        anotar(`Relación ${rel.nombre} — (1,1) a (1,1)`, descripcion)
        break
      }

      case 'uno_a_uno_opcional': {
        // Dos tablas. El lado de participacion opcional recibe la clave del otro
        // como clave ajena (`Relacion.armarTablapasoIdde1`).
        const [p1, p2] = rel.patas
        const opcional = p1.cardMin === '0' ? p1 : p2
        const obligatorio = opcional === p1 ? p2 : p1
        const eOpc = entidad(modelo, opcional.entidadId)!
        const eObl = entidad(modelo, obligatorio.entidadId)!

        guardarEntidad(eObl.id)
        const clavesObl = clavesDeEntidad(modelo, eObl.id)
        const descripcion =
          `Transformación de la relación ${rel.nombre} ${card(opcional)} a ` +
          `${card(obligatorio)}: cada entidad se transforma en una tabla. El identificador ` +
          `de ${eObl.nombre} pasa como Clave foránea a la tabla de ${eOpc.nombre}.`

        const base = tablaDeEntidad(modelo, eOpc.id, descripcion)
        const foraneas = clavesObl.filter((c) => !base.claves.includes(c))
        tablas.guardar({
          ...base,
          campos: sinRepetir([...base.campos, ...foraneas, ...atributosRel]),
          foraneas,
        })
        if (tablas.buscar(eOpc.nombre) && tablas.buscar(eOpc.nombre)!.descripcion === '') {
          tablas.sumarCampos(eOpc.nombre, foraneas, foraneas)
        }
        tablas.marcarRepresentada(eOpc.id)
        anotar(
          `Relación ${rel.nombre} — ${card(opcional)} a ${card(obligatorio)}`,
          descripcion,
        )
        break
      }

      case 'uno_a_n': {
        // El lado con maxima 1 recibe la clave del lado con maxima n.
        const [p1, p2] = rel.patas
        const lado1 = p1.cardMax === '1' ? p1 : p2
        const ladoN = lado1 === p1 ? p2 : p1
        const e1 = entidad(modelo, lado1.entidadId)!
        const eN = entidad(modelo, ladoN.entidadId)!

        guardarEntidad(eN.id)
        const clavesN = clavesDeEntidad(modelo, eN.id)
        const descripcion =
          `Transformación de la relación ${rel.nombre} ${card(lado1)} a ${card(ladoN)}: ` +
          `cada ${eN.nombre} puede tener múltiples ${e1.nombre}, sin embargo cada ` +
          `${e1.nombre} se vincula con a lo sumo un ${eN.nombre}. Entonces se puede ` +
          `incorporar el identificador de ${eN.nombre} como un atributo más de ` +
          `${e1.nombre}, estableciendo el vínculo sin necesidad de generar otra tabla. ` +
          `Este atributo queda como Clave foránea en ${e1.nombre}.`

        const base = tablaDeEntidad(modelo, e1.id, descripcion)
        const foraneas = clavesN
          .filter((c) => !base.claves.includes(c))
          .map((c) => (base.campos.includes(c) ? `${c}_${eN.nombre}` : c))
        if (tablas.existe(e1.nombre)) {
          tablas.sumarCampos(e1.nombre, [...foraneas, ...atributosRel], foraneas)
        } else {
          tablas.guardar({
            ...base,
            campos: sinRepetir([...base.campos, ...foraneas, ...atributosRel]),
            foraneas,
          })
        }
        tablas.marcarRepresentada(e1.id)
        anotar(`Relación ${rel.nombre} — ${card(lado1)} a ${card(ladoN)}`, descripcion)
        break
      }

      case 'n_a_m':
      case 'recursiva': {
        const [p1, p2] = rel.patas
        const e1 = entidad(modelo, p1.entidadId)!
        const e2 = entidad(modelo, p2.entidadId)!

        guardarEntidad(e1.id)
        if (e1.id !== e2.id) guardarEntidad(e2.id)

        const claves1 = clavesDeEntidad(modelo, e1.id)
        const claves2 = clavesDeEntidad(modelo, e2.id)
        // En una recursiva ambos lados aportan la misma clave: hay que
        // distinguirlas por rol, o la tabla tendria una sola columna.
        const claves =
          e1.id === e2.id
            ? [...claves1.map((c) => `${c}_1`), ...claves2.map((c) => `${c}_2`)]
            : sinRepetir([...claves1, ...claves2], {
                [claves2[0] ?? '']: e2.nombre,
              })

        const descripcion =
          tipo === 'recursiva'
            ? `Transformación de la relación recursiva ${rel.nombre} ${card(p1)} a ` +
              `${card(p2)}: se crea una tabla nueva llamada ${rel.nombre}, cuya clave es la ` +
              `combinación de dos referencias al identificador de ${e1.nombre}, una por cada ` +
              `rol de la relación, más los atributos de la relación.`
            : `Transformación de la relación ${rel.nombre} ${card(p1)} a ${card(p2)}: se crea ` +
              `una tabla nueva llamada ${rel.nombre} que tiene como identificador la ` +
              `combinación de atributos que constituyen las claves primarias de las entidades ` +
              `${e1.nombre} y ${e2.nombre}, y los atributos de la relación.`

        tablas.guardar({
          nombre: rel.nombre,
          claves,
          campos: sinRepetir(atributosRel),
          descripcion,
          foraneas: claves,
        })
        anotar(`Relación ${rel.nombre} — ${card(p1)} a ${card(p2)}`, descripcion)
        break
      }

      case 'ternaria': {
        const entidades = rel.patas.map((p) => entidad(modelo, p.entidadId)!)
        for (const e of entidades) guardarEntidad(e.id)

        const claves = sinRepetir(
          entidades.flatMap((e) => clavesDeEntidad(modelo, e.id)),
          Object.fromEntries(
            entidades.flatMap((e) => clavesDeEntidad(modelo, e.id).map((c) => [c, e.nombre])),
          ),
        )
        const descripcion =
          `Transformación de la relación ternaria ${rel.nombre}: se construye una nueva tabla ` +
          `correspondiente a la relación y se toma como identificador los identificadores de ` +
          `las tres entidades (${entidades.map((e) => e.nombre).join(', ')}), más los ` +
          `atributos de la relación.`

        tablas.guardar({
          nombre: rel.nombre,
          claves,
          campos: sinRepetir(atributosRel),
          descripcion,
          foraneas: claves,
        })
        anotar(`Relación ternaria ${rel.nombre}`, descripcion)
        break
      }
    }
  }

  // --- Entidades que todavia no tienen tabla ------------------------------
  // `PasarAFisico.pasoEntidadesAtabla()`
  const sueltas = modelo.entidades.filter(
    (e) => !tablas.estaRepresentada(e.id) && !tablas.existe(e.nombre),
  )
  for (const e of sueltas) {
    guardarEntidad(
      e.id,
      `La entidad ${e.nombre} se transforma en una tabla con clave principal su identificador.`,
    )
  }
  if (sueltas.length > 0) {
    anotar(
      'Entidades restantes',
      `Las entidades ${sueltas
        .map((e) => e.nombre)
        .join(', ')} se transforman en tablas con clave principal su identificador.`,
    )
  }

  if (tablas.todas().length === 0) {
    log = registrar(log, 'tablas', 'No se generaron tablas: el modelo lógico está vacío.')
  }

  return { tablas: tablas.snapshot(), pasos, bitacora: log }
}
