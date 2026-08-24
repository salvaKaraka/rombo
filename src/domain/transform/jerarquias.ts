/**
 * Paso 3 del pasaje a logico: eliminacion de jerarquias.
 *
 * Espeja `Entidad.decideJerarquia` y sus tres caminos: `matoHijos` (A),
 * `dejoTodo` (B) y `matoPadre` (C). Las opciones disponibles las decide
 * `queries.opcionesJerarquia`: cobertura Total ofrece A/B/C, Parcial solo A/B, y
 * si algun hijo es padre de otra jerarquia se fuerza B.
 */

import type { Jerarquia, Modelo, OpcionJerarquia } from '../types'
import type { Bitacora } from '../log'
import { registrar } from '../log'
import { coberturaNombre } from '../types'
import {
  agregarAtributo,
  agregarIdentificador,
  agregarRelacion,
  copiarAtributo,
  editar,
  quitarEntidad,
  quitarJerarquia,
} from '../edits'
import {
  atributosDeEntidad,
  camposClave,
  entidad,
  etiquetaJerarquia,
  identificadoresDe,
  nombresHijos,
  relacionesDeEntidad,
} from '../queries'
import type { ResultadoPaso } from './compuestos'

/** Nombre del atributo discriminante que crea la opcion A. */
export const ATRIBUTO_DISCRIMINANTE = 'categoria'

export function eliminarJerarquia(
  modelo: Modelo,
  bitacora: Bitacora,
  jerarquia: Jerarquia,
  opcion: OpcionJerarquia,
): ResultadoPaso {
  const etiqueta = etiquetaJerarquia(modelo, jerarquia)
  const padreNombre = entidad(modelo, jerarquia.padreId)?.nombre ?? '?'

  let log = registrar(
    bitacora,
    'jerarquias',
    'La jerarquía que se va a eliminar está formada por las siguientes entidades: ' +
      `${padreNombre.toUpperCase()} / ${nombresHijos(modelo, jerarquia).toUpperCase()}.`,
  )
  log = registrar(
    log,
    'jerarquias',
    `La jerarquía tiene cobertura ${coberturaNombre(jerarquia.cobertura)}.`,
  )

  switch (opcion) {
    case 'A':
      log = registrar(log, 'jerarquias', 'Se toma la decisión de eliminar a los hijos.', true)
      return { modelo: matoHijos(modelo, jerarquia), bitacora: log }
    case 'B':
      log = registrar(
        log,
        'jerarquias',
        'Se toma la decisión de conservar todas las entidades. Por lo tanto se generan ' +
          `nuevas relaciones ES_UN entre ${padreNombre.toUpperCase()} y cada uno de sus hijos.`,
        true,
      )
      return { modelo: dejoTodo(modelo, jerarquia), bitacora: log }
    case 'C':
      log = registrar(
        log,
        'jerarquias',
        `Se toma la decisión de eliminar al padre (${padreNombre.toUpperCase()}). Sus atributos, ` +
          'identificador y relaciones se incluyen en cada uno de los hijos.',
        true,
      )
      return { modelo: matoPadre(modelo, jerarquia), bitacora: log }
  }
  // Inalcanzable, pero deja explicito que `etiqueta` participa del log de errores.
  throw new Error(`Opción inválida para la jerarquía ${etiqueta}`)
}

// ---------------------------------------------------------------------------
// Opcion A — `Entidad.matoHijos`
// ---------------------------------------------------------------------------

/**
 * Elimina las entidades hijas y deja solo el padre, que absorbe sus atributos.
 *
 * - Crea el atributo discriminante `categoria` (1,1) en el padre.
 * - Los atributos de los hijos suben al padre con cardinalidad (0,1): pasan a
 *   ser opcionales, porque solo aplican a algunas ocurrencias.
 * - Los identificadores de los hijos suben como atributos simples: dejan de
 *   identificar, ya que la clave pasa a ser la del padre.
 * - Las relaciones de los hijos se recrean contra el padre, relajando la
 *   cardinalidad minima del lado del padre a 0.
 */
function matoHijos(modelo: Modelo, jerarquia: Jerarquia): Modelo {
  return editar(modelo, (m) => {
    const padreId = jerarquia.padreId
    const padreNombre = entidad(m, padreId)?.nombre ?? 'padre'

    agregarAtributo(m, {
      nombre: ATRIBUTO_DISCRIMINANTE,
      propietario: { tipo: 'entidad', id: padreId },
      tipo: 'simple',
      cardMin: '1',
      cardMax: '1',
    })

    for (const hijoId of [...jerarquia.hijosIds]) {
      // Atributos del hijo al padre, opcionales.
      for (const a of atributosDeEntidad(m, hijoId)) {
        copiarAtributo(
          m,
          a,
          { tipo: 'entidad', id: padreId },
          {
            // Un identificador del hijo deja de ser clave al subir.
            tipo: a.tipo === 'identificador' ? 'simple' : a.tipo,
            cardMin: '0',
            cardMax: '1',
          },
        )
      }

      // Relaciones del hijo, recreadas contra el padre.
      for (const rel of relacionesDeEntidad(m, hijoId)) {
        const patasNuevas = rel.patas.map((p) =>
          p.entidadId === hijoId
            ? // Del lado del padre la participacion pasa a ser opcional.
              { entidadId: padreId, cardMin: '0' as const, cardMax: p.cardMax }
            : { ...p },
        )
        // Evita duplicar si el padre ya participaba de esa misma relacion.
        const yaExiste = m.relaciones.some(
          (r) =>
            r.id !== rel.id &&
            r.nombre === `${padreNombre}_${rel.nombre}`.toLowerCase(),
        )
        if (!yaExiste) {
          agregarRelacion(m, `${padreNombre}_${rel.nombre}`.toLowerCase(), patasNuevas)
        }
      }

      quitarEntidad(m, hijoId)
    }

    quitarJerarquia(m, jerarquia.id)
  })
}

// ---------------------------------------------------------------------------
// Opcion B — `Entidad.dejoTodo`
// ---------------------------------------------------------------------------

/**
 * Conserva todas las entidades y convierte la jerarquia en relaciones uno a uno.
 * `Entidad.creoRelacionEntrePadreHijo`: (0,1) del lado del padre, (1,1) del hijo
 * — el hijo siempre es tambien un padre, el padre no siempre es ese hijo.
 */
function dejoTodo(modelo: Modelo, jerarquia: Jerarquia): Modelo {
  return editar(modelo, (m) => {
    for (const hijoId of jerarquia.hijosIds) {
      const hijoNombre = entidad(m, hijoId)?.nombre ?? 'hijo'
      agregarRelacion(m, `es_un_${hijoNombre}`.toLowerCase(), [
        { entidadId: jerarquia.padreId, cardMin: '0', cardMax: '1' },
        { entidadId: hijoId, cardMin: '1', cardMax: '1' },
      ])
    }
    quitarJerarquia(m, jerarquia.id)
  })
}

// ---------------------------------------------------------------------------
// Opcion C — `Entidad.matoPadre` / `pasoIdAtrRelPadreAHijos`
// ---------------------------------------------------------------------------

/**
 * Elimina el padre y deja solo las especializaciones.
 *
 * Cada hijo recibe el identificador del padre (que pasa a formar su clave junto
 * con la propia), sus atributos y sus relaciones. Solo aplica a cobertura Total:
 * con cobertura Parcial habria ocurrencias del padre sin hijo y se perderia
 * informacion.
 *
 * El original arma entidades nuevas con el nombre de cada hijo y despues borra
 * las viejas; aca se enriquece el hijo en su lugar, que es el mismo resultado
 * observable y no reordena el diagrama.
 */
function matoPadre(modelo: Modelo, jerarquia: Jerarquia): Modelo {
  return editar(modelo, (m) => {
    const padreId = jerarquia.padreId
    const clavesPadre = camposClave(m, padreId)
    const atributosPadre = atributosDeEntidad(m, padreId)
    const relacionesPadre = relacionesDeEntidad(m, padreId)

    for (const hijoId of [...jerarquia.hijosIds]) {
      const hijoNombre = entidad(m, hijoId)?.nombre ?? 'hijo'

      // Atributos del padre al hijo, conservando tipo y cardinalidad.
      // Los identificadores del padre llegan como identificadores del hijo.
      const idsCopiados: string[] = []
      for (const a of atributosPadre) {
        const nuevo = copiarAtributo(m, a, { tipo: 'entidad', id: hijoId })
        if (a.tipo === 'identificador') idsCopiados.push(nuevo)
      }

      // Clave del hijo = clave heredada del padre + la que ya tenia.
      const idsPropios = identificadoresDe(m, hijoId).flatMap((i) =>
        i.compuesto ? i.atributoIds : i.atributoIds,
      )
      const componentes = [...idsCopiados, ...idsPropios]
      if (componentes.length > 0) {
        // Se reemplazan los identificadores previos del hijo por uno compuesto.
        m.identificadores = m.identificadores.filter((i) => i.entidadId !== hijoId)
        agregarIdentificador(m, {
          entidadId: hijoId,
          nombre: clavesPadre.length > 0 ? clavesPadre.join('+') : 'id',
          compuesto: componentes.length > 1,
          atributoIds: componentes,
          entidadesExternasIds: [],
        })
      }

      // Relaciones del padre, recreadas contra el hijo.
      for (const rel of relacionesPadre) {
        const patasNuevas = rel.patas.map((p) =>
          p.entidadId === padreId ? { ...p, entidadId: hijoId } : { ...p },
        )
        agregarRelacion(m, `${hijoNombre}_${rel.nombre}`.toLowerCase(), patasNuevas)
      }
    }

    // Borrar el padre se lleva sus relaciones originales y la jerarquia.
    quitarEntidad(m, padreId)
    quitarJerarquia(m, jerarquia.id)
  })
}
