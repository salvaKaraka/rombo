/**
 * Banner de bienvenida con las advertencias importantes.
 *
 * Aparece la primera vez que se entra y se puede cerrar. La decisión de cerrarlo
 * queda guardada en localStorage, pero el botón de ayuda del encabezado lo vuelve
 * a abrir — si no, la información se pierde para siempre en el primer clic.
 *
 * La clave lleva versión: si algún día cambian las advertencias de fondo, se
 * sube el número y el banner vuelve a aparecer para todos.
 */

export const REPO = 'https://github.com/salvaKaraka/rombo'

const CLAVE = 'rombo:aviso:1'

/** ¿Ya lo cerró? Tolera navegadores con el storage bloqueado. */
export function avisoYaVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE) === 'visto'
  } catch {
    return false
  }
}

export function marcarAvisoVisto(): void {
  try {
    localStorage.setItem(CLAVE, 'visto')
  } catch {
    // Modo privado o storage deshabilitado: el banner reaparece, no es grave.
  }
}

export function AvisoInicial({ onCerrar }: { onCerrar: () => void }) {
  return (
    <aside className="aviso-inicial" role="region" aria-label="Antes de empezar">
      <div className="aviso-inicial-cuerpo">
        <h2>
          <i aria-hidden>◇</i> Antes de empezar
        </h2>

        <ul>
          <li>
            <strong>No es la herramienta oficial de la cátedra.</strong> Es una
            reimplementación web de CasER, hecha para poder usarlo sin Windows.
          </li>
          <li>
            <strong>No abre los archivos del CasER original</strong>
            <span className="ext"> .csr · .cdf · .cml</span>. Acá los modelos se
            guardan en un JSON propio, así que un trabajo empezado en la app de
            Windows hay que rearmarlo.
          </li>
          <li>
            <strong>Dos reglas difieren del original a propósito:</strong> la clave de
            la tabla de una relación N:M y algunas cardinalidades del paso a tablas.
            En esos dos casos el CasER original se contradice consigo mismo y acá se
            sigue la regla estándar. Están explicadas en el repositorio.
          </li>
          <li>
            <strong>Escrita con ayuda de IA.</strong> Tiene tests y se verificó contra
            los casos del manual, pero si la usás para algo que entregás, revisá el
            resultado.
          </li>
        </ul>

        <p className="aviso-inicial-pie">
          Todo corre en tu máquina: no se sube nada a ningún servidor. ¿Encontraste
          algo raro o querés cambiar algo?{' '}
          <a href={REPO} target="_blank" rel="noreferrer">
            El repositorio está abierto ↗
          </a>
        </p>
      </div>

      <button
        type="button"
        className="aviso-inicial-cerrar"
        onClick={onCerrar}
        aria-label="Cerrar el aviso"
      >
        Entendido
      </button>
    </aside>
  )
}
