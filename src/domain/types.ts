/**
 * Modelo de dominio de CasER 2.0.
 *
 * Espeja el modelo Java original (`trabajodegrado.modelo.*`) pero normalizado y
 * plano: todo se referencia por id y las colecciones son arrays, para que las
 * transformaciones sean funciones puras `(modelo, decision) => modelo` y el
 * "Deshacer paso" se resuelva guardando snapshots.
 *
 * Los arrays preservan el orden de creacion, que importa: los controladores del
 * original iteran el diagrama en orden y procesan el primer objeto que
 * encuentran en cada paso.
 */

export type Id = string

export interface Punto {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Estado del modelo — `modelo/TipoDiagrama.java` y subclases
// ---------------------------------------------------------------------------

/**
 * MCAN  modelo conceptual en construccion (arranque)
 * MCdef modelo conceptual finalizado — habilita el pasaje a logico
 * MLAN  pasaje a logico comenzado o terminado
 * MFAN  pasaje a fisico terminado
 */
export type EstadoModelo = 'MCAN' | 'MCdef' | 'MLAN' | 'MFAN'

// ---------------------------------------------------------------------------
// Cardinalidad — `modelo/Cardinalidad.java`, Monovalente / Polivalente
// ---------------------------------------------------------------------------

export type CardMin = '0' | '1'
export type CardMax = '1' | 'n'

/**
 * Un atributo es polivalente cuando su cardinalidad maxima es mayor que 1.
 * `modelo/Polivalente.java`: "Si card_max (A,E)>1 el atributo es polivalente".
 */
export function esPolivalente(cardMax: CardMax): boolean {
  return cardMax === 'n'
}

// ---------------------------------------------------------------------------
// Cobertura de jerarquia — `modelo/Cobertura.java` y subclases
// ---------------------------------------------------------------------------

export type Cobertura = 'TE' | 'TS' | 'PE' | 'PS'

export const COBERTURAS: { valor: Cobertura; nombre: string; abreviatura: string }[] = [
  { valor: 'TE', nombre: 'Total Exclusiva', abreviatura: '(T,E)' },
  { valor: 'TS', nombre: 'Total Superpuesta', abreviatura: '(T,S)' },
  { valor: 'PE', nombre: 'Parcial Exclusiva', abreviatura: '(P,E)' },
  { valor: 'PS', nombre: 'Parcial Superpuesta', abreviatura: '(P,S)' },
]

export function coberturaNombre(c: Cobertura): string {
  return COBERTURAS.find((x) => x.valor === c)!.nombre
}

export function coberturaAbreviatura(c: Cobertura): string {
  return COBERTURAS.find((x) => x.valor === c)!.abreviatura
}

/** Cobertura total: habilita la opcion C (eliminar el padre) al bajar la jerarquia. */
export function esCoberturaTotal(c: Cobertura): boolean {
  return c === 'TE' || c === 'TS'
}

// ---------------------------------------------------------------------------
// Propietario de un atributo — `modelo/Elemento.java`
// ---------------------------------------------------------------------------

export type TipoPropietario = 'entidad' | 'relacion' | 'compuesto'

export interface RefPropietario {
  tipo: TipoPropietario
  id: Id
}

/**
 * Lo que puede estar seleccionado en el diagrama o el arbol.
 *
 * Es `RefPropietario` mas los atributos simples e identificadores, que no pueden
 * ser propietarios de nada pero si se seleccionan para editarlos o borrarlos.
 * Un atributo compuesto se referencia como `'compuesto'`, porque ademas de
 * atributo es propietario de sus hijos.
 */
export type RefSeleccion = RefPropietario | { tipo: 'atributo'; id: Id }

/** true si la referencia puede ser propietaria de atributos. */
export function esPropietario(ref: RefSeleccion): ref is RefPropietario {
  return ref.tipo !== 'atributo'
}

// ---------------------------------------------------------------------------
// Objetos del modelo conceptual
// ---------------------------------------------------------------------------

export interface Entidad {
  id: Id
  nombre: string
  pos: Punto
  /**
   * Si la entidad nacio de eliminar un atributo polivalente, guarda el nombre
   * de ese atributo. `Entidad.tomoIds` lo usa como clave primaria en el pasaje
   * a tablas en lugar de buscar identificadores.
   */
  nacioDeAtrPoli?: string
}

/** Una pata de la relacion — `modelo/ConectorRelacion.java`. */
export interface Pata {
  entidadId: Id
  cardMin: CardMin
  cardMax: CardMax
}

export interface Relacion {
  id: Id
  nombre: string
  pos: Punto
  /** Dos patas (binaria) o tres (ternaria). CasER no contempla 4-narias. */
  patas: Pata[]
}

/**
 * Tipo de atributo — `modelo/TipoAtributo.java`.
 *  simple        atributo comun
 *  identificador atributo que identifica a su entidad (identificador simple)
 *  compuesto     atributo que agrupa otros atributos
 */
export type TipoAtributo = 'simple' | 'identificador' | 'compuesto'

export interface Atributo {
  id: Id
  nombre: string
  propietario: RefPropietario
  tipo: TipoAtributo
  cardMin: CardMin
  cardMax: CardMax
  /** Posicion relativa al propietario, para dibujar. */
  angulo?: number
}

/**
 * Identificador de una entidad — `modelo/identificadores/*`.
 * Si `entidadesExternasIds` no esta vacio, es un identificador externo.
 */
export interface Identificador {
  id: Id
  entidadId: Id
  nombre: string
  compuesto: boolean
  atributoIds: Id[]
  entidadesExternasIds: Id[]
}

/** Jerarquia padre/hijos — `modelo/RelacionJerarquia.java`. */
export interface Jerarquia {
  id: Id
  padreId: Id
  hijosIds: Id[]
  cobertura: Cobertura
}

// ---------------------------------------------------------------------------
// Modelo fisico — `modelo/TablaFisico.java`
// ---------------------------------------------------------------------------

export interface TablaFisica {
  nombre: string
  /** Clave primaria: uno o mas campos. */
  claves: string[]
  campos: string[]
  /** Texto explicativo de la transformacion que la genero. */
  descripcion: string
  /** Campos que son clave foranea, para marcarlos en la vista. */
  foraneas: string[]
}

// ---------------------------------------------------------------------------
// Modelo completo
// ---------------------------------------------------------------------------

export interface Modelo {
  /** Texto de la especificacion del problema. */
  spec: string
  estado: EstadoModelo
  entidades: Entidad[]
  relaciones: Relacion[]
  atributos: Atributo[]
  identificadores: Identificador[]
  jerarquias: Jerarquia[]
  /** Tablas del modelo fisico, vacio hasta el pasaje a fisico. */
  tablas: TablaFisica[]
  /** Contador para generar ids estables y deterministas. */
  seq: number
}

export function modeloVacio(): Modelo {
  return {
    spec: '',
    estado: 'MCAN',
    entidades: [],
    relaciones: [],
    atributos: [],
    identificadores: [],
    jerarquias: [],
    tablas: [],
    seq: 0,
  }
}

// ---------------------------------------------------------------------------
// Decisiones del usuario en el pasaje
// ---------------------------------------------------------------------------

/** Opciones de eliminacion de atributo compuesto — `AddOpcionesEliminarAtrCompuesto`. */
export type OpcionCompuesto = 'A' | 'B' | 'C'

/** Opciones de eliminacion de jerarquia — `AddopcionJerarquiaMHoDT(oMP)`. */
export type OpcionJerarquia = 'A' | 'B' | 'C'

/** Modo del pasaje a fisico — `EleccionPasajeFisico`. */
export type ModoFisico = 'A' | 'B'

// ---------------------------------------------------------------------------
// Pipeline de pasaje
// ---------------------------------------------------------------------------

export type PasoLogico = 'compuestos' | 'polivalentes' | 'jerarquias' | 'fin'

/** Un item de la ventana Progreso — `actions/ContadorLogico.java`. */
export interface ItemProgreso {
  clase: 'compuesto' | 'polivalente' | 'jerarquia'
  /** Etiqueta a mostrar, p.ej. "direccion (persona)". */
  etiqueta: string
  eliminado: boolean
}

export interface EstadoPipeline {
  /** true una vez que se presiono "Comenzar pasaje a Modelo Logico". */
  iniciado: boolean
  paso: PasoLogico
  /** Pasos cuyo mensaje "Paso N: ..." ya se mostro. */
  anunciados: PasoLogico[]
  /** Snapshot tomado al iniciar el pasaje logico, con tick/cruz por item. */
  progreso: ItemProgreso[]
  /** true cuando el pasaje logico termino — habilita el pasaje a fisico. */
  finLogico: boolean
  /** true cuando el pasaje fisico termino. */
  finFisico: boolean
}

export function pipelineInicial(): EstadoPipeline {
  return {
    iniciado: false,
    paso: 'compuestos',
    anunciados: [],
    progreso: [],
    finLogico: false,
    finFisico: false,
  }
}
