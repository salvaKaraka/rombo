/**
 * Estado de la aplicacion.
 *
 * Un unico hook con todo el estado y las acciones. El modelo, el pipeline y la
 * bitacora viajan juntos porque "Deshacer paso" restaura los tres a la vez —
 * exactamente lo que hace `ControladorDeshacer` en el original, pero sin tener
 * que reconstruir la operacion inversa de cada transformacion.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  Atributo,
  CardMax,
  CardMin,
  Cobertura,
  EstadoPipeline,
  Id,
  Modelo,
  ModoFisico,
  Pata,
  Punto,
  RefPropietario,
  RefSeleccion,
  TipoAtributo,
} from '../domain/types'
import { modeloVacio, pipelineInicial } from '../domain/types'
import type { Bitacora } from '../domain/log'
import { bitacoraVacia, registrar } from '../domain/log'
import {
  agregarAtributo,
  agregarEntidad,
  agregarIdentificador,
  agregarJerarquia,
  agregarRelacion,
  editar,
  quitarAtributo,
  quitarEntidad,
  quitarIdentificador,
  quitarJerarquia,
  quitarRelacion,
} from '../domain/edits'
import {
  aplicarDecision,
  comenzarLogico as comenzarLogicoDominio,
  MENSAJES,
  proximaAccion,
  puedeComenzarFisico,
  puedeComenzarLogico,
  type Decision,
  type Peticion,
} from '../domain/pipeline'
import { eliminarIdExternos } from '../domain/transform/idExternos'
import { pasarATablas, type PasoTabla } from '../domain/transform/tablas'
import type { Documento } from '../persistence/types'

export type Pestana =
  | 'spec'
  | 'conceptual'
  | 'logico'
  | 'sinIdExternos'
  | 'fisico'
  | 'log'

interface Snapshot {
  modelo: Modelo
  pipeline: EstadoPipeline
  bitacora: Bitacora
}

export interface Aviso {
  id: number
  texto: string
  error?: boolean
}

/** Peticion pendiente de respuesta por parte del usuario. */
export interface Pendiente {
  peticion: Peticion
  /** Mensaje "Paso N: ..." que hay que mostrar antes de la peticion. */
  anuncio?: string
}

export function useCaser() {
  const [modelo, setModelo] = useState<Modelo>(modeloVacio)
  const [pipeline, setPipeline] = useState<EstadoPipeline>(pipelineInicial)
  const [bitacora, setBitacora] = useState<Bitacora>(() => bitacoraVacia())
  const [historial, setHistorial] = useState<Snapshot[]>([])

  const [pestana, setPestana] = useState<Pestana>('spec')
  const [seleccion, setSeleccion] = useState<RefSeleccion | null>(null)
  const [zoom, setZoom] = useState(1)

  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [pasosFisicos, setPasosFisicos] = useState<PasoTabla[]>([])
  /** Snapshot del modelo antes de eliminar los id externos, para la pestaña intermedia. */
  const [modeloSinIdExternos, setModeloSinIdExternos] = useState<Modelo | null>(null)

  const [avisos, setAvisos] = useState<Aviso[]>([])
  const contadorAviso = useRef(0)

  const avisar = useCallback((texto: string, error = false) => {
    const id = ++contadorAviso.current
    setAvisos((a) => [...a, { id, texto, error }])
    window.setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5200)
  }, [])

  const descartarAviso = useCallback((id: number) => {
    setAvisos((a) => a.filter((x) => x.id !== id))
  }, [])

  // ---------------------------------------------------------------- documento

  const nuevo = useCallback(() => {
    setModelo(modeloVacio())
    setPipeline(pipelineInicial())
    setBitacora(bitacoraVacia())
    setHistorial([])
    setPasosFisicos([])
    setModeloSinIdExternos(null)
    setSeleccion(null)
    setPendiente(null)
    setZoom(1)
    setPestana('spec')
  }, [])

  const cargarDocumento = useCallback((doc: Documento) => {
    setModelo(doc.modelo)
    setPipeline(doc.pipeline)
    setBitacora(doc.bitacora ?? bitacoraVacia())
    setHistorial([])
    setPasosFisicos([])
    setModeloSinIdExternos(null)
    setSeleccion(null)
    setPendiente(null)
    setPestana(doc.modelo.tablas.length > 0 ? 'fisico' : 'conceptual')
  }, [])

  const documento = useMemo<Documento>(
    () => ({ version: 1, modelo, pipeline, bitacora }),
    [modelo, pipeline, bitacora],
  )

  const setSpec = useCallback((texto: string) => {
    setModelo((m) => ({ ...m, spec: texto }))
  }, [])

  /**
   * Finaliza el modelo conceptual (MCdef). Bloquea la edicion de la
   * especificacion pero no la de los objetos ni del arbol.
   */
  const finalizar = useCallback(() => {
    if (modelo.estado !== 'MCAN') {
      avisar('El Modelo Conceptual ya fue finalizado.')
      return
    }
    if (modelo.entidades.length === 0) {
      avisar('Agregue al menos una entidad antes de finalizar el Modelo Conceptual.', true)
      return
    }
    setModelo((m) => ({ ...m, estado: 'MCdef' }))
    avisar('Modelo Conceptual finalizado (MCdef). Ya puede comenzar el pasaje a Lógico.')
  }, [modelo.estado, modelo.entidades.length, avisar])

  // ------------------------------------------------------------ edicion modelo

  /** Aplica una edicion al modelo conceptual. */
  const editarModelo = useCallback((fn: (m: Modelo) => void) => {
    setModelo((actual) => editar(actual, fn))
  }, [])

  const crearEntidad = useCallback(
    (datos: {
      nombre: string
      padreId?: Id
      cobertura?: Cobertura
      esPadre?: boolean
      pos?: Punto
    }) => {
      let nuevoId: Id = ''
      setModelo((actual) =>
        editar(actual, (m) => {
          nuevoId = agregarEntidad(m, datos.nombre, datos.pos)
          if (datos.padreId) {
            const cob = datos.cobertura ?? 'TE'
            agregarJerarquia(m, datos.padreId, [nuevoId], cob)
          }
          if (datos.esPadre) {
            agregarJerarquia(m, nuevoId, [], datos.cobertura ?? 'TE')
          }
        }),
      )
      return nuevoId
    },
    [],
  )

  const actualizarEntidad = useCallback(
    (
      id: Id,
      datos: { nombre: string; padreId?: Id | null; cobertura?: Cobertura; esPadre?: boolean },
    ) => {
      editarModelo((m) => {
        const e = m.entidades.find((x) => x.id === id)
        if (!e) return
        e.nombre = datos.nombre

        // Rehacer el vinculo como hijo.
        for (const j of m.jerarquias) {
          j.hijosIds = j.hijosIds.filter((h) => h !== id)
        }
        if (datos.padreId) {
          agregarJerarquia(m, datos.padreId, [id], datos.cobertura ?? 'TE')
        }

        // Rol de padre.
        const propia = m.jerarquias.find((j) => j.padreId === id)
        if (datos.esPadre) {
          if (propia) propia.cobertura = datos.cobertura ?? propia.cobertura
          else agregarJerarquia(m, id, [], datos.cobertura ?? 'TE')
        } else if (propia && propia.hijosIds.length === 0) {
          quitarJerarquia(m, propia.id)
        } else if (propia && datos.cobertura) {
          propia.cobertura = datos.cobertura
        }

        m.jerarquias = m.jerarquias.filter(
          (j) => j.hijosIds.length > 0 || j.padreId === id || m.entidades.some((e2) => e2.id === j.padreId),
        )
      })
    },
    [editarModelo],
  )

  const borrarEntidad = useCallback(
    (id: Id) => {
      editarModelo((m) => quitarEntidad(m, id))
      setSeleccion((s) => (s?.tipo === 'entidad' && s.id === id ? null : s))
    },
    [editarModelo],
  )

  const crearRelacion = useCallback((nombre: string, patas: Pata[], pos?: Punto) => {
    let nuevoId: Id = ''
    setModelo((actual) =>
      editar(actual, (m) => {
        nuevoId = agregarRelacion(m, nombre, patas, pos)
      }),
    )
    return nuevoId
  }, [])

  const actualizarRelacion = useCallback(
    (id: Id, nombre: string, patas: Pata[]) => {
      editarModelo((m) => {
        const r = m.relaciones.find((x) => x.id === id)
        if (!r) return
        r.nombre = nombre
        r.patas = patas
      })
    },
    [editarModelo],
  )

  const borrarRelacion = useCallback(
    (id: Id) => {
      editarModelo((m) => quitarRelacion(m, id))
      setSeleccion((s) => (s?.tipo === 'relacion' && s.id === id ? null : s))
    },
    [editarModelo],
  )

  const crearAtributo = useCallback(
    (datos: {
      nombre: string
      propietario: RefPropietario
      tipo: TipoAtributo
      cardMin: CardMin
      cardMax: CardMax
      esIdentificador?: boolean
    }) => {
      let nuevoId: Id = ''
      setModelo((actual) =>
        editar(actual, (m) => {
          nuevoId = agregarAtributo(m, {
            nombre: datos.nombre,
            propietario: datos.propietario,
            tipo: datos.tipo,
            cardMin: datos.cardMin,
            cardMax: datos.cardMax,
          })
          // Un identificador simple crea tambien su entrada de identificador.
          if (datos.tipo === 'identificador' && datos.propietario.tipo === 'entidad') {
            agregarIdentificador(m, {
              entidadId: datos.propietario.id,
              nombre: datos.nombre,
              compuesto: false,
              atributoIds: [nuevoId],
              entidadesExternasIds: [],
            })
          }
        }),
      )
      return nuevoId
    },
    [],
  )

  const actualizarAtributo = useCallback(
    (id: Id, datos: Partial<Pick<Atributo, 'nombre' | 'tipo' | 'cardMin' | 'cardMax'>>) => {
      editarModelo((m) => {
        const a = m.atributos.find((x) => x.id === id)
        if (!a) return
        const eraIdentificador = a.tipo === 'identificador'
        Object.assign(a, datos)

        if (datos.nombre) {
          for (const idf of m.identificadores) {
            if (!idf.compuesto && idf.atributoIds.includes(id)) idf.nombre = datos.nombre
          }
        }

        const esIdentificador = a.tipo === 'identificador'
        if (esIdentificador && !eraIdentificador && a.propietario.tipo === 'entidad') {
          agregarIdentificador(m, {
            entidadId: a.propietario.id,
            nombre: a.nombre,
            compuesto: false,
            atributoIds: [id],
            entidadesExternasIds: [],
          })
        }
        if (!esIdentificador && eraIdentificador) {
          m.identificadores = m.identificadores.filter(
            (idf) => idf.compuesto || !idf.atributoIds.includes(id),
          )
          for (const idf of m.identificadores) {
            idf.atributoIds = idf.atributoIds.filter((x) => x !== id)
          }
        }
      })
    },
    [editarModelo],
  )

  const borrarAtributo = useCallback(
    (id: Id) => {
      editarModelo((m) => quitarAtributo(m, id))
      setSeleccion((s) =>
        s && (s.tipo === 'atributo' || s.tipo === 'compuesto') && s.id === id ? null : s,
      )
    },
    [editarModelo],
  )

  const crearIdentificadorCompuesto = useCallback(
    (datos: {
      entidadId: Id
      nombre: string
      atributoIds: Id[]
      entidadesExternasIds: Id[]
    }) => {
      editarModelo((m) => {
        // Los atributos que pasan a formar la clave se marcan como identificadores.
        for (const aid of datos.atributoIds) {
          const a = m.atributos.find((x) => x.id === aid)
          if (a) a.tipo = 'identificador'
        }
        // Se limpian las entradas simples de esos atributos: ahora forman uno compuesto.
        m.identificadores = m.identificadores.filter(
          (i) =>
            i.entidadId !== datos.entidadId ||
            i.compuesto ||
            !datos.atributoIds.includes(i.atributoIds[0]),
        )
        agregarIdentificador(m, {
          entidadId: datos.entidadId,
          nombre: datos.nombre,
          compuesto: true,
          atributoIds: datos.atributoIds,
          entidadesExternasIds: datos.entidadesExternasIds,
        })
      })
    },
    [editarModelo],
  )

  const borrarIdentificador = useCallback(
    (id: Id) => {
      editarModelo((m) => quitarIdentificador(m, id))
    },
    [editarModelo],
  )

  const moverNodo = useCallback((ref: RefPropietario, pos: Punto) => {
    setModelo((actual) => {
      const lista = ref.tipo === 'entidad' ? actual.entidades : actual.relaciones
      const obj = lista.find((o) => o.id === ref.id)
      if (!obj || (obj.pos.x === pos.x && obj.pos.y === pos.y)) return actual
      return editar(actual, (m) => {
        const l = ref.tipo === 'entidad' ? m.entidades : m.relaciones
        const o = l.find((x) => x.id === ref.id)
        if (o) o.pos = pos
      })
    })
  }, [])

  // ------------------------------------------------------------------ pipeline

  const snapshot = useCallback(
    (): Snapshot => ({
      modelo: structuredClone(modelo),
      pipeline: structuredClone(pipeline),
      bitacora: structuredClone(bitacora),
    }),
    [modelo, pipeline, bitacora],
  )

  const comenzarLogico = useCallback(() => {
    const chequeo = puedeComenzarLogico(modelo)
    if (!chequeo.ok) {
      avisar(chequeo.mensaje!, modelo.estado !== 'MLAN' && modelo.estado !== 'MFAN')
      return
    }
    const { modelo: m2, pipeline: p2 } = comenzarLogicoDominio(modelo, pipeline)
    setModelo(m2)
    setPipeline(p2)
    setBitacora(bitacoraVacia())
    setHistorial([])
    setPestana('logico')
    // Arranca el primer paso de inmediato, igual que el original.
    const accion = proximaAccion(m2, p2)
    setPendiente({ peticion: accion.peticion, anuncio: accion.anuncio })
  }, [modelo, pipeline, avisar])

  const siguientePaso = useCallback(() => {
    if (!pipeline.iniciado) {
      avisar(
        modelo.estado === 'MCAN' ? MENSAJES.faltaFinalizar : MENSAJES.debeComenzar,
        true,
      )
      return
    }
    if (pipeline.finLogico) {
      avisar(MENSAJES.logicoFinalizado)
      return
    }
    if (pendiente) return
    const accion = proximaAccion(modelo, pipeline)
    setPendiente({ peticion: accion.peticion, anuncio: accion.anuncio })
  }, [modelo, pipeline, pendiente, avisar])

  /** Responde la peticion pendiente y avanza el pasaje. */
  const responder = useCallback(
    (decision: Decision) => {
      if (!pendiente) return
      const previo = snapshot()
      const resultado = aplicarDecision(
        { modelo, pipeline, bitacora },
        pendiente.peticion,
        decision,
      )
      // Solo se apila si el modelo efectivamente cambio: informar "no hay nada
      // que eliminar" no es una operacion que tenga sentido deshacer.
      const huboCambio = resultado.modelo !== modelo
      if (huboCambio) setHistorial((h) => [...h, previo])

      setModelo(resultado.modelo)
      setPipeline(resultado.pipeline)
      setBitacora(resultado.bitacora)
      setPendiente(null)

      if (resultado.pipeline.finLogico && !pipeline.finLogico) {
        avisar(MENSAJES.finLogico)
      }
    },
    [pendiente, modelo, pipeline, bitacora, snapshot, avisar],
  )

  const cancelarPendiente = useCallback(() => setPendiente(null), [])

  const deshacerPaso = useCallback(() => {
    if (historial.length === 0) {
      avisar('No hay pasos del pasaje para deshacer.')
      return
    }
    const anterior = historial[historial.length - 1]
    setHistorial((h) => h.slice(0, -1))
    setModelo(anterior.modelo)
    setPipeline(anterior.pipeline)
    setBitacora(anterior.bitacora)
    setPendiente(null)
    setPasosFisicos([])
    setModeloSinIdExternos(null)
    avisar('Se deshizo el último paso del pasaje.')
  }, [historial, avisar])

  // --------------------------------------------------------------- pasaje fisico

  const comenzarFisico = useCallback(
    (modo: ModoFisico) => {
      const chequeo = puedeComenzarFisico(modelo, pipeline)
      if (!chequeo.ok) {
        avisar(chequeo.mensaje!, true)
        return
      }
      const previo = snapshot()

      let log = registrar(
        bitacora,
        'idExternos',
        modo === 'A'
          ? 'Se tomó la decisión de pasar al modelo físico en un único paso (convención ideal).'
          : 'Se tomó la decisión de pasar al modelo físico paso a paso.',
        true,
      )

      // Paso 1: identificadores externos.
      const sinExternos = eliminarIdExternos(modelo, log)
      log = sinExternos.bitacora
      setModeloSinIdExternos(sinExternos.modelo)

      // Paso 2: paso a tablas.
      const fisico = pasarATablas(sinExternos.modelo, log)

      setHistorial((h) => [...h, previo])
      setModelo({ ...sinExternos.modelo, estado: 'MFAN', tablas: fisico.tablas })
      setBitacora(fisico.bitacora)
      setPipeline((p) => ({ ...p, finFisico: true }))
      setPasosFisicos(fisico.pasos)
      setPestana('fisico')
      avisar(
        `Pasaje a Modelo Físico completado: ${fisico.tablas.length} ${
          fisico.tablas.length === 1 ? 'tabla' : 'tablas'
        } generadas.`,
      )
    },
    [modelo, pipeline, bitacora, snapshot, avisar],
  )

  return {
    // estado
    modelo,
    pipeline,
    bitacora,
    pestana,
    seleccion,
    zoom,
    pendiente,
    pasosFisicos,
    modeloSinIdExternos,
    avisos,
    puedeDeshacer: historial.length > 0,
    documento,

    // navegacion / vista
    setPestana,
    setSeleccion,
    setZoom,
    avisar,
    descartarAviso,

    // documento
    nuevo,
    cargarDocumento,
    setSpec,
    finalizar,

    // edicion
    crearEntidad,
    actualizarEntidad,
    borrarEntidad,
    crearRelacion,
    actualizarRelacion,
    borrarRelacion,
    crearAtributo,
    actualizarAtributo,
    borrarAtributo,
    crearIdentificadorCompuesto,
    borrarIdentificador,
    moverNodo,

    // pasaje
    comenzarLogico,
    siguientePaso,
    responder,
    cancelarPendiente,
    deshacerPaso,
    comenzarFisico,
  }
}

export type Caser = ReturnType<typeof useCaser>
