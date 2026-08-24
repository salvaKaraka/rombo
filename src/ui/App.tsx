/**
 * Ventana principal. Arma la barra de herramientas, las pestañas y decide que
 * dialogo mostrar segun lo que el pipeline este pidiendo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ModoFisico, Punto, RefPropietario, RefSeleccion } from '../domain/types'
import { esPropietario } from '../domain/types'
import { MENSAJES } from '../domain/pipeline'
import { nombreDe, nombreDeSeleccion } from '../domain/queries'
import { useCaser, type Pestana } from './store'
import { Toolbar, type AccionToolbar } from './Toolbar'
import { ModelTree } from './ModelTree'
import { SpecEditor, type TipoObjeto } from './SpecEditor'
import { DiagramCanvas } from './canvas/DiagramCanvas'
import { TablesView } from './TablesView'
import { LogView } from './LogView'
import { AvisoInicial, avisoYaVisto, marcarAvisoVisto, REPO } from './AvisoInicial'
import { Confirmar, Mensaje } from './dialogs/Base'
import {
  DialogoCompuesto,
  DialogoEleccionFisico,
  DialogoJerarquia,
  DialogoPasoAPaso,
  DialogoPolivalente,
  DialogoProgreso,
} from './dialogs/Pasaje'
import {
  DialogoAtributo,
  DialogoCompuestoHijos,
  DialogoEntidad,
  DialogoRelacion,
} from './dialogs/Editores'
import {
  abrirModelo,
  descargarLog,
  exportarPng,
  exportarSvg,
  guardarModelo,
  importarEspecificacion,
  imprimirDiagrama,
} from './archivos'

type Tema = 'auto' | 'claro' | 'oscuro'

/** Dialogos abiertos por el usuario (no por el pipeline). */
type DialogoUI =
  | { tipo: 'entidad'; id?: string; nombre?: string }
  | { tipo: 'relacion'; id?: string; nombre?: string }
  | { tipo: 'atributo'; id?: string; nombre?: string; propietario?: RefPropietario }
  | { tipo: 'compuesto'; id: string }
  | { tipo: 'progreso' }
  | { tipo: 'eleccionFisico' }
  | { tipo: 'pasoAPaso' }
  | { tipo: 'confirmarDeshacer' }
  | { tipo: 'mensaje'; titulo: string; texto: string }
  | null

const PESTANAS: { clave: Pestana; etiqueta: string; icono: string }[] = [
  { clave: 'spec', etiqueta: 'Especificación', icono: '≡' },
  { clave: 'conceptual', etiqueta: 'Modelo Conceptual', icono: '▭' },
  { clave: 'logico', etiqueta: 'Modelo Lógico', icono: '◈' },
  { clave: 'sinIdExternos', etiqueta: 'Modelo sin ID Externos', icono: '⊙' },
  { clave: 'fisico', etiqueta: 'Modelo Físico', icono: '▤' },
  { clave: 'log', etiqueta: 'Log', icono: '≣' },
]

export function App() {
  const caser = useCaser()
  const {
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
  } = caser

  const [dialogo, setDialogo] = useState<DialogoUI>(null)
  /** Menú contextual del diagrama: clic derecho sobre una figura. */
  const [menuCanvas, setMenuCanvas] = useState<{
    ref: RefSeleccion
    x: number
    y: number
  } | null>(null)
  /** Mensaje "Paso N: ..." que hay que confirmar antes de la peticion. */
  const [anuncio, setAnuncio] = useState<string | null>(null)
  const [tema, setTema] = useState<Tema>('auto')
  const [mostrarAviso, setMostrarAviso] = useState(() => !avisoYaVisto())
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Cuando llega una peticion con anuncio, primero se muestra el anuncio.
  useEffect(() => {
    if (pendiente?.anuncio) setAnuncio(pendiente.anuncio)
  }, [pendiente])

  useEffect(() => {
    const raiz = document.documentElement
    if (tema === 'auto') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light')
  }, [tema])

  const specBloqueada = modelo.estado !== 'MCAN'
  const esDerivado = modelo.estado === 'MLAN' || modelo.estado === 'MFAN'

  // ------------------------------------------------------------------ archivos

  const alGuardar = useCallback(() => {
    guardarModelo(caser.documento)
    caser.avisar('Modelo guardado.')
  }, [caser])

  const alAbrir = useCallback(async () => {
    try {
      const doc = await abrirModelo()
      if (!doc) return
      caser.cargarDocumento(doc)
      caser.avisar('Modelo abierto.')
    } catch (e) {
      caser.avisar(e instanceof Error ? e.message : 'No se pudo abrir el archivo.', true)
    }
  }, [caser])

  const alImportar = useCallback(async () => {
    if (specBloqueada) {
      caser.avisar('La especificación está bloqueada: el Modelo Conceptual ya fue finalizado.', true)
      return
    }
    try {
      const texto = await importarEspecificacion()
      if (texto === null) return
      caser.setSpec(texto)
      caser.setPestana('spec')
      caser.avisar('Especificación importada.')
    } catch (e) {
      caser.avisar(e instanceof Error ? e.message : 'No se pudo importar el archivo.', true)
    }
  }, [caser, specBloqueada])

  const conSvg = useCallback(
    (fn: (svg: SVGSVGElement) => void | Promise<void>) => {
      const svg = svgRef.current
      if (!svg) {
        caser.avisar('Abrí una pestaña de diagrama para poder exportar o imprimir.', true)
        return
      }
      Promise.resolve(fn(svg)).catch((e) =>
        caser.avisar(e instanceof Error ? e.message : 'Falló la operación.', true),
      )
    },
    [caser],
  )

  // ------------------------------------------------------------------- pasaje

  const alSiguientePaso = useCallback(() => {
    if (pendiente) {
      // Ya hay algo abierto esperando respuesta.
      return
    }
    caser.siguientePaso()
  }, [caser, pendiente])

  const alDeshacer = useCallback(() => {
    if (!caser.puedeDeshacer) {
      caser.avisar('No hay pasos del pasaje para deshacer.')
      return
    }
    setDialogo({ tipo: 'confirmarDeshacer' })
  }, [caser])

  const alPasarAFisico = useCallback(() => {
    const chequeo =
      modelo.estado === 'MFAN'
        ? { ok: false, mensaje: MENSAJES.fisicoYaHecho }
        : modelo.estado !== 'MLAN'
          ? { ok: false, mensaje: MENSAJES.faltaLogico }
          : !pipeline.finLogico
            ? { ok: false, mensaje: MENSAJES.faltaFinLogico }
            : { ok: true as const }
    if (!chequeo.ok) {
      caser.avisar(chequeo.mensaje!, true)
      return
    }
    setDialogo({ tipo: 'eleccionFisico' })
  }, [modelo.estado, pipeline.finLogico, caser])

  const confirmarModoFisico = useCallback(
    (modo: ModoFisico) => {
      setDialogo(null)
      caser.comenzarFisico(modo)
      if (modo === 'B') {
        // El recorrido narrado se abre despues de calcular las tablas.
        setTimeout(() => setDialogo({ tipo: 'pasoAPaso' }), 60)
      }
    },
    [caser],
  )

  // --------------------------------------------------- creacion desde el texto

  /**
   * Propietario que se propone al crear un atributo: lo que esté seleccionado.
   * Si lo seleccionado es un atributo simple, se usa su propietario, para que
   * "agregar otro atributo acá" haga lo esperable.
   */
  const propietarioSugerido = useMemo<RefPropietario | undefined>(() => {
    if (!seleccion) return undefined
    if (esPropietario(seleccion)) return seleccion
    return modelo.atributos.find((a) => a.id === seleccion.id)?.propietario
  }, [seleccion, modelo.atributos])

  const crearDesdeSpec = useCallback(
    (tipo: TipoObjeto, nombre: string) => {
      if (!nombre) {
        caser.avisar('Seleccioná una palabra de la especificación primero.', true)
        return
      }
      if (tipo === 'entidad') setDialogo({ tipo: 'entidad', nombre })
      if (tipo === 'relacion') setDialogo({ tipo: 'relacion', nombre })
      if (tipo === 'atributo')
        setDialogo({ tipo: 'atributo', nombre, propietario: propietarioSugerido })
    },
    [caser, propietarioSugerido],
  )

  const editarRef = useCallback((ref: RefSeleccion) => {
    if (ref.tipo === 'entidad') setDialogo({ tipo: 'entidad', id: ref.id })
    if (ref.tipo === 'relacion') setDialogo({ tipo: 'relacion', id: ref.id })
    if (ref.tipo === 'compuesto') setDialogo({ tipo: 'compuesto', id: ref.id })
    if (ref.tipo === 'atributo') setDialogo({ tipo: 'atributo', id: ref.id })
  }, [])

  const borrarRef = useCallback(
    (ref: RefSeleccion) => {
      if (esDerivado) {
        caser.avisar('El modelo derivado no se edita: volvé al Modelo Conceptual.', true)
        return
      }
      if (ref.tipo === 'entidad') caser.borrarEntidad(ref.id)
      if (ref.tipo === 'relacion') caser.borrarRelacion(ref.id)
      if (ref.tipo === 'compuesto' || ref.tipo === 'atributo') caser.borrarAtributo(ref.id)
    },
    [esDerivado, caser],
  )

  const borrarSeleccion = useCallback(() => {
    if (!seleccion) return
    borrarRef(seleccion)
  }, [seleccion, borrarRef])

  // Suprimir borra lo seleccionado, mientras no se esté escribiendo.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const foco = document.activeElement
      const escribiendo =
        foco instanceof HTMLInputElement ||
        foco instanceof HTMLTextAreaElement ||
        foco instanceof HTMLSelectElement
      if (escribiendo || !seleccion || dialogo || pendiente || anuncio) return
      e.preventDefault()
      borrarRef(seleccion)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [seleccion, dialogo, pendiente, anuncio, borrarRef])

  // ------------------------------------------------------------------ toolbar

  const grupos = useMemo<AccionToolbar[][]>(
    () => [
      [
        {
          clave: 'nuevo',
          icono: '✧',
          etiqueta: 'Nuevo',
          titulo: 'Nuevo modelo',
          onClick: () => {
            setDialogo(null)
            setAnuncio(null)
            caser.nuevo()
          },
        },
        { clave: 'abrir', icono: '⌸', etiqueta: 'Abrir', titulo: 'Abrir modelo (.caser.json)', onClick: alAbrir },
        { clave: 'guardar', icono: '⤓', etiqueta: 'Guardar', titulo: 'Guardar modelo', onClick: alGuardar },
        {
          clave: 'importar',
          icono: '⇥',
          etiqueta: 'Importar',
          titulo: 'Importar especificación desde un archivo de texto',
          onClick: alImportar,
          deshabilitado: specBloqueada,
        },
      ],
      [
        {
          clave: 'entidad',
          icono: '▭',
          etiqueta: 'Entidad',
          titulo: 'Agregar entidad',
          onClick: () => setDialogo({ tipo: 'entidad' }),
          deshabilitado: esDerivado,
        },
        {
          clave: 'relacion',
          icono: '◇',
          etiqueta: 'Relación',
          titulo: 'Agregar relación',
          onClick: () => setDialogo({ tipo: 'relacion' }),
          deshabilitado: esDerivado,
        },
        {
          clave: 'atributo',
          icono: '○',
          etiqueta: 'Atributo',
          titulo: propietarioSugerido
            ? `Agregar atributo a ${nombreDe(modelo, propietarioSugerido)}`
            : 'Agregar atributo',
          onClick: () => setDialogo({ tipo: 'atributo', propietario: propietarioSugerido }),
          deshabilitado: esDerivado || modelo.entidades.length + modelo.relaciones.length === 0,
        },
        {
          clave: 'borrar',
          icono: '⌫',
          etiqueta: 'Eliminar',
          titulo: seleccion
            ? 'Eliminar el objeto seleccionado (Supr)'
            : 'Seleccioná algo en el diagrama o el árbol para eliminarlo',
          onClick: borrarSeleccion,
          deshabilitado: !seleccion || esDerivado,
        },
      ],
      [
        {
          clave: 'zoom-menos',
          icono: '－',
          etiqueta: 'Alejar',
          titulo: 'Reducir el tamaño del gráfico',
          soloIcono: true,
          onClick: () => caser.setZoom(Math.max(0.4, Math.round((zoom - 0.1) * 10) / 10)),
        },
        {
          clave: 'zoom-mas',
          icono: '＋',
          etiqueta: 'Acercar',
          titulo: 'Aumentar el tamaño del gráfico',
          soloIcono: true,
          onClick: () => caser.setZoom(Math.min(2.5, Math.round((zoom + 0.1) * 10) / 10)),
        },
      ],
      [
        {
          clave: 'finalizar',
          icono: '⚑',
          etiqueta: 'Finalizar',
          titulo: 'Finalizar el Modelo Conceptual (obtener MCdef)',
          onClick: caser.finalizar,
          deshabilitado: modelo.estado !== 'MCAN',
          destacado: modelo.estado === 'MCAN' && modelo.entidades.length > 0,
        },
        {
          clave: 'logico',
          icono: '◈',
          etiqueta: 'Pasar a Lógico',
          titulo: 'Comenzar pasaje a Modelo Lógico',
          onClick: caser.comenzarLogico,
          destacado: modelo.estado === 'MCdef',
        },
        {
          clave: 'siguiente',
          icono: '▸',
          etiqueta: 'Siguiente paso',
          titulo: 'Siguiente paso del pasaje',
          onClick: alSiguientePaso,
          destacado: pipeline.iniciado && !pipeline.finLogico,
        },
        {
          clave: 'deshacer',
          icono: '◂',
          etiqueta: 'Deshacer paso',
          titulo: 'Deshacer el último paso del pasaje',
          onClick: alDeshacer,
          deshabilitado: !caser.puedeDeshacer,
        },
        {
          clave: 'progreso',
          icono: '☰',
          etiqueta: 'Progreso',
          titulo: 'Ver el progreso del pasaje a Modelo Lógico',
          onClick: () => setDialogo({ tipo: 'progreso' }),
        },
        {
          clave: 'fisico',
          icono: '▤',
          etiqueta: 'Pasar a Físico',
          titulo: 'Comenzar pasaje a Modelo Físico',
          onClick: alPasarAFisico,
          destacado: pipeline.finLogico && modelo.estado === 'MLAN',
        },
      ],
      [
        {
          clave: 'log',
          icono: '≣',
          etiqueta: 'Log',
          titulo: 'Descargar el log del pasaje como HTML',
          onClick: () => {
            if (bitacora.entradas.length === 0) {
              caser.avisar('El log todavía está vacío.')
              return
            }
            descargarLog(bitacora)
          },
        },
        {
          clave: 'png',
          icono: '▣',
          etiqueta: 'PNG',
          titulo: 'Exportar el diagrama como PNG',
          onClick: () => conSvg((svg) => exportarPng(svg)),
        },
        {
          clave: 'svg',
          icono: '⬡',
          etiqueta: 'SVG',
          titulo: 'Exportar el diagrama como SVG',
          onClick: () => conSvg((svg) => exportarSvg(svg)),
        },
        {
          clave: 'imprimir',
          icono: '⊞',
          etiqueta: 'Imprimir',
          titulo: 'Imprimir el diagrama',
          onClick: () =>
            conSvg((svg) => {
              if (!imprimirDiagrama(svg)) {
                caser.avisar('El navegador bloqueó la ventana de impresión.', true)
              }
            }),
        },
      ],
    ],
    [
      caser,
      alAbrir,
      alGuardar,
      alImportar,
      alSiguientePaso,
      alDeshacer,
      alPasarAFisico,
      borrarSeleccion,
      conSvg,
      specBloqueada,
      esDerivado,
      seleccion,
      propietarioSugerido,
      modelo,
      zoom,
      modelo.estado,
      modelo.entidades.length,
      modelo.relaciones.length,
      pipeline.iniciado,
      pipeline.finLogico,
      bitacora,
    ],
  )

  // ------------------------------------------------------------------ contenido

  const alMover = esDerivado ? null : (ref: RefPropietario, pos: Punto) => caser.moverNodo(ref, pos)

  const contenido = () => {
    switch (pestana) {
      case 'spec':
        return (
          <SpecEditor
            texto={modelo.spec}
            bloqueado={specBloqueada}
            onCambiar={caser.setSpec}
            onCrear={crearDesdeSpec}
          />
        )

      case 'conceptual':
        return (
          <DiagramCanvas
            modelo={modelo}
            seleccion={seleccion}
            zoom={zoom}
            onMover={alMover}
            onSeleccionar={caser.setSeleccion}
            onEditar={editarRef}
            onMenu={(ref, en) => setMenuCanvas({ ref, x: en.x, y: en.y })}
            svgRef={svgRef}
            vacio={{
              titulo: 'El diagrama está vacío',
              texto:
                'Agregá entidades, relaciones y atributos desde la barra de herramientas, o seleccionando palabras en la pestaña Especificación.',
            }}
          />
        )

      case 'logico':
        return pipeline.iniciado ? (
          <DiagramCanvas
            modelo={modelo}
            seleccion={seleccion}
            zoom={zoom}
            onMover={alMover}
            onSeleccionar={caser.setSeleccion}
            onEditar={editarRef}
            svgRef={svgRef}
          />
        ) : (
          <div className="lienzo-wrap">
            <div className="lienzo-vacio">
              <h3>El pasaje a Modelo Lógico no comenzó</h3>
              <p>
                Finalizá el Modelo Conceptual y después usá <strong>Pasar a Lógico</strong>. El
                esquema no queda normalizado hasta que el pasaje termine.
              </p>
            </div>
          </div>
        )

      case 'sinIdExternos':
        return modeloSinIdExternos ? (
          <DiagramCanvas
            modelo={modeloSinIdExternos}
            seleccion={null}
            zoom={zoom}
            onMover={null}
            onSeleccionar={() => {}}
            svgRef={svgRef}
          />
        ) : (
          <div className="lienzo-wrap">
            <div className="lienzo-vacio">
              <h3>Todavía no se eliminaron los identificadores externos</h3>
              <p>
                Es el primer paso del pasaje a Modelo Físico. Acá vas a ver el esquema justo
                después de resolverlos, antes de pasar a tablas.
              </p>
            </div>
          </div>
        )

      case 'fisico':
        return <TablesView tablas={modelo.tablas} />

      case 'log':
        return <LogView bitacora={bitacora} />
    }
  }

  // ------------------------------------------------------------------- dialogos

  const dialogoDelPipeline = () => {
    if (!pendiente || anuncio) return null
    const p = pendiente.peticion

    if (p.tipo === 'compuesto') {
      return (
        <DialogoCompuesto
          atributo={p.atributo.nombre}
          propietario={p.propietario}
          opciones={p.opciones}
          onAceptar={(o) => caser.responder({ tipo: 'compuesto', opcion: o })}
          onCancelar={caser.cancelarPendiente}
        />
      )
    }
    if (p.tipo === 'polivalente') {
      return (
        <DialogoPolivalente
          mensaje={p.mensaje}
          onAceptar={(c) =>
            caser.responder({ tipo: 'polivalente', cardMin: c.cardMin, cardMax: c.cardMax })
          }
          onCancelar={caser.cancelarPendiente}
        />
      )
    }
    if (p.tipo === 'jerarquia') {
      return (
        <DialogoJerarquia
          etiqueta={p.etiqueta}
          opciones={p.opciones}
          forzada={p.forzada}
          motivo={p.motivo}
          onAceptar={(o) => caser.responder({ tipo: 'jerarquia', opcion: o })}
          onCancelar={caser.cancelarPendiente}
        />
      )
    }
    if (p.tipo === 'sinItems') {
      return (
        <Mensaje
          titulo="Proceso de pasaje al Modelo Lógico"
          texto={p.mensaje}
          onCerrar={() => caser.responder({ tipo: 'sinItems' })}
        />
      )
    }
    return (
      <Mensaje
        titulo="Proceso de pasaje al Modelo Lógico"
        texto={p.mensaje}
        onCerrar={() => caser.responder({ tipo: 'fin' })}
      />
    )
  }

  const cerrarAviso = useCallback(() => {
    marcarAvisoVisto()
    setMostrarAviso(false)
  }, [])

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <i aria-hidden>◇</i>
          <b>rombo</b>
          <span>modelado de datos</span>
        </div>
        <span className="estado-chip" title="Estado del modelo">
          {modelo.estado}
        </span>
        <div className="crece" />
        <a
          className="cab-btn"
          href={REPO}
          target="_blank"
          rel="noreferrer"
          title="Código fuente en GitHub"
        >
          <span aria-hidden>◴</span> Repositorio
        </a>
        <button
          type="button"
          className="cab-btn"
          onClick={() => setMostrarAviso(true)}
          title="Ver de nuevo el aviso: en qué se diferencia del CasER original"
        >
          <span aria-hidden>?</span> Ayuda
        </button>
        <select
          value={tema}
          onChange={(e) => setTema(e.target.value as Tema)}
          aria-label="Tema"
          style={{
            padding: '0.22rem 0.4rem',
            borderRadius: 6,
            border: '1px solid var(--borde-fuerte)',
            background: 'var(--panel-2)',
            fontSize: '0.76rem',
          }}
        >
          <option value="auto">Tema: automático</option>
          <option value="claro">Tema: claro</option>
          <option value="oscuro">Tema: oscuro</option>
        </select>
      </header>

      <Toolbar grupos={grupos} />

      <div className={`cuerpo${pestana === 'log' || pestana === 'fisico' ? ' sin-arbol' : ''}`}>
        {pestana !== 'log' && pestana !== 'fisico' && (
          <ModelTree
            modelo={pestana === 'sinIdExternos' && modeloSinIdExternos ? modeloSinIdExternos : modelo}
            seleccion={seleccion}
            onSeleccionar={caser.setSeleccion}
            onEditar={editarRef}
            onBorrar={esDerivado || pestana === 'sinIdExternos' ? null : borrarRef}
          />
        )}

        <main className="principal">
          <div className="tabs" role="tablist">
            {PESTANAS.map((t) => (
              <button
                key={t.clave}
                type="button"
                role="tab"
                className="tab"
                aria-selected={pestana === t.clave}
                onClick={() => caser.setPestana(t.clave)}
              >
                <span aria-hidden>{t.icono}</span>
                {t.etiqueta}
                {t.clave === 'fisico' && modelo.tablas.length > 0 && (
                  <span className="punto" aria-hidden />
                )}
                {t.clave === 'log' && bitacora.entradas.length > 0 && (
                  <span className="punto" aria-hidden />
                )}
              </button>
            ))}
          </div>

          {contenido()}
        </main>
      </div>

      <footer className="pie">
        <span>
          {modelo.entidades.length} entidades · {modelo.relaciones.length} relaciones ·{' '}
          {modelo.atributos.length} atributos
        </span>
        {pipeline.iniciado && (
          <span className="paso-actual">
            {pipeline.finLogico
              ? 'pasaje lógico finalizado'
              : `paso actual: ${pipeline.paso}`}
          </span>
        )}
        {modelo.tablas.length > 0 && <span>{modelo.tablas.length} tablas</span>}
        <div className="crece" />
        <span title="Este proyecto no es la herramienta oficial de la cátedra.">
          Reimplementación de CasER · Introducción a las Bases de Datos, UNLP
        </span>
      </footer>

      {/* Anuncio "Paso N: ..." previo a la peticion */}
      {anuncio && (
        <Mensaje
          titulo="Proceso de pasaje al Modelo Lógico"
          texto={anuncio}
          onCerrar={() => setAnuncio(null)}
        />
      )}

      {/* Menú contextual del diagrama — clic derecho, como el CasER original */}
      {menuCanvas && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 55 }}
            onMouseDown={() => setMenuCanvas(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenuCanvas(null)
            }}
          />
          <div
            className="menu-ctx"
            style={{
              left: Math.min(menuCanvas.x, window.innerWidth - 224),
              top: Math.min(menuCanvas.y, window.innerHeight - 190),
            }}
          >
            <div className="menu-ctx-titulo">
              {nombreDeSeleccion(modelo, menuCanvas.ref)}
            </div>
            <button
              type="button"
              onClick={() => {
                editarRef(menuCanvas.ref)
                setMenuCanvas(null)
              }}
            >
              <span className="glifo">✎</span> Propiedades…
            </button>
            {esPropietario(menuCanvas.ref) && (
              <button
                type="button"
                disabled={esDerivado}
                onClick={() => {
                  setDialogo({ tipo: 'atributo', propietario: menuCanvas.ref as RefPropietario })
                  setMenuCanvas(null)
                }}
              >
                <span className="glifo">○</span> Agregar atributo
              </button>
            )}
            <hr />
            <button
              type="button"
              disabled={esDerivado}
              onClick={() => {
                borrarRef(menuCanvas.ref)
                setMenuCanvas(null)
              }}
            >
              <span className="glifo">✕</span> Eliminar
            </button>
          </div>
        </>
      )}

      {dialogoDelPipeline()}

      {dialogo?.tipo === 'entidad' && (
        <DialogoEntidad
          caser={caser}
          entidadId={dialogo.id}
          nombreInicial={dialogo.nombre}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'relacion' && (
        <DialogoRelacion
          caser={caser}
          relacionId={dialogo.id}
          nombreInicial={dialogo.nombre}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'atributo' && (
        <DialogoAtributo
          caser={caser}
          atributoId={dialogo.id}
          nombreInicial={dialogo.nombre}
          propietarioInicial={dialogo.propietario}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'compuesto' && (
        <DialogoCompuestoHijos
          caser={caser}
          compuestoId={dialogo.id}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'progreso' && (
        <DialogoProgreso items={pipeline.progreso} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'eleccionFisico' && (
        <DialogoEleccionFisico
          onAceptar={confirmarModoFisico}
          onCancelar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'pasoAPaso' && pasosFisicos.length > 0 && (
        <DialogoPasoAPaso pasos={pasosFisicos} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'confirmarDeshacer' && (
        <Confirmar
          titulo="Deshacer paso"
          texto={MENSAJES.confirmarDeshacer}
          onSi={() => {
            setDialogo(null)
            caser.deshacerPaso()
          }}
          onNo={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'mensaje' && (
        <Mensaje
          titulo={dialogo.titulo}
          texto={dialogo.texto}
          onCerrar={() => setDialogo(null)}
        />
      )}

      {/* Modal, fuera del grid: como fila del layout desplazaba el `1fr` del
          cuerpo y al cerrarse la página quedaba compactada. */}
      {mostrarAviso && <AvisoInicial onCerrar={cerrarAviso} />}

      {avisos.length > 0 && (
        <div className="avisos">
          {avisos.map((a) => (
            <div
              key={a.id}
              className={`aviso${a.error ? ' err' : ''}`}
              role="status"
              onClick={() => caser.descartarAviso(a.id)}
            >
              {a.texto}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
