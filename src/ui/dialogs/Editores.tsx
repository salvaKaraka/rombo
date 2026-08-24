/**
 * Formularios de edicion de objetos del modelo conceptual.
 * Espejan los wizards `AddEditEntidadWizard`, `AddEditRelacionWizard`,
 * `AddEditAtributoWizard` y `AddEditIdentiCompuesto`.
 *
 * Convencion: el nombre y la estructura propia del objeto se editan en un
 * buffer y se aplican al Aceptar; las sublistas (atributos, identificadores)
 * actuan de inmediato, porque tienen su propio dialogo con Aceptar / Cancelar.
 */

import { useMemo, useState } from 'react'
import type {
  CardMax,
  CardMin,
  Cobertura,
  Id,
  Modelo,
  Pata,
  RefPropietario,
  TipoAtributo,
} from '../../domain/types'
import { COBERTURAS } from '../../domain/types'
import {
  atributosDe,
  atributosDeEntidad,
  candidatasIdExterno,
  entidad,
  identificadoresDe,
  jerarquiaComoHijo,
  jerarquiaComoPadre,
  nombreDe,
  portadores,
  relacion,
} from '../../domain/queries'
import { Dialogo, DlgTabs, Transfer } from './Base'
import type { Caser } from '../store'

const CARD_MIN: CardMin[] = ['0', '1']
const CARD_MAX: CardMax[] = ['1', 'n']

function RadiosCard({
  etiqueta,
  valores,
  actual,
  onCambiar,
  nombre,
}: {
  etiqueta: string
  valores: string[]
  actual: string
  onCambiar: (v: string) => void
  nombre: string
}) {
  return (
    <div className="campo">
      <label>{etiqueta}</label>
      <div className="radios">
        {valores.map((v) => (
          <label key={v}>
            <input
              type="radio"
              name={nombre}
              checked={actual === v}
              onChange={() => onCambiar(v)}
            />
            {v}
          </label>
        ))}
      </div>
    </div>
  )
}

// ===========================================================================
// Atributo
// ===========================================================================

export function DialogoAtributo({
  caser,
  atributoId,
  propietarioInicial,
  nombreInicial,
  onCerrar,
}: {
  caser: Caser
  /** Si viene, se edita ese atributo; si no, se crea uno nuevo. */
  atributoId?: Id
  propietarioInicial?: RefPropietario
  nombreInicial?: string
  onCerrar: () => void
}) {
  const { modelo } = caser
  const existente = atributoId ? modelo.atributos.find((a) => a.id === atributoId) : undefined

  const opcionesPropietario = useMemo(
    () =>
      portadores(modelo)
        // Un atributo compuesto no puede colgar de si mismo.
        .filter((p) => !(p.tipo === 'compuesto' && p.id === atributoId))
        .map((p) => ({ ref: p, etiqueta: `${prefijo(p)} ${nombreDe(modelo, p)}` })),
    [modelo, atributoId],
  )

  const [nombre, setNombre] = useState(existente?.nombre ?? nombreInicial ?? '')
  const [propietario, setPropietario] = useState<RefPropietario | null>(
    existente?.propietario ?? propietarioInicial ?? opcionesPropietario[0]?.ref ?? null,
  )
  const [tipo, setTipo] = useState<TipoAtributo>(existente?.tipo ?? 'simple')
  const [cardMin, setCardMin] = useState<CardMin>(existente?.cardMin ?? '1')
  const [cardMax, setCardMax] = useState<CardMax>(existente?.cardMax ?? '1')

  // Solo las entidades pueden tener identificadores.
  const puedeSerIdentificador = propietario?.tipo === 'entidad'
  const tipoEfectivo: TipoAtributo =
    tipo === 'identificador' && !puedeSerIdentificador ? 'simple' : tipo

  const guardar = () => {
    if (!nombre.trim() || !propietario) return
    if (existente) {
      caser.actualizarAtributo(existente.id, {
        nombre: nombre.trim(),
        tipo: tipoEfectivo,
        cardMin,
        cardMax,
      })
    } else {
      caser.crearAtributo({
        nombre: nombre.trim(),
        propietario,
        tipo: tipoEfectivo,
        cardMin,
        cardMax,
      })
    }
    onCerrar()
  }

  return (
    <Dialogo
      titulo={existente ? `Atributo ${existente.nombre}` : 'Nuevo atributo'}
      mensaje="Indique el nombre, a qué objeto pertenece, el tipo y la cardinalidad."
      onAceptar={guardar}
      aceptarHabilitado={!!nombre.trim() && !!propietario}
      onCancelar={onCerrar}
    >
      <div className="campo">
        <label htmlFor="atr-nombre">Nombre</label>
        <input
          id="atr-nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoFocus
        />
      </div>

      <div className="campo">
        <label htmlFor="atr-prop">Propietario</label>
        <select
          id="atr-prop"
          value={propietario ? `${propietario.tipo}:${propietario.id}` : ''}
          onChange={(e) => {
            const [t, id] = e.target.value.split(':')
            setPropietario({ tipo: t as RefPropietario['tipo'], id })
          }}
        >
          {opcionesPropietario.map((o) => (
            <option key={`${o.ref.tipo}:${o.ref.id}`} value={`${o.ref.tipo}:${o.ref.id}`}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label>Tipo</label>
        <div className="radios">
          <label>
            <input
              type="radio"
              name="atr-tipo"
              checked={tipoEfectivo === 'simple'}
              onChange={() => setTipo('simple')}
            />
            Simple
          </label>
          <label>
            <input
              type="radio"
              name="atr-tipo"
              checked={tipoEfectivo === 'compuesto'}
              onChange={() => setTipo('compuesto')}
            />
            Compuesto
          </label>
          <label
            title={
              puedeSerIdentificador
                ? undefined
                : 'Solo las entidades tienen identificadores.'
            }
          >
            <input
              type="radio"
              name="atr-tipo"
              checked={tipoEfectivo === 'identificador'}
              disabled={!puedeSerIdentificador}
              onChange={() => setTipo('identificador')}
            />
            Identificador
          </label>
        </div>
      </div>

      {tipoEfectivo !== 'compuesto' && (
        <div className="fila">
          <RadiosCard
            etiqueta="Cardinalidad mínima"
            nombre="atr-min"
            valores={CARD_MIN}
            actual={cardMin}
            onCambiar={(v) => setCardMin(v as CardMin)}
          />
          <RadiosCard
            etiqueta="Cardinalidad máxima"
            nombre="atr-max"
            valores={CARD_MAX}
            actual={cardMax}
            onCambiar={(v) => setCardMax(v as CardMax)}
          />
        </div>
      )}

      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--texto-3)', lineHeight: 1.5 }}>
        {tipoEfectivo === 'compuesto'
          ? 'Un atributo compuesto agrupa otros atributos: creelos indicando que su propietario es este atributo.'
          : cardMax === 'n'
            ? 'Cardinalidad máxima n: el atributo es polivalente y se eliminará en el paso 2 del pasaje a lógico.'
            : 'La cardinalidad se dibuja en el diagrama solo cuando es (0,1) o (0,n).'}
      </p>
    </Dialogo>
  )
}

function prefijo(p: RefPropietario): string {
  return p.tipo === 'entidad' ? '▭' : p.tipo === 'relacion' ? '◇' : '◍'
}

// ===========================================================================
// Lista de atributos reutilizable
// ===========================================================================

function TablaAtributos({
  caser,
  propietario,
  onNuevo,
  onEditar,
}: {
  caser: Caser
  propietario: RefPropietario
  onNuevo: () => void
  onEditar: (id: Id) => void
}) {
  const propios = atributosDe(caser.modelo, propietario)

  return (
    <>
      <table className="tabla-mini">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Card.</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {propios.map((a) => (
            <tr key={a.id}>
              <td>{a.nombre}</td>
              <td>
                <code>
                  {a.tipo === 'identificador'
                    ? 'identificador'
                    : a.tipo === 'compuesto'
                      ? 'compuesto'
                      : 'simple'}
                </code>
              </td>
              <td>
                <code>{a.tipo === 'compuesto' ? '—' : `(${a.cardMin},${a.cardMax})`}</code>
              </td>
              <td className="acc">
                <button type="button" className="mini-btn" onClick={() => onEditar(a.id)}>
                  Modificar
                </button>
                <button
                  type="button"
                  className="mini-btn peligro"
                  onClick={() => caser.borrarAtributo(a.id)}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {propios.length === 0 && <div className="vacio-mini">Sin atributos todavía.</div>}
      <div style={{ marginTop: '0.7rem' }}>
        <button type="button" className="btn" onClick={onNuevo}>
          + Agregar atributo
        </button>
      </div>
    </>
  )
}

// ===========================================================================
// Entidad
// ===========================================================================

type TabEntidad = 'general' | 'atributos' | 'identificadores' | 'jerarquias'

export function DialogoEntidad({
  caser,
  entidadId,
  nombreInicial,
  onCerrar,
}: {
  caser: Caser
  entidadId?: Id
  nombreInicial?: string
  onCerrar: () => void
}) {
  const { modelo } = caser
  const existente = entidadId ? entidad(modelo, entidadId) : undefined

  const jerPadre = entidadId ? jerarquiaComoPadre(modelo, entidadId) : undefined
  const jerHijo = entidadId ? jerarquiaComoHijo(modelo, entidadId) : undefined

  const [tab, setTab] = useState<TabEntidad>('general')
  const [nombre, setNombre] = useState(existente?.nombre ?? nombreInicial ?? '')
  const [rol, setRol] = useState<'generica' | 'padre' | 'hija'>(
    jerHijo ? 'hija' : jerPadre ? 'padre' : 'generica',
  )
  const [padreId, setPadreId] = useState<Id | ''>(jerHijo?.padreId ?? '')
  const [cobertura, setCobertura] = useState<Cobertura>(
    jerHijo?.cobertura ?? jerPadre?.cobertura ?? 'TE',
  )

  const [subDialogo, setSubDialogo] = useState<
    | { tipo: 'atributo'; id?: Id }
    | { tipo: 'identificador' }
    | null
  >(null)

  const posiblesPadres = modelo.entidades.filter((e) => e.id !== entidadId)

  const guardar = () => {
    const limpio = nombre.trim()
    if (!limpio) return
    if (existente) {
      caser.actualizarEntidad(existente.id, {
        nombre: limpio,
        padreId: rol === 'hija' && padreId ? padreId : null,
        cobertura,
        esPadre: rol === 'padre',
      })
    } else {
      caser.crearEntidad({
        nombre: limpio,
        padreId: rol === 'hija' && padreId ? padreId : undefined,
        cobertura,
        esPadre: rol === 'padre',
      })
    }
    onCerrar()
  }

  const tabs: { clave: TabEntidad; etiqueta: string }[] = existente
    ? [
        { clave: 'general', etiqueta: 'Entidad' },
        { clave: 'atributos', etiqueta: 'Atributos' },
        { clave: 'identificadores', etiqueta: 'Identificadores' },
        { clave: 'jerarquias', etiqueta: 'Jerarquías' },
      ]
    : [
        { clave: 'general', etiqueta: 'Entidad' },
        { clave: 'jerarquias', etiqueta: 'Jerarquías' },
      ]

  const identificadores = existente ? identificadoresDe(modelo, existente.id) : []

  return (
    <>
      <Dialogo
        ancho
        titulo={existente ? `Entidad ${existente.nombre}` : 'Nueva entidad'}
        mensaje={
          existente
            ? undefined
            : 'Indique el nombre. Los atributos e identificadores se agregan una vez creada.'
        }
        onAceptar={guardar}
        aceptarHabilitado={!!nombre.trim() && (rol !== 'hija' || !!padreId)}
        onCancelar={onCerrar}
        cancelar={existente ? 'Cerrar' : 'Cancelar'}
      >
        <div style={{ margin: '-1.05rem -1.15rem 1rem' }}>
          <DlgTabs tabs={tabs} activa={tab} onCambiar={setTab} />
        </div>

        {tab === 'general' && (
          <div className="campo">
            <label htmlFor="ent-nombre">Nombre</label>
            <input
              id="ent-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {tab === 'atributos' && existente && (
          <TablaAtributos
            caser={caser}
            propietario={{ tipo: 'entidad', id: existente.id }}
            onNuevo={() => setSubDialogo({ tipo: 'atributo' })}
            onEditar={(id) => setSubDialogo({ tipo: 'atributo', id })}
          />
        )}

        {tab === 'identificadores' && existente && (
          <>
            <table className="tabla-mini">
              <thead>
                <tr>
                  <th>Identificador</th>
                  <th>Tipo</th>
                  <th>Compuesto por</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {identificadores.map((i) => (
                  <tr key={i.id}>
                    <td>{i.nombre}</td>
                    <td>
                      <code>
                        {i.entidadesExternasIds.length > 0
                          ? 'externo'
                          : i.compuesto
                            ? 'compuesto'
                            : 'simple'}
                      </code>
                    </td>
                    <td>
                      <code>
                        {[
                          ...i.atributoIds.map(
                            (aid) => modelo.atributos.find((a) => a.id === aid)?.nombre ?? '?',
                          ),
                          ...i.entidadesExternasIds.map(
                            (eid) => `${entidad(modelo, eid)?.nombre ?? '?'} (ent.)`,
                          ),
                        ].join(', ')}
                      </code>
                    </td>
                    <td className="acc">
                      <button
                        type="button"
                        className="mini-btn peligro"
                        onClick={() => caser.borrarIdentificador(i.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {identificadores.length === 0 && (
              <div className="vacio-mini">
                Sin identificadores. Marque un atributo como Identificador, o agregue uno
                compuesto.
              </div>
            )}
            <div style={{ marginTop: '0.7rem' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setSubDialogo({ tipo: 'identificador' })}
              >
                + Agregar identificador compuesto
              </button>
            </div>
          </>
        )}

        {tab === 'jerarquias' && (
          <>
            <div className="campo">
              <label>Tipo</label>
              <div className="radios">
                <label>
                  <input
                    type="radio"
                    name="ent-rol"
                    checked={rol === 'generica'}
                    onChange={() => setRol('generica')}
                  />
                  Entidad Genérica
                </label>
                <label>
                  <input
                    type="radio"
                    name="ent-rol"
                    checked={rol === 'padre'}
                    onChange={() => setRol('padre')}
                  />
                  Entidad Padre
                </label>
                <label>
                  <input
                    type="radio"
                    name="ent-rol"
                    checked={rol === 'hija'}
                    disabled={posiblesPadres.length === 0}
                    onChange={() => setRol('hija')}
                  />
                  Hija de…
                </label>
              </div>
            </div>

            {rol === 'hija' && (
              <div className="campo">
                <label htmlFor="ent-padre">Entidad padre</label>
                <select
                  id="ent-padre"
                  value={padreId}
                  onChange={(e) => setPadreId(e.target.value)}
                >
                  <option value="">— Elegir —</option>
                  {posiblesPadres.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {rol !== 'generica' && (
              <div className="campo">
                <label htmlFor="ent-cob">Cobertura</label>
                <select
                  id="ent-cob"
                  value={cobertura}
                  onChange={(e) => setCobertura(e.target.value as Cobertura)}
                >
                  {COBERTURAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.abreviatura} {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p
              style={{
                margin: 0,
                fontSize: '0.76rem',
                color: 'var(--texto-3)',
                lineHeight: 1.5,
              }}
            >
              La cobertura Total habilita la opción de eliminar el padre al bajar la jerarquía a
              lógico; con cobertura Parcial esa opción no aplica, porque se perdería información.
            </p>
          </>
        )}
      </Dialogo>

      {subDialogo?.tipo === 'atributo' && existente && (
        <DialogoAtributo
          caser={caser}
          atributoId={subDialogo.id}
          propietarioInicial={{ tipo: 'entidad', id: existente.id }}
          onCerrar={() => setSubDialogo(null)}
        />
      )}

      {subDialogo?.tipo === 'identificador' && existente && (
        <DialogoIdentificador
          caser={caser}
          entidadId={existente.id}
          onCerrar={() => setSubDialogo(null)}
        />
      )}
    </>
  )
}

// ===========================================================================
// Identificador compuesto / externo
// ===========================================================================

export function DialogoIdentificador({
  caser,
  entidadId,
  onCerrar,
}: {
  caser: Caser
  entidadId: Id
  onCerrar: () => void
}) {
  const { modelo } = caser
  const ent = entidad(modelo, entidadId)
  const atributos = atributosDeEntidad(modelo, entidadId).filter((a) => a.tipo !== 'compuesto')
  const candidatas = candidatasIdExterno(modelo, entidadId)
  const todasLasOtras = modelo.entidades.filter((e) => e.id !== entidadId)

  const [nombre, setNombre] = useState('id')
  const [compuesto, setCompuesto] = useState(true)
  const [atributoIds, setAtributoIds] = useState<Id[]>([])
  const [entidadesIds, setEntidadesIds] = useState<Id[]>([])
  const [tab, setTab] = useState<'atributos' | 'entidades'>('atributos')

  const etiquetaAtributo = (id: Id) => modelo.atributos.find((a) => a.id === id)?.nombre ?? '?'
  const etiquetaEntidad = (id: Id) => entidad(modelo, id)?.nombre ?? '?'

  const sinCandidatas = candidatas.length === 0 && todasLasOtras.length > 0

  const guardar = () => {
    if (atributoIds.length === 0 && entidadesIds.length === 0) return
    caser.crearIdentificadorCompuesto({
      entidadId,
      nombre: nombre.trim() || 'id',
      atributoIds,
      entidadesExternasIds: compuesto ? entidadesIds : [],
    })
    onCerrar()
  }

  return (
    <Dialogo
      ancho
      titulo={`Identificador de ${ent?.nombre ?? '?'}`}
      mensaje="Elija los atributos que forman el identificador. Si además incluye una entidad, será un identificador externo."
      onAceptar={guardar}
      aceptarHabilitado={atributoIds.length + entidadesIds.length > 0}
      onCancelar={onCerrar}
    >
      <div className="campo">
        <label htmlFor="id-nombre">Nombre Identificador</label>
        <input
          id="id-nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="campo">
        <label>Tipo</label>
        <div className="radios">
          <label>
            <input type="radio" name="id-tipo" checked={!compuesto} onChange={() => setCompuesto(false)} />
            Simple
          </label>
          <label>
            <input type="radio" name="id-tipo" checked={compuesto} onChange={() => setCompuesto(true)} />
            Compuesto
          </label>
        </div>
      </div>

      <div style={{ margin: '0 -1.15rem 0.9rem' }}>
        <DlgTabs
          tabs={[
            { clave: 'atributos' as const, etiqueta: 'Atributos' },
            { clave: 'entidades' as const, etiqueta: 'Entidades (id externo)' },
          ]}
          activa={tab}
          onCambiar={setTab}
        />
      </div>

      {tab === 'atributos' && (
        <Transfer
          tituloDisponibles="Atributos de la entidad"
          tituloElegidos="Forman el identificador"
          disponibles={atributos
            .filter((a) => !atributoIds.includes(a.id))
            .map((a) => ({ id: a.id, etiqueta: a.nombre }))}
          elegidos={atributoIds.map((id) => ({ id, etiqueta: etiquetaAtributo(id) }))}
          onCambiar={setAtributoIds}
        />
      )}

      {tab === 'entidades' && (
        <>
          <Transfer
            tituloDisponibles="Entidades disponibles"
            tituloElegidos="Parte del identificador"
            disponibles={candidatas
              .filter((e) => !entidadesIds.includes(e.id))
              .map((e) => ({ id: e.id, etiqueta: e.nombre }))}
            elegidos={entidadesIds.map((id) => ({ id, etiqueta: etiquetaEntidad(id) }))}
            onCambiar={setEntidadesIds}
          />
          <p
            style={{
              margin: '0.7rem 0 0',
              fontSize: '0.76rem',
              color: sinCandidatas ? 'var(--aviso)' : 'var(--texto-3)',
              lineHeight: 1.5,
            }}
          >
            {sinCandidatas
              ? 'Ninguna entidad puede formar un identificador externo: hace falta que la relación con esta entidad tenga cardinalidad (1,1) de uno de los lados.'
              : 'Solo se listan las entidades cuya relación con esta tiene cardinalidad (1,1) de un lado, que es la condición para el identificador externo.'}
          </p>
        </>
      )}
    </Dialogo>
  )
}

// ===========================================================================
// Relacion
// ===========================================================================

type TabRelacion = 'entidades' | 'cardinalidad' | 'atributos'

export function DialogoRelacion({
  caser,
  relacionId,
  nombreInicial,
  onCerrar,
}: {
  caser: Caser
  relacionId?: Id
  nombreInicial?: string
  onCerrar: () => void
}) {
  const { modelo } = caser
  const existente = relacionId ? relacion(modelo, relacionId) : undefined

  const [tab, setTab] = useState<TabRelacion>('entidades')
  const [nombre, setNombre] = useState(existente?.nombre ?? nombreInicial ?? '')
  const [patas, setPatas] = useState<Pata[]>(
    existente?.patas ?? [
      { entidadId: modelo.entidades[0]?.id ?? '', cardMin: '1', cardMax: 'n' },
      { entidadId: modelo.entidades[1]?.id ?? modelo.entidades[0]?.id ?? '', cardMin: '1', cardMax: 'n' },
    ],
  )
  const [ternaria, setTernaria] = useState((existente?.patas.length ?? 2) === 3)
  const [subAtributo, setSubAtributo] = useState<{ id?: Id } | null>(null)

  const patasEfectivas = ternaria
    ? [
        ...patas.slice(0, 2),
        patas[2] ?? {
          entidadId: modelo.entidades[0]?.id ?? '',
          cardMin: '1' as CardMin,
          cardMax: 'n' as CardMax,
        },
      ]
    : patas.slice(0, 2)

  const cambiarPata = (i: number, cambios: Partial<Pata>) => {
    setPatas((actuales) => {
      const copia = [...patasEfectivas]
      copia[i] = { ...copia[i], ...cambios }
      return copia.length >= actuales.length ? copia : actuales
    })
  }

  const completas = patasEfectivas.every((p) => !!p.entidadId)

  const guardar = () => {
    const limpio = nombre.trim()
    if (!limpio || !completas) return
    if (existente) caser.actualizarRelacion(existente.id, limpio, patasEfectivas)
    else caser.crearRelacion(limpio, patasEfectivas)
    onCerrar()
  }

  const tabs: { clave: TabRelacion; etiqueta: string }[] = existente
    ? [
        { clave: 'entidades', etiqueta: 'Entidades' },
        { clave: 'cardinalidad', etiqueta: 'Cardinalidad' },
        { clave: 'atributos', etiqueta: 'Atributos' },
      ]
    : [
        { clave: 'entidades', etiqueta: 'Entidades' },
        { clave: 'cardinalidad', etiqueta: 'Cardinalidad' },
      ]

  if (modelo.entidades.length < 1) {
    return (
      <Dialogo
        titulo="Nueva relación"
        mensaje="Primero cree al menos una entidad: una relación vincula entidades."
        onAceptar={onCerrar}
        aceptar="Entendido"
      />
    )
  }

  return (
    <>
      <Dialogo
        ancho
        titulo={existente ? `Relación ${existente.nombre}` : 'Nueva relación'}
        mensaje="Indique el nombre, las entidades relacionadas y su cardinalidad. CasER permite hasta relaciones ternarias."
        onAceptar={guardar}
        aceptarHabilitado={!!nombre.trim() && completas}
        onCancelar={onCerrar}
        cancelar={existente ? 'Cerrar' : 'Cancelar'}
      >
        <div style={{ margin: '-1.05rem -1.15rem 1rem' }}>
          <DlgTabs tabs={tabs} activa={tab} onCambiar={setTab} />
        </div>

        {tab === 'entidades' && (
          <>
            <div className="campo">
              <label htmlFor="rel-nombre">Nombre</label>
              <input
                id="rel-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus
              />
            </div>

            {patasEfectivas.map((p, i) => (
              <div className="campo" key={i}>
                <label htmlFor={`rel-ent-${i}`}>Entidad {i + 1}</label>
                <select
                  id={`rel-ent-${i}`}
                  value={p.entidadId}
                  onChange={(e) => cambiarPata(i, { entidadId: e.target.value })}
                >
                  {modelo.entidades.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.82rem',
              }}
            >
              <input
                type="checkbox"
                checked={ternaria}
                onChange={(e) => setTernaria(e.target.checked)}
                style={{ accentColor: 'var(--acento)' }}
              />
              Relación ternaria (tres entidades)
            </label>
          </>
        )}

        {tab === 'cardinalidad' && (
          <>
            {patasEfectivas.map((p, i) => (
              <div
                key={i}
                style={{
                  paddingBottom: '0.6rem',
                  marginBottom: '0.6rem',
                  borderBottom:
                    i < patasEfectivas.length - 1 ? '1px solid var(--borde)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 650,
                    marginBottom: '0.4rem',
                  }}
                >
                  {entidad(modelo, p.entidadId)?.nombre ?? `Entidad ${i + 1}`}
                </div>
                <div className="fila">
                  <RadiosCard
                    etiqueta="Cardinalidad mínima"
                    nombre={`rel-min-${i}`}
                    valores={CARD_MIN}
                    actual={p.cardMin}
                    onCambiar={(v) => cambiarPata(i, { cardMin: v as CardMin })}
                  />
                  <RadiosCard
                    etiqueta="Cardinalidad máxima"
                    nombre={`rel-max-${i}`}
                    valores={CARD_MAX}
                    actual={p.cardMax}
                    onCambiar={(v) => cambiarPata(i, { cardMax: v as CardMax })}
                  />
                </div>
              </div>
            ))}
            <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--texto-3)', lineHeight: 1.5 }}>
              La cardinalidad indica en cuántas instancias de la relación participa cada
              ocurrencia de esa entidad. Un lado en (1,1) es lo que habilita el identificador
              externo.
            </p>
          </>
        )}

        {tab === 'atributos' && existente && (
          <TablaAtributos
            caser={caser}
            propietario={{ tipo: 'relacion', id: existente.id }}
            onNuevo={() => setSubAtributo({})}
            onEditar={(id) => setSubAtributo({ id })}
          />
        )}
      </Dialogo>

      {subAtributo && existente && (
        <DialogoAtributo
          caser={caser}
          atributoId={subAtributo.id}
          propietarioInicial={{ tipo: 'relacion', id: existente.id }}
          onCerrar={() => setSubAtributo(null)}
        />
      )}
    </>
  )
}

// ===========================================================================
// Atributo compuesto: editar sus hijos
// ===========================================================================

export function DialogoCompuestoHijos({
  caser,
  compuestoId,
  onCerrar,
}: {
  caser: Caser
  compuestoId: Id
  onCerrar: () => void
}) {
  const { modelo } = caser
  const comp = modelo.atributos.find((a) => a.id === compuestoId)
  const [nombre, setNombre] = useState(comp?.nombre ?? '')
  const [sub, setSub] = useState<{ id?: Id } | null>(null)

  if (!comp) return null

  return (
    <>
      <Dialogo
        ancho
        titulo={`Atributo compuesto ${comp.nombre}`}
        mensaje="Los atributos simples que lo forman se agregan acá."
        onAceptar={() => {
          if (nombre.trim()) caser.actualizarAtributo(comp.id, { nombre: nombre.trim() })
          onCerrar()
        }}
        onCancelar={onCerrar}
        cancelar="Cerrar"
      >
        <div className="campo">
          <label htmlFor="comp-nombre">Nombre</label>
          <input
            id="comp-nombre"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <TablaAtributos
          caser={caser}
          propietario={{ tipo: 'compuesto', id: comp.id }}
          onNuevo={() => setSub({})}
          onEditar={(id) => setSub({ id })}
        />
      </Dialogo>

      {sub && (
        <DialogoAtributo
          caser={caser}
          atributoId={sub.id}
          propietarioInicial={{ tipo: 'compuesto', id: comp.id }}
          onCerrar={() => setSub(null)}
        />
      )}
    </>
  )
}

/** Helper para el menu contextual: nombre legible de una referencia. */
export function etiquetaRef(modelo: Modelo, ref: RefPropietario): string {
  return nombreDe(modelo, ref)
}
