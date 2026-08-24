/**
 * Bitacora del pasaje — la version en pantalla de lo que `FileOutHtml.java`
 * escribia a un archivo HTML.
 */

import type { Bitacora, SeccionLog } from '../domain/log'
import { SUBSECCIONES, entradasDe, tieneSeccion } from '../domain/log'

const SECCIONES: { clave: SeccionLog; titulo: string; glifo: string }[] = [
  { clave: 'logico', titulo: 'Pasaje a Modelo Lógico', glifo: '◈' },
  { clave: 'fisico', titulo: 'Pasaje a Modelo Físico', glifo: '▤' },
]

export function LogView({ bitacora }: { bitacora: Bitacora }) {
  if (bitacora.entradas.length === 0) {
    return (
      <div className="lienzo-wrap">
        <div className="lienzo-vacio">
          <h3>El log todavía está vacío</h3>
          <p>
            Se va llenando a medida que avanza el pasaje a Modelo Lógico y Físico, registrando
            cada decisión que tomás.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="log">
      <div className="log-meta">
        <span>{bitacora.fecha}</span>
        <span>{bitacora.hora}</span>
        <span>
          {bitacora.entradas.length}{' '}
          {bitacora.entradas.length === 1 ? 'entrada' : 'entradas'}
        </span>
      </div>

      {SECCIONES.filter((s) => tieneSeccion(bitacora, s.clave)).map((s) => (
        <section key={s.clave}>
          <h2>
            {s.glifo} {s.titulo}
          </h2>
          {SUBSECCIONES.filter((sub) => sub.seccion === s.clave).map((sub) => {
            const entradas = entradasDe(bitacora, sub.clave)
            if (entradas.length === 0) return null
            return (
              <div key={sub.clave}>
                <h3>
                  <span className="glifo" aria-hidden>
                    {sub.icono}
                  </span>
                  {sub.titulo}:
                </h3>
                <ul>
                  {entradas.map((e, i) => (
                    <li key={i} className={e.destacado ? 'hito' : undefined}>
                      {e.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
