/**
 * Los cuatro casos del Manual.pdf, que entre los cuatro cubren cada
 * transformacion del pasaje. Se testea el motor (`domain/`), sin UI.
 */

import { describe, expect, it } from 'vitest'
import type { Cobertura, Modelo } from '../types'
import { modeloVacio, pipelineInicial } from '../types'
import {
  agregarAtributo,
  agregarEntidad,
  agregarIdentificador,
  agregarJerarquia,
  agregarRelacion,
  editar,
} from '../edits'
import {
  atributosDeEntidad,
  camposClave,
  identificadoresDe,
  opcionesJerarquia,
  primerCompuesto,
  primeraJerarquia,
  primerPolivalente,
  puedeSerIdExterno,
} from '../queries'
import { eliminarCompuesto, opcionesCompuesto } from '../transform/compuestos'
import { eliminarPolivalente } from '../transform/polivalentes'
import { eliminarJerarquia } from '../transform/jerarquias'
import { eliminarIdExternos } from '../transform/idExternos'
import { pasarATablas } from '../transform/tablas'
import { bitacoraVacia } from '../log'
import {
  aplicarDecision,
  comenzarLogico,
  proximaAccion,
  puedeComenzarFisico,
  puedeComenzarLogico,
  snapshotProgreso,
} from '../pipeline'

const log = () => bitacoraVacia(new Date('2026-08-23T12:00:00'))

function ent(m: Modelo, nombre: string): string {
  return m.entidades.find((e) => e.nombre === nombre)!.id
}

function nombresAtributos(m: Modelo, entidadId: string): string[] {
  return atributosDeEntidad(m, entidadId).map((a) => a.nombre)
}

// ===========================================================================
// Caso 1 — persona con atributo compuesto direccion (Fig. 34-36)
// ===========================================================================

/** persona(dni, direccion{calle, nro, ciudad}) */
function modeloPersonaDireccion(): Modelo {
  return editar(modeloVacio(), (m) => {
    const persona = agregarEntidad(m, 'persona')
    const dni = agregarAtributo(m, {
      nombre: 'dni',
      propietario: { tipo: 'entidad', id: persona },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: persona,
      nombre: 'dni',
      compuesto: false,
      atributoIds: [dni],
      entidadesExternasIds: [],
    })
    const dir = agregarAtributo(m, {
      nombre: 'direccion',
      propietario: { tipo: 'entidad', id: persona },
      tipo: 'compuesto',
      cardMin: '1',
      cardMax: '1',
    })
    for (const n of ['calle', 'nro', 'ciudad']) {
      agregarAtributo(m, {
        nombre: n,
        propietario: { tipo: 'compuesto', id: dir },
        tipo: 'simple',
        cardMin: '1',
        cardMax: '1',
      })
    }
  })
}

describe('Caso 1 — atributo compuesto', () => {
  it('detecta el compuesto y ofrece las tres opciones', () => {
    const m = modeloPersonaDireccion()
    const c = primerCompuesto(m)!
    expect(c.nombre).toBe('direccion')
    expect(opcionesCompuesto(m, c)).toEqual(['A', 'B', 'C'])
  })

  it('opción A concatena los atributos simples con guiones', () => {
    const m = modeloPersonaDireccion()
    const r = eliminarCompuesto(m, log(), primerCompuesto(m)!, 'A')
    const persona = ent(r.modelo, 'persona')
    expect(nombresAtributos(r.modelo, persona)).toEqual(['dni', 'calle-nro-ciudad'])
    // El compuesto y sus hijos desaparecen.
    expect(r.modelo.atributos.filter((a) => a.tipo === 'compuesto')).toHaveLength(0)
    expect(r.modelo.atributos).toHaveLength(2)
  })

  it('opción B deja los atributos simples independientes', () => {
    const m = modeloPersonaDireccion()
    const r = eliminarCompuesto(m, log(), primerCompuesto(m)!, 'B')
    const persona = ent(r.modelo, 'persona')
    expect(nombresAtributos(r.modelo, persona)).toEqual(['dni', 'calle', 'nro', 'ciudad'])
    expect(r.modelo.entidades).toHaveLength(1)
  })

  it('opción C crea la entidad direccion y la relación (1,1)-(1,1) — Fig. 36', () => {
    const m = modeloPersonaDireccion()
    const r = eliminarCompuesto(m, log(), primerCompuesto(m)!, 'C')

    expect(r.modelo.entidades.map((e) => e.nombre).sort()).toEqual(['direccion', 'persona'])

    const rel = r.modelo.relaciones.find((x) => x.nombre === 'persona_direccion')!
    expect(rel).toBeDefined()
    expect(rel.patas).toHaveLength(2)
    expect(rel.patas.every((p) => p.cardMin === '1' && p.cardMax === '1')).toBe(true)

    const dir = ent(r.modelo, 'direccion')
    expect(nombresAtributos(r.modelo, dir).sort()).toEqual([
      'calle',
      'ciudad',
      'id_direccion',
      'nro',
    ])
    expect(camposClave(r.modelo, dir)).toEqual(['id_direccion'])
  })

  it('bloquea la opción C si el compuesto cuelga de una relación ternaria', () => {
    const m = editar(modeloVacio(), (mm) => {
      const a = agregarEntidad(mm, 'a')
      const b = agregarEntidad(mm, 'b')
      const c = agregarEntidad(mm, 'c')
      const rel = agregarRelacion(mm, 'tern', [
        { entidadId: a, cardMin: '1', cardMax: 'n' },
        { entidadId: b, cardMin: '1', cardMax: 'n' },
        { entidadId: c, cardMin: '1', cardMax: 'n' },
      ])
      const comp = agregarAtributo(mm, {
        nombre: 'compu',
        propietario: { tipo: 'relacion', id: rel },
        tipo: 'compuesto',
        cardMin: '1',
        cardMax: '1',
      })
      agregarAtributo(mm, {
        nombre: 'x',
        propietario: { tipo: 'compuesto', id: comp },
        tipo: 'simple',
        cardMin: '1',
        cardMax: '1',
      })
    })
    const c = primerCompuesto(m)!
    expect(opcionesCompuesto(m, c)).toEqual(['A', 'B'])
    // Elegir C de todas formas no cambia el modelo, solo lo registra en el log.
    const r = eliminarCompuesto(m, log(), c, 'C')
    expect(r.modelo).toBe(m)
    expect(r.bitacora.entradas.some((e) => e.texto.includes('4-narias'))).toBe(true)
  })
})

// ===========================================================================
// Caso 2 — pelicula con atributo polivalente titulos (Fig. 38-40)
// ===========================================================================

function modeloPeliculaTitulos(): Modelo {
  return editar(modeloVacio(), (m) => {
    const peli = agregarEntidad(m, 'pelicula')
    const cod = agregarAtributo(m, {
      nombre: 'codigo',
      propietario: { tipo: 'entidad', id: peli },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: peli,
      nombre: 'codigo',
      compuesto: false,
      atributoIds: [cod],
      entidadesExternasIds: [],
    })
    agregarAtributo(m, {
      nombre: 'titulos',
      propietario: { tipo: 'entidad', id: peli },
      tipo: 'simple',
      cardMin: '1',
      cardMax: 'n',
    })
  })
}

describe('Caso 2 — atributo polivalente', () => {
  it('lo detecta por cardinalidad máxima n', () => {
    const m = modeloPeliculaTitulos()
    expect(primerPolivalente(m)!.nombre).toBe('titulos')
  })

  it('crea entidad y relación, con (1,n) del lado del origen', () => {
    const m = modeloPeliculaTitulos()
    const r = eliminarPolivalente(m, log(), primerPolivalente(m)!, { min: '1', max: 'n' })

    expect(r.modelo.entidades.map((e) => e.nombre).sort()).toEqual(['pelicula', 'titulos'])

    const rel = r.modelo.relaciones.find((x) => x.nombre === 'pelicula_titulos')!
    expect(rel).toBeDefined()
    const ladoPeli = rel.patas.find((p) => p.entidadId === ent(r.modelo, 'pelicula'))!
    expect([ladoPeli.cardMin, ladoPeli.cardMax]).toEqual(['1', 'n'])

    // El identificador de la entidad nueva es el nombre del atributo.
    const titulos = ent(r.modelo, 'titulos')
    expect(camposClave(r.modelo, titulos)).toEqual(['titulos'])
    expect(r.modelo.entidades.find((e) => e.id === titulos)!.nacioDeAtrPoli).toBe('titulos')

    // El atributo polivalente ya no existe.
    expect(nombresAtributos(r.modelo, ent(r.modelo, 'pelicula'))).toEqual(['codigo'])
  })

  it('respeta la cardinalidad mínima que elige el usuario', () => {
    const m = modeloPeliculaTitulos()
    const r = eliminarPolivalente(m, log(), primerPolivalente(m)!, { min: '0', max: 'n' })
    const rel = r.modelo.relaciones[0]
    const ladoNuevo = rel.patas.find((p) => p.entidadId !== ent(r.modelo, 'pelicula'))!
    expect([ladoNuevo.cardMin, ladoNuevo.cardMax]).toEqual(['0', 'n'])
  })
})

// ===========================================================================
// Caso 3 — jerarquia socio / socio_vip, socio_comun (Fig. 26-30, 42)
// ===========================================================================

function modeloJerarquia(cobertura: Cobertura): Modelo {
  return editar(modeloVacio(), (m) => {
    const socio = agregarEntidad(m, 'socio')
    const nro = agregarAtributo(m, {
      nombre: 'nro_socio',
      propietario: { tipo: 'entidad', id: socio },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: socio,
      nombre: 'nro_socio',
      compuesto: false,
      atributoIds: [nro],
      entidadesExternasIds: [],
    })
    agregarAtributo(m, {
      nombre: 'nombre',
      propietario: { tipo: 'entidad', id: socio },
      tipo: 'simple',
      cardMin: '1',
      cardMax: '1',
    })

    const vip = agregarEntidad(m, 'socio_vip')
    agregarAtributo(m, {
      nombre: 'descuento',
      propietario: { tipo: 'entidad', id: vip },
      tipo: 'simple',
      cardMin: '1',
      cardMax: '1',
    })
    const comun = agregarEntidad(m, 'socio_comun')
    agregarAtributo(m, {
      nombre: 'cuota',
      propietario: { tipo: 'entidad', id: comun },
      tipo: 'simple',
      cardMin: '1',
      cardMax: '1',
    })

    agregarJerarquia(m, socio, [vip, comun], cobertura)
  })
}

describe('Caso 3 — jerarquías', () => {
  it('cobertura Total ofrece A/B/C y Parcial solo A/B — Fig. 42', () => {
    for (const c of ['TE', 'TS'] as Cobertura[]) {
      const m = modeloJerarquia(c)
      expect(opcionesJerarquia(m, primeraJerarquia(m)!).opciones).toEqual(['A', 'B', 'C'])
    }
    for (const c of ['PE', 'PS'] as Cobertura[]) {
      const m = modeloJerarquia(c)
      expect(opcionesJerarquia(m, primeraJerarquia(m)!).opciones).toEqual(['A', 'B'])
    }
  })

  it('fuerza B si un hijo es a su vez padre de otra jerarquía', () => {
    const m = editar(modeloJerarquia('TE'), (mm) => {
      const vip = ent(mm, 'socio_vip')
      const oro = agregarEntidad(mm, 'socio_oro')
      agregarJerarquia(mm, vip, [oro], 'TE')
    })
    const j = primeraJerarquia(m)!
    const { opciones, forzada, motivo } = opcionesJerarquia(m, j)
    expect(opciones).toEqual(['B'])
    expect(forzada).toBe(true)
    expect(motivo).toContain('no le damos la opción de eliminar a los hijos')
  })

  it('opción A elimina los hijos, crea categoria y sube atributos opcionales', () => {
    const m = modeloJerarquia('TE')
    const r = eliminarJerarquia(m, log(), primeraJerarquia(m)!, 'A')

    expect(r.modelo.entidades.map((e) => e.nombre)).toEqual(['socio'])
    expect(r.modelo.jerarquias).toHaveLength(0)

    const socio = ent(r.modelo, 'socio')
    const atrs = atributosDeEntidad(r.modelo, socio)
    expect(atrs.map((a) => a.nombre)).toEqual([
      'nro_socio',
      'nombre',
      'categoria',
      'descuento',
      'cuota',
    ])

    // Los atributos heredados quedan opcionales (0,1).
    for (const n of ['descuento', 'cuota']) {
      const a = atrs.find((x) => x.nombre === n)!
      expect([a.cardMin, a.cardMax]).toEqual(['0', '1'])
    }
    // El discriminante es obligatorio.
    const cat = atrs.find((x) => x.nombre === 'categoria')!
    expect([cat.cardMin, cat.cardMax]).toEqual(['1', '1'])
  })

  it('opción B conserva todo y genera relaciones es_un (0,1)-(1,1)', () => {
    const m = modeloJerarquia('PE')
    const r = eliminarJerarquia(m, log(), primeraJerarquia(m)!, 'B')

    expect(r.modelo.entidades).toHaveLength(3)
    expect(r.modelo.jerarquias).toHaveLength(0)
    expect(r.modelo.relaciones.map((x) => x.nombre).sort()).toEqual([
      'es_un_socio_comun',
      'es_un_socio_vip',
    ])

    const rel = r.modelo.relaciones.find((x) => x.nombre === 'es_un_socio_vip')!
    const ladoPadre = rel.patas.find((p) => p.entidadId === ent(r.modelo, 'socio'))!
    const ladoHijo = rel.patas.find((p) => p.entidadId === ent(r.modelo, 'socio_vip'))!
    expect([ladoPadre.cardMin, ladoPadre.cardMax]).toEqual(['0', '1'])
    expect([ladoHijo.cardMin, ladoHijo.cardMax]).toEqual(['1', '1'])
  })

  it('opción C elimina el padre y baja su clave y atributos a los hijos', () => {
    const m = modeloJerarquia('TE')
    const r = eliminarJerarquia(m, log(), primeraJerarquia(m)!, 'C')

    expect(r.modelo.entidades.map((e) => e.nombre).sort()).toEqual([
      'socio_comun',
      'socio_vip',
    ])

    const vip = ent(r.modelo, 'socio_vip')
    expect(nombresAtributos(r.modelo, vip).sort()).toEqual(['descuento', 'nombre', 'nro_socio'])
    // La clave del padre pasa a ser la clave del hijo.
    expect(camposClave(r.modelo, vip)).toEqual(['nro_socio'])
  })
})

// ===========================================================================
// Caso 4 — identificador externo: oficina / sucursal (Fig. 22-25)
// ===========================================================================

/**
 * oficina(numero_oficina + id de sucursal) con la relacion en (1,1) del lado de
 * oficina, que es la condicion que pide el manual.
 */
function modeloIdExterno(cardOficina: ['0' | '1', '1' | 'n'] = ['1', '1']): Modelo {
  return editar(modeloVacio(), (m) => {
    const sucursal = agregarEntidad(m, 'sucursal')
    const codSuc = agregarAtributo(m, {
      nombre: 'cod_sucursal',
      propietario: { tipo: 'entidad', id: sucursal },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarIdentificador(m, {
      entidadId: sucursal,
      nombre: 'cod_sucursal',
      compuesto: false,
      atributoIds: [codSuc],
      entidadesExternasIds: [],
    })

    const oficina = agregarEntidad(m, 'oficina')
    const nro = agregarAtributo(m, {
      nombre: 'numero_oficina',
      propietario: { tipo: 'entidad', id: oficina },
      tipo: 'identificador',
      cardMin: '1',
      cardMax: '1',
    })
    agregarAtributo(m, {
      nombre: 'metros',
      propietario: { tipo: 'entidad', id: oficina },
      tipo: 'simple',
      cardMin: '1',
      cardMax: '1',
    })

    agregarRelacion(m, 'oficina_sucursal', [
      { entidadId: oficina, cardMin: cardOficina[0], cardMax: cardOficina[1] },
      { entidadId: sucursal, cardMin: '1', cardMax: 'n' },
    ])

    // Identificador externo: numero_oficina + la entidad sucursal.
    agregarIdentificador(m, {
      entidadId: oficina,
      nombre: 'id',
      compuesto: true,
      atributoIds: [nro],
      entidadesExternasIds: [sucursal],
    })
  })
}

describe('Caso 4 — identificador externo', () => {
  it('exige (1,1) de un lado de la relación — Fig. 22', () => {
    const ok = modeloIdExterno(['1', '1'])
    expect(puedeSerIdExterno(ok, ent(ok, 'oficina'), ent(ok, 'sucursal'))).toBe(true)

    const mal = modeloIdExterno(['0', 'n'])
    expect(puedeSerIdExterno(mal, ent(mal, 'oficina'), ent(mal, 'sucursal'))).toBe(false)
  })

  it('al eliminarlo, trae la clave de la entidad externa como clave local', () => {
    const m = modeloIdExterno()
    const r = eliminarIdExternos(m, log())

    const oficina = ent(r.modelo, 'oficina')
    const ids = identificadoresDe(r.modelo, oficina)
    expect(ids).toHaveLength(1)
    expect(ids[0].entidadesExternasIds).toEqual([])
    expect(ids[0].compuesto).toBe(true)
    expect(camposClave(r.modelo, oficina)).toEqual(['numero_oficina', 'cod_sucursal'])
  })

  it('informa cuando no hay identificadores externos', () => {
    const m = modeloPersonaDireccion()
    const r = eliminarIdExternos(m, log())
    expect(r.modelo).toBe(m)
    expect(r.bitacora.entradas.some((e) => e.texto.includes('No se encontraron'))).toBe(true)
  })
})

// ===========================================================================
// Pasaje a tablas — matriz de cardinalidades
// ===========================================================================

/** Dos entidades con clave propia y una relacion con las cardinalidades dadas. */
function modeloRelacion(
  c1: ['0' | '1', '1' | 'n'],
  c2: ['0' | '1', '1' | 'n'],
  atributosRelacion: string[] = [],
): Modelo {
  return editar(modeloVacio(), (m) => {
    const mk = (nombre: string, clave: string) => {
      const id = agregarEntidad(m, nombre)
      const a = agregarAtributo(m, {
        nombre: clave,
        propietario: { tipo: 'entidad', id },
        tipo: 'identificador',
        cardMin: '1',
        cardMax: '1',
      })
      agregarIdentificador(m, {
        entidadId: id,
        nombre: clave,
        compuesto: false,
        atributoIds: [a],
        entidadesExternasIds: [],
      })
      return id
    }
    const e1 = mk('e1', 'k1')
    const e2 = mk('e2', 'k2')
    const rel = agregarRelacion(m, 'rel', [
      { entidadId: e1, cardMin: c1[0], cardMax: c1[1] },
      { entidadId: e2, cardMin: c2[0], cardMax: c2[1] },
    ])
    for (const n of atributosRelacion) {
      agregarAtributo(m, {
        nombre: n,
        propietario: { tipo: 'relacion', id: rel },
        tipo: 'simple',
        cardMin: '1',
        cardMax: '1',
      })
    }
  })
}

describe('Pasaje a tablas', () => {
  it('(1,1)-(1,1) fusiona en una sola tabla', () => {
    const r = pasarATablas(modeloRelacion(['1', '1'], ['1', '1']), log())
    expect(r.tablas.map((t) => t.nombre)).toEqual(['e1'])
    const t = r.tablas[0]
    expect(t.claves).toEqual(['k1'])
    expect(t.campos).toContain('k2')
  })

  it('n-n crea la tabla de la relación con clave combinada', () => {
    const r = pasarATablas(modeloRelacion(['1', 'n'], ['1', 'n'], ['fecha']), log())
    expect(r.tablas.map((t) => t.nombre).sort()).toEqual(['e1', 'e2', 'rel'])
    const rel = r.tablas.find((t) => t.nombre === 'rel')!
    expect(rel.claves).toEqual(['k1', 'k2'])
    expect(rel.campos).toEqual(['fecha'])
  })

  it('1:N pasa la clave del lado n como foránea al lado 1', () => {
    // e1 participa en 1 instancia, e2 en muchas: cada e2 tiene muchos e1.
    const r = pasarATablas(modeloRelacion(['1', '1'], ['1', 'n']), log())
    expect(r.tablas.map((t) => t.nombre).sort()).toEqual(['e1', 'e2'])
    const t1 = r.tablas.find((t) => t.nombre === 'e1')!
    expect(t1.claves).toEqual(['k1'])
    expect(t1.campos).toContain('k2')
    expect(t1.foraneas).toContain('k2')
    // Del otro lado no se agrega nada.
    expect(r.tablas.find((t) => t.nombre === 'e2')!.campos).toEqual([])
  })

  it('1:1 con un lado opcional deja dos tablas y una foránea', () => {
    const r = pasarATablas(modeloRelacion(['0', '1'], ['1', '1']), log())
    expect(r.tablas.map((t) => t.nombre).sort()).toEqual(['e1', 'e2'])
    const opc = r.tablas.find((t) => t.nombre === 'e1')!
    expect(opc.claves).toEqual(['k1'])
    expect(opc.foraneas).toContain('k2')
  })

  it('relación recursiva distingue los dos roles', () => {
    const m = editar(modeloVacio(), (mm) => {
      const e = agregarEntidad(mm, 'empleado')
      const a = agregarAtributo(mm, {
        nombre: 'legajo',
        propietario: { tipo: 'entidad', id: e },
        tipo: 'identificador',
        cardMin: '1',
        cardMax: '1',
      })
      agregarIdentificador(mm, {
        entidadId: e,
        nombre: 'legajo',
        compuesto: false,
        atributoIds: [a],
        entidadesExternasIds: [],
      })
      agregarRelacion(mm, 'supervisa', [
        { entidadId: e, cardMin: '0', cardMax: 'n' },
        { entidadId: e, cardMin: '0', cardMax: '1' },
      ])
    })
    const r = pasarATablas(m, log())
    const rel = r.tablas.find((t) => t.nombre === 'supervisa')!
    expect(rel.claves).toEqual(['legajo_1', 'legajo_2'])
  })

  it('la ternaria toma las claves de las tres entidades', () => {
    const m = editar(modeloVacio(), (mm) => {
      const ids = ['a', 'b', 'c'].map((n) => {
        const id = agregarEntidad(mm, n)
        const at = agregarAtributo(mm, {
          nombre: `k_${n}`,
          propietario: { tipo: 'entidad', id },
          tipo: 'identificador',
          cardMin: '1',
          cardMax: '1',
        })
        agregarIdentificador(mm, {
          entidadId: id,
          nombre: `k_${n}`,
          compuesto: false,
          atributoIds: [at],
          entidadesExternasIds: [],
        })
        return id
      })
      agregarRelacion(
        mm,
        'tern',
        ids.map((id) => ({ entidadId: id, cardMin: '1' as const, cardMax: 'n' as const })),
      )
    })
    const r = pasarATablas(m, log())
    expect(r.tablas.find((t) => t.nombre === 'tern')!.claves).toEqual(['k_a', 'k_b', 'k_c'])
  })

  it('una entidad sin identificador recibe id_<entidad>', () => {
    const m = editar(modeloVacio(), (mm) => {
      agregarEntidad(mm, 'suelta')
    })
    const r = pasarATablas(m, log())
    expect(r.tablas[0].claves).toEqual(['id_suelta'])
  })
})

// ===========================================================================
// Pipeline completo y gating de estados
// ===========================================================================

describe('Pipeline', () => {
  it('no deja pasar a lógico sin finalizar el conceptual', () => {
    const m = modeloPersonaDireccion()
    expect(puedeComenzarLogico(m).ok).toBe(false)
    expect(puedeComenzarLogico(m).mensaje).toContain('debe finalizar el Modelo Conceptual')

    const finalizado = { ...m, estado: 'MCdef' as const }
    expect(puedeComenzarLogico(finalizado).ok).toBe(true)
  })

  it('no deja pasar a físico antes de terminar el lógico', () => {
    const m = { ...modeloPersonaDireccion(), estado: 'MLAN' as const }
    expect(puedeComenzarFisico(m, pipelineInicial()).mensaje).toContain(
      'debe finalizar el proceso lógico',
    )
    expect(
      puedeComenzarFisico(m, { ...pipelineInicial(), finLogico: true }).ok,
    ).toBe(true)
  })

  it('recorre los tres pasos en orden y termina', () => {
    // Un modelo con un compuesto, un polivalente y una jerarquía.
    let m = editar(modeloJerarquia('TE'), (mm) => {
      const socio = ent(mm, 'socio')
      const dir = agregarAtributo(mm, {
        nombre: 'direccion',
        propietario: { tipo: 'entidad', id: socio },
        tipo: 'compuesto',
        cardMin: '1',
        cardMax: '1',
      })
      agregarAtributo(mm, {
        nombre: 'calle',
        propietario: { tipo: 'compuesto', id: dir },
        tipo: 'simple',
        cardMin: '1',
        cardMax: '1',
      })
      agregarAtributo(mm, {
        nombre: 'telefonos',
        propietario: { tipo: 'entidad', id: socio },
        tipo: 'simple',
        cardMin: '1',
        cardMax: 'n',
      })
    })
    m = { ...m, estado: 'MCdef' }

    // El snapshot de progreso ve los tres tipos de item.
    const progreso = snapshotProgreso(m)
    expect(progreso.filter((p) => p.clase === 'compuesto')).toHaveLength(1)
    expect(progreso.filter((p) => p.clase === 'polivalente')).toHaveLength(1)
    expect(progreso.filter((p) => p.clase === 'jerarquia')).toHaveLength(1)

    let estado = {
      ...comenzarLogico(m, pipelineInicial()),
      bitacora: log(),
    }

    const pasos: string[] = []
    for (let i = 0; i < 20 && !estado.pipeline.finLogico; i++) {
      const accion = proximaAccion(estado.modelo, estado.pipeline)
      pasos.push(accion.peticion.tipo)
      const decision =
        accion.peticion.tipo === 'compuesto'
          ? ({ tipo: 'compuesto', opcion: 'B' } as const)
          : accion.peticion.tipo === 'polivalente'
            ? ({ tipo: 'polivalente', cardMin: '1', cardMax: 'n' } as const)
            : accion.peticion.tipo === 'jerarquia'
              ? ({ tipo: 'jerarquia', opcion: 'A' } as const)
              : accion.peticion.tipo === 'sinItems'
                ? ({ tipo: 'sinItems' } as const)
                : ({ tipo: 'fin' } as const)
      estado = aplicarDecision(estado, accion.peticion, decision)
    }

    expect(estado.pipeline.finLogico).toBe(true)
    // Se atendió un item de cada tipo, más los "no queda nada" que cierran cada paso.
    expect(pasos).toEqual([
      'compuesto',
      'sinItems',
      'polivalente',
      'sinItems',
      'jerarquia',
      'sinItems',
    ])

    // Todo el progreso quedó marcado como eliminado.
    expect(estado.pipeline.progreso.every((p) => p.eliminado)).toBe(true)

    // Y el modelo lógico ya no tiene compuestos, polivalentes ni jerarquías.
    expect(primerCompuesto(estado.modelo)).toBeNull()
    expect(primerPolivalente(estado.modelo)).toBeNull()
    expect(primeraJerarquia(estado.modelo)).toBeNull()
  })

  it('el log registra las decisiones de los tres pasos', () => {
    const m = { ...modeloJerarquia('TE'), estado: 'MCdef' as const }
    let estado = { ...comenzarLogico(m, pipelineInicial()), bitacora: log() }

    for (let i = 0; i < 10 && !estado.pipeline.finLogico; i++) {
      const accion = proximaAccion(estado.modelo, estado.pipeline)
      const decision =
        accion.peticion.tipo === 'jerarquia'
          ? ({ tipo: 'jerarquia', opcion: 'B' } as const)
          : ({ tipo: 'sinItems' } as const)
      estado = aplicarDecision(
        estado,
        accion.peticion,
        accion.peticion.tipo === 'fin' ? { tipo: 'fin' } : decision,
      )
    }

    const textos = estado.bitacora.entradas.map((e) => e.texto)
    expect(textos.some((t) => t.includes('No se encontraron atributos compuestos'))).toBe(true)
    expect(textos.some((t) => t.includes('No se encontraron atributos polivalentes'))).toBe(true)
    expect(textos.some((t) => t.includes('conservar todas las entidades'))).toBe(true)
    expect(textos.some((t) => t.includes('Finalizó el pasaje al Modelo Lógico'))).toBe(true)
  })
})
