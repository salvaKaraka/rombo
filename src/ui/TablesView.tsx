/**
 * Modelo fisico: las tablas generadas — `modelo/TablaFisico.java` y la pestaña
 * "Modelo Físico" del original.
 */

import type { TablaFisica } from '../domain/types'

export function TablesView({ tablas }: { tablas: TablaFisica[] }) {
  if (tablas.length === 0) {
    return (
      <div className="lienzo-wrap">
        <div className="lienzo-vacio">
          <h3>Todavía no hay modelo físico</h3>
          <p>
            Terminá el pasaje a Modelo Lógico y después usá <strong>Pasar a Físico</strong> en la
            barra de herramientas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="tablas">
      {tablas.map((t) => (
        <div key={t.nombre} className="tabla-card">
          <h3>{t.nombre}</h3>
          <table>
            <tbody>
              {t.claves.map((c) => (
                <tr key={`pk-${c}`} className="pk">
                  {/* En la tabla de una relación N:M la clave es, además,
                      foránea hacia cada entidad: se marca como CP,CF. */}
                  <td className="marca-col">{t.foraneas.includes(c) ? 'CP,CF' : 'CP'}</td>
                  <td>{c}</td>
                </tr>
              ))}
              {t.campos.map((c) => {
                const esForanea = t.foraneas.includes(c)
                return (
                  <tr key={`c-${c}`} className={esForanea ? 'fk' : undefined}>
                    <td className="marca-col">{esForanea ? 'CF' : ''}</td>
                    <td>{c}</td>
                  </tr>
                )
              })}
              {t.claves.length === 0 && t.campos.length === 0 && (
                <tr>
                  <td className="marca-col" />
                  <td style={{ color: 'var(--texto-3)', fontStyle: 'italic' }}>sin campos</td>
                </tr>
              )}
            </tbody>
          </table>
          {t.descripcion && <div className="desc">{t.descripcion}</div>}
        </div>
      ))}
    </div>
  )
}
