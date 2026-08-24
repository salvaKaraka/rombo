/**
 * Operaciones de archivo: guardar, abrir, importar especificacion, exportar el
 * diagrama y el log, e imprimir.
 *
 * Todo local: no hay red. Se usa el patron de <input type=file> y descarga por
 * blob, que funciona igual servido por Vite o abriendo `dist/index.html`
 * directo.
 */

import type { Documento } from '../persistence/types'
import { escritorJson, leerDocumento } from '../persistence/json'
import { bitacoraHtml, type Bitacora } from '../domain/log'

function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se revoca en el siguiente tick: Safari necesita que la URL siga viva
  // durante el click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Abre el selector de archivos y devuelve el contenido, o null si se cancela. */
function elegirArchivo(accept: string): Promise<{ nombre: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    let resuelto = false
    const terminar = (v: { nombre: string; bytes: Uint8Array } | null) => {
      if (resuelto) return
      resuelto = true
      input.remove()
      resolve(v)
    }

    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return terminar(null)
      terminar({ nombre: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
    }
    // Si el usuario cancela no se dispara 'change'; 'cancel' es reciente pero
    // cuando falta, el input queda huerfano y se limpia al recargar.
    input.addEventListener('cancel', () => terminar(null))
    input.click()
  })
}

// --------------------------------------------------------------------- modelo

export function guardarModelo(doc: Documento, nombreBase = 'modelo'): void {
  descargar(escritorJson.escribir(doc), `${nombreBase}${escritorJson.extension}`)
}

export async function abrirModelo(): Promise<Documento | null> {
  const archivo = await elegirArchivo('.json,application/json')
  if (!archivo) return null
  return leerDocumento(archivo.bytes, archivo.nombre)
}

/** Importa la especificacion desde un archivo de texto — `ImportTextAction`. */
export async function importarEspecificacion(): Promise<string | null> {
  const archivo = await elegirArchivo('.txt,.text,text/plain')
  if (!archivo) return null
  return new TextDecoder().decode(archivo.bytes)
}

// ------------------------------------------------------------------------ log

export function descargarLog(bitacora: Bitacora): void {
  descargar(new Blob([bitacoraHtml(bitacora)], { type: 'text/html' }), 'log-caser.html')
}

// -------------------------------------------------------------------- diagrama

/**
 * Serializa el <svg> del diagrama a un string autocontenido.
 *
 * Los estilos del diagrama vienen de variables CSS, que no viajan con el nodo:
 * hay que resolverlas a valores concretos antes de exportar, o el archivo se
 * abre sin colores.
 */
function svgAutocontenido(svg: SVGSVGElement): string {
  const copia = svg.cloneNode(true) as SVGSVGElement
  const estilos = getComputedStyle(document.documentElement)
  const valor = (v: string) => estilos.getPropertyValue(v).trim() || '#000'

  const ancho = Number(svg.getAttribute('viewBox')?.split(' ')[2] ?? 900)
  const alto = Number(svg.getAttribute('viewBox')?.split(' ')[3] ?? 600)
  copia.setAttribute('width', String(ancho))
  copia.setAttribute('height', String(alto))
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const css = `
    .fig-nombre { font-family: system-ui, sans-serif; font-size: 12.5px; font-weight: 600; fill: ${valor('--texto')}; }
    .fig-attr   { font-family: system-ui, sans-serif; font-size: 11px; fill: ${valor('--texto-2')}; }
    .fig-card   { font-family: ui-monospace, monospace; font-size: 9.5px; fill: ${valor('--texto-3')}; }
    .fig-cobertura { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 600; fill: ${valor('--acento')}; }
    .fig-caja   { fill: ${valor('--panel')}; stroke: ${valor('--trazo')}; stroke-width: 1.4; }
    .fig-nodo.sel .fig-caja { stroke: ${valor('--acento')}; stroke-width: 2.4; fill: ${valor('--acento-suave')}; }
    .fig-linea  { stroke: ${valor('--trazo')}; stroke-width: 1.2; fill: none; }
    .fig-punto-vacio { fill: ${valor('--lienzo')}; stroke: ${valor('--trazo')}; stroke-width: 1.2; }
    .fig-punto-lleno { fill: ${valor('--trazo')}; stroke: ${valor('--trazo')}; stroke-width: 1.2; }
    .fig-arco-id { stroke: ${valor('--trazo')}; stroke-width: 1.2; fill: none; }
  `

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = css
  const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  fondo.setAttribute('x', svg.getAttribute('viewBox')?.split(' ')[0] ?? '0')
  fondo.setAttribute('y', svg.getAttribute('viewBox')?.split(' ')[1] ?? '0')
  fondo.setAttribute('width', String(ancho))
  fondo.setAttribute('height', String(alto))
  fondo.setAttribute('fill', valor('--lienzo'))

  copia.insertBefore(fondo, copia.firstChild)
  copia.insertBefore(style, copia.firstChild)

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copia)}`
}

export function exportarSvg(svg: SVGSVGElement, nombre = 'diagrama'): void {
  descargar(new Blob([svgAutocontenido(svg)], { type: 'image/svg+xml' }), `${nombre}.svg`)
}

/** Exporta a PNG rasterizando el SVG en un canvas, al doble de escala. */
export async function exportarPng(svg: SVGSVGElement, nombre = 'diagrama'): Promise<void> {
  const fuente = svgAutocontenido(svg)
  const vb = (svg.getAttribute('viewBox') ?? '0 0 900 600').split(' ').map(Number)
  const escala = 2
  const ancho = Math.max(1, Math.round(vb[2] * escala))
  const alto = Math.max(1, Math.round(vb[3] * escala))

  const url = URL.createObjectURL(new Blob([fuente], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo rasterizar el diagrama.'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('El navegador no expuso un contexto 2D.')
    ctx.drawImage(img, 0, 0, ancho, alto)

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('No se pudo generar el PNG.')
    descargar(blob, `${nombre}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Imprime el diagrama abriendo una ventana con solo el SVG. */
export function imprimirDiagrama(svg: SVGSVGElement): boolean {
  const w = window.open('', '_blank', 'width=1000,height=760')
  if (!w) return false
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>rombo — diagrama</title>` +
      `<style>@page{margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style>` +
      `</head><body>${svgAutocontenido(svg)}</body></html>`,
  )
  w.document.close()
  w.focus()
  // El print se dispara tras el load para que el SVG ya este medido.
  w.addEventListener('load', () => w.print())
  setTimeout(() => {
    try {
      w.print()
    } catch {
      /* la ventana pudo cerrarse antes */
    }
  }, 350)
  return true
}
