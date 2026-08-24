/**
 * Test de integracion: monta la app completa y la maneja como lo haria el
 * usuario, para verificar que el cableado UI <-> dominio funciona de punta a
 * punta. Reproduce el recorrido del manual.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'

beforeEach(() => cleanup())

/** Abre un dialogo desde la barra de herramientas por su etiqueta accesible. */
async function toolbar(u: ReturnType<typeof userEvent.setup>, etiqueta: string) {
  await u.click(screen.getByRole('button', { name: etiqueta }))
}

function dialogo() {
  return screen.getByRole('dialog')
}

/** El panel del arbol, para no confundir sus nodos con los textos del SVG. */
function arbol(): HTMLElement {
  return document.querySelector('.arbol') as HTMLElement
}

/** Etiquetas de los nodos del arbol, sin los botones de eliminar de cada fila. */
function nodosArbol(): string[] {
  return Array.from(arbol().querySelectorAll('.nodo')).map((n) => n.textContent ?? '')
}

/** El SVG del diagrama. */
function lienzo(): SVGSVGElement {
  return document.querySelector('.lienzo-wrap svg') as SVGSVGElement
}

/**
 * Avanza el pasaje a logico hasta que aparezca un dialogo que matchee `hasta`,
 * o hasta que el pasaje termine.
 *
 * Entre paso y paso hay que presionar "Siguiente paso": el pasaje no encadena
 * los dialogos solo, igual que en el CasER original ("Para continuar eliminando
 * los atributos compuestos, es necesario presionar el botón de Siguiente paso").
 */
async function avanzarPasaje(
  u: ReturnType<typeof userEvent.setup>,
  hasta?: RegExp,
): Promise<HTMLElement | null> {
  for (let i = 0; i < 14; i++) {
    const d = screen.queryByRole('dialog')
    if (d) {
      if (hasta && hasta.test(d.textContent ?? '')) return d
      await u.click(within(d).getByRole('button', { name: 'Aceptar' }))
      continue
    }
    if (screen.queryByText('pasaje lógico finalizado')) return null
    await toolbar(u, 'Siguiente paso')
  }
  return null
}

/** Crea una entidad con nombre y, opcionalmente, la marca como hija de otra. */
async function crearEntidad(
  u: ReturnType<typeof userEvent.setup>,
  nombre: string,
  padre?: { de: string; cobertura?: string },
) {
  await toolbar(u, 'Entidad')
  const d = dialogo()
  await u.type(within(d).getByLabelText('Nombre'), nombre)

  if (padre) {
    await u.click(within(d).getByRole('tab', { name: 'Jerarquías' }))
    await u.click(within(d).getByLabelText('Hija de…'))
    await u.selectOptions(within(d).getByLabelText('Entidad padre'), padre.de)
    if (padre.cobertura) {
      await u.selectOptions(within(d).getByLabelText('Cobertura'), padre.cobertura)
    }
  }
  await u.click(within(d).getByRole('button', { name: 'Aceptar' }))
}

/** Agrega un atributo al propietario indicado. */
async function crearAtributo(
  u: ReturnType<typeof userEvent.setup>,
  nombre: string,
  propietario: string,
  opciones: { tipo?: 'Simple' | 'Compuesto' | 'Identificador'; cardMax?: '1' | 'n' } = {},
) {
  await toolbar(u, 'Atributo')
  const d = dialogo()
  await u.type(within(d).getByLabelText('Nombre'), nombre)

  // El <option> lleva un glifo delante del nombre, así que se busca por texto.
  const select = within(d).getByLabelText('Propietario') as HTMLSelectElement
  const opcion = Array.from(select.options).find((o) =>
    o.textContent?.includes(propietario),
  )
  if (!opcion) throw new Error(`No hay propietario "${propietario}" para elegir`)
  await u.selectOptions(select, opcion.value)

  if (opciones.tipo && opciones.tipo !== 'Simple') {
    await u.click(within(d).getByLabelText(opciones.tipo))
  }
  if (opciones.cardMax === 'n') {
    // El grupo de máxima ofrece 1 y n; se elige el radio "n" de ese grupo.
    const grupoMax = within(d).getByText('Cardinalidad máxima').parentElement!
    await u.click(within(grupoMax).getByLabelText('n'))
  }
  await u.click(within(d).getByRole('button', { name: 'Aceptar' }))
}

describe('App — recorrido completo', () => {
  it('arranca en Especificación con el modelo vacío en MCAN', () => {
    render(<App />)
    expect(screen.getByTitle('Estado del modelo')).toHaveTextContent('MCAN')
    expect(screen.getByText('Todavía no hay entidades.')).toBeTruthy()
    expect(screen.getByText(/0 entidades/)).toBeTruthy()
  })

  it('crea una entidad desde la barra y la muestra en el árbol y el diagrama', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')

    // Aparece en el arbol.
    expect(nodosArbol().some((n) => n.includes('persona'))).toBe(true)
    expect(screen.getByText(/1 entidades/)).toBeTruthy()

    // Y en el diagrama, como texto del SVG.
    await u.click(screen.getByRole('tab', { name: /Modelo Conceptual/ }))
    expect(within(lienzo() as unknown as HTMLElement).getByText('persona')).toBeTruthy()
  })

  it('bloquea el pasaje a lógico hasta finalizar el conceptual', async () => {
    const u = userEvent.setup()
    render(<App />)
    await crearEntidad(u, 'persona')

    await toolbar(u, 'Pasar a Lógico')
    expect(
      screen.getByText(/antes debe finalizar el Modelo Conceptual/),
    ).toBeTruthy()

    await toolbar(u, 'Finalizar')
    expect(screen.getByTitle('Estado del modelo')).toHaveTextContent('MCdef')
  })

  it('bloquea la edición de la especificación después de finalizar', async () => {
    const u = userEvent.setup()
    render(<App />)
    await crearEntidad(u, 'persona')
    await toolbar(u, 'Finalizar')

    const area = screen.getByRole('textbox')
    expect(area).toHaveAttribute('readonly')
    expect(screen.getByText(/la especificación quedó de solo lectura/)).toBeTruthy()
  })

  it('recorre el pasaje a lógico eliminando un atributo compuesto con la opción C', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'direccion', 'persona', { tipo: 'Compuesto' })
    await crearAtributo(u, 'calle', 'direccion')
    await toolbar(u, 'Finalizar')

    await toolbar(u, 'Pasar a Lógico')

    // Primero el anuncio "Paso 1: ..."
    expect(screen.getByText(/Paso 1: Eliminación de Atributos Compuestos/)).toBeTruthy()
    await u.click(within(dialogo()).getByRole('button', { name: 'Aceptar' }))

    // Después el diálogo de opciones A/B/C.
    const opciones = dialogo()
    expect(within(opciones).getByText(/Opción C — Entidad nueva/)).toBeTruthy()
    await u.click(within(opciones).getByLabelText(/Opción C/))
    await u.click(within(opciones).getByRole('button', { name: 'Aceptar' }))

    // Se creó la entidad direccion y la relación persona_direccion.
    const nodos = within(arbol())
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
    expect(nodos.some((n) => n.includes('direccion'))).toBe(true)
    expect(nodos.some((n) => n.includes('persona_direccion'))).toBe(true)
    // El atributo compuesto ya no está.
    expect(within(arbol()).queryByText('comp')).toBeNull()
  })

  it('la ventana Progreso marca el ítem como eliminado', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'direccion', 'persona', { tipo: 'Compuesto' })
    await crearAtributo(u, 'calle', 'direccion')
    await toolbar(u, 'Finalizar')
    await toolbar(u, 'Pasar a Lógico')
    await u.click(within(dialogo()).getByRole('button', { name: 'Aceptar' })) // anuncio

    // Antes de decidir, el ítem está pendiente.
    await u.click(within(dialogo()).getByLabelText(/Opción B/))
    await u.click(within(dialogo()).getByRole('button', { name: 'Aceptar' }))

    await toolbar(u, 'Progreso')
    const prog = dialogo()
    expect(within(prog).getByText(/direccion \(persona\)/)).toBeTruthy()
    expect(within(prog).getByText('✓')).toBeTruthy()
  })

  it('ofrece A/B/C con cobertura Total y solo A/B con Parcial', async () => {
    const u = userEvent.setup()

    // --- Total ---
    render(<App />)
    await crearEntidad(u, 'socio')
    await crearEntidad(u, 'socio_vip', { de: 'socio', cobertura: 'TE' })
    await toolbar(u, 'Finalizar')
    await toolbar(u, 'Pasar a Lógico')

    const dTotal = await avanzarPasaje(u, /Eliminación de la jerarquía/)
    expect(dTotal).not.toBeNull()
    expect(within(dTotal!).getByLabelText(/Opción C/)).not.toBeDisabled()

    cleanup()

    // --- Parcial ---
    render(<App />)
    await crearEntidad(u, 'socio')
    await crearEntidad(u, 'socio_vip', { de: 'socio', cobertura: 'PE' })
    await toolbar(u, 'Finalizar')
    await toolbar(u, 'Pasar a Lógico')

    const dParcial = await avanzarPasaje(u, /Eliminación de la jerarquía/)
    expect(dParcial).not.toBeNull()
    expect(within(dParcial!).getByLabelText(/Opción C/)).toBeDisabled()
    expect(dParcial!.textContent).toContain('No aplicable para cobertura Parcial')
  })

  it('completa el pasaje a físico y muestra las tablas y el log', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'autor')
    await crearAtributo(u, 'id_autor', 'autor', { tipo: 'Identificador' })
    await crearEntidad(u, 'libro')
    await crearAtributo(u, 'isbn', 'libro', { tipo: 'Identificador' })

    // Relación n a n entre autor y libro.
    await toolbar(u, 'Relación')
    const dRel = dialogo()
    await u.type(within(dRel).getByLabelText('Nombre'), 'escribe')
    await u.click(within(dRel).getByRole('button', { name: 'Aceptar' }))

    await toolbar(u, 'Finalizar')
    await toolbar(u, 'Pasar a Lógico')

    // No hay compuestos, polivalentes ni jerarquías: se atraviesan los avisos.
    await avanzarPasaje(u)

    expect(screen.getByText('pasaje lógico finalizado')).toBeTruthy()

    // Pasaje a físico, modo automático.
    await toolbar(u, 'Pasar a Físico')
    const dFis = dialogo()
    expect(within(dFis).getByText(/Generación automática/)).toBeTruthy()
    await u.click(within(dFis).getByRole('button', { name: 'Aceptar' }))

    expect(screen.getByTitle('Estado del modelo')).toHaveTextContent('MFAN')

    // La pestaña Modelo Físico muestra las tres tablas.
    await u.click(screen.getByRole('tab', { name: /Modelo Físico/ }))
    for (const t of ['autor', 'libro', 'escribe']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy()
    }

    // Y el log registró el pasaje.
    await u.click(screen.getByRole('tab', { name: /Log/ }))
    expect(screen.getByRole('heading', { name: /Pasaje a Modelo Físico/ })).toBeTruthy()
    expect(screen.getByText(/Tablas generadas/)).toBeTruthy()
  })

  it('deshacer paso pide confirmación y revierte', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'direccion', 'persona', { tipo: 'Compuesto' })
    await crearAtributo(u, 'calle', 'direccion')
    await toolbar(u, 'Finalizar')
    await toolbar(u, 'Pasar a Lógico')
    await u.click(within(dialogo()).getByRole('button', { name: 'Aceptar' })) // anuncio
    await u.click(within(dialogo()).getByLabelText(/Opción C/))
    await u.click(within(dialogo()).getByRole('button', { name: 'Aceptar' }))

    const nombresArbol = () =>
      within(arbol())
        .getAllByRole('button')
        .map((b) => b.textContent ?? '')

    expect(nombresArbol().some((n) => n.includes('persona_direccion'))).toBe(true)

    await toolbar(u, 'Deshacer paso')
    const conf = dialogo()
    expect(conf.textContent).toContain('¿Desea deshacer la operación realizada?')
    await u.click(within(conf).getByRole('button', { name: 'Sí' }))

    // Desapareció la relación y volvió el atributo compuesto.
    expect(nombresArbol().some((n) => n.includes('persona_direccion'))).toBe(false)
    expect(within(arbol()).getByText('comp')).toBeTruthy()
  })

  it('el atributo nuevo se asigna a la entidad seleccionada, no a la primera', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'primera')
    await crearEntidad(u, 'segunda')

    // Se selecciona la segunda en el árbol.
    const nodoSegunda = Array.from(arbol().querySelectorAll('.nodo')).find((n) =>
      n.textContent?.includes('segunda'),
    ) as HTMLElement
    await u.click(nodoSegunda)

    // El diálogo de atributo llega con "segunda" como propietario.
    await toolbar(u, 'Atributo')
    const d = dialogo()
    const select = within(d).getByLabelText('Propietario') as HTMLSelectElement
    expect(select.selectedOptions[0].textContent).toContain('segunda')

    await u.type(within(d).getByLabelText('Nombre'), 'campo')
    await u.click(within(d).getByRole('button', { name: 'Aceptar' }))

    // Quedó colgando de segunda: aparece después de ella en el árbol.
    const etiquetas = nodosArbol()
    const iSegunda = etiquetas.findIndex((n) => n.includes('segunda'))
    const iCampo = etiquetas.findIndex((n) => n.includes('campo'))
    expect(iCampo).toBe(iSegunda + 1)
  })

  it('con un atributo compuesto seleccionado, el atributo nuevo cae adentro', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'direccion', 'persona', { tipo: 'Compuesto' })

    const nodoComp = Array.from(arbol().querySelectorAll('.nodo')).find((n) =>
      n.textContent?.includes('direccion'),
    ) as HTMLElement
    await u.click(nodoComp)

    await toolbar(u, 'Atributo')
    const d = dialogo()
    const select = within(d).getByLabelText('Propietario') as HTMLSelectElement
    expect(select.selectedOptions[0].textContent).toContain('direccion')
  })

  it('elimina un atributo desde el árbol', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'dni', 'persona')
    expect(nodosArbol().some((n) => n.includes('dni'))).toBe(true)

    await u.click(screen.getByRole('button', { name: 'Eliminar dni' }))
    expect(nodosArbol().some((n) => n.includes('dni'))).toBe(false)
  })

  it('edita un atributo con doble clic en el árbol', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'dni', 'persona')

    const nodoAtr = Array.from(arbol().querySelectorAll('.nodo')).find((n) =>
      n.textContent?.includes('dni'),
    ) as HTMLElement
    await u.dblClick(nodoAtr)

    const d = dialogo()
    expect(within(d).getByLabelText('Nombre')).toHaveValue('dni')

    // Se lo convierte en identificador y se renombra.
    await u.clear(within(d).getByLabelText('Nombre'))
    await u.type(within(d).getByLabelText('Nombre'), 'documento')
    await u.click(within(d).getByLabelText('Identificador'))
    await u.click(within(d).getByRole('button', { name: 'Aceptar' }))

    const etiquetas = nodosArbol()
    expect(etiquetas.some((n) => n.includes('documento'))).toBe(true)
    expect(etiquetas.some((n) => n.includes('dni'))).toBe(false)
    // El glifo ● marca que ahora es identificador.
    expect(etiquetas.find((n) => n.includes('documento'))).toContain('●')
  })

  it('la tecla Suprimir elimina lo seleccionado', async () => {
    const u = userEvent.setup()
    render(<App />)

    await crearEntidad(u, 'persona')
    await crearAtributo(u, 'dni', 'persona')

    const nodoAtr = Array.from(arbol().querySelectorAll('.nodo')).find((n) =>
      n.textContent?.includes('dni'),
    ) as HTMLElement
    await u.click(nodoAtr)
    await u.keyboard('{Delete}')

    expect(nodosArbol().some((n) => n.includes('dni'))).toBe(false)
    // La entidad sigue ahí.
    expect(nodosArbol().some((n) => n.includes('persona'))).toBe(true)
  })

  it('crea objetos desde una palabra de la especificación', async () => {
    const u = userEvent.setup()
    render(<App />)

    const area = screen.getByRole('textbox')
    await u.type(area, 'Cada cliente tiene una factura.')

    // Se selecciona "cliente" y se abre el menú contextual. El evento
    // `contextmenu` lo dispara el navegador, no user-event, así que va directo.
    const el = area as HTMLTextAreaElement
    const ini = el.value.indexOf('cliente')
    el.setSelectionRange(ini, ini + 'cliente'.length)
    fireEvent.contextMenu(el, { clientX: 40, clientY: 40 })

    expect(screen.getByText('“cliente”')).toBeTruthy()
    await u.click(screen.getByRole('button', { name: /Agregar como Entidad/ }))

    // El diálogo llega con el nombre precargado.
    const d = dialogo()
    expect(within(d).getByLabelText('Nombre')).toHaveValue('cliente')
    await u.click(within(d).getByRole('button', { name: 'Aceptar' }))

    expect(screen.getByText(/1 entidades/)).toBeTruthy()
  })
})
