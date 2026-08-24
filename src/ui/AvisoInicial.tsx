/**
 * Aviso de bienvenida con las advertencias importantes.
 *
 * Aparece la primera vez que se entra y se cierra con Entendido. La decisión
 * queda guardada en localStorage, pero el botón de ayuda del encabezado lo vuelve
 * a abrir — si no, la información se pierde para siempre en el primer clic.
 *
 * La clave lleva versión: si algún día cambian las advertencias de fondo, se
 * sube el número y el aviso vuelve a aparecer para todos.
 */

import { useEffect } from 'react'
import { Dialogo } from './dialogs/Base'

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
    // Modo privado o storage deshabilitado: el aviso reaparece, no es grave.
  }
}

export function AvisoInicial({ onCerrar }: { onCerrar: () => void }) {
  // `Dialogo` sólo cierra con Escape cuando hay botón de cancelar, y acá la
  // única acción es descartar; se agrega el atajo a mano.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCerrar()
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <Dialogo
      ancho
      titulo="Antes de empezar"
      onAceptar={onCerrar}
      aceptar="Entendido"
    >
      <ul className="aviso-lista">
        <li>
          <strong>No es la herramienta oficial de la cátedra.</strong> Es una
          reimplementación web de CasER, hecha para poder usarlo sin Windows.
        </li>
        <li>
          <strong>No abre los archivos del CasER original</strong>
          <span className="ext"> .csr · .cdf · .cml</span>. Acá los modelos se guardan
          en un JSON propio, así que un trabajo empezado en la app de Windows hay que
          rearmarlo.
        </li>
        <li>
          <strong>Dos reglas difieren del original a propósito:</strong> la clave de la
          tabla de una relación N:M y algunas cardinalidades del paso a tablas. En esos
          dos casos el CasER original se contradice consigo mismo y acá se sigue la regla
          estándar. Están explicadas en el repositorio.
        </li>
        <li>
          <strong>Escrita con ayuda de IA.</strong> Tiene tests y se verificó contra los
          casos del manual, pero si la usás para algo que entregás, revisá el resultado.
        </li>
      </ul>

      <p className="aviso-pie">
        Todo corre en tu máquina: no se sube nada a ningún servidor. ¿Encontraste algo
        raro o querés cambiar algo?{' '}
        <a href={REPO} target="_blank" rel="noreferrer">
          El repositorio está abierto ↗
        </a>
      </p>
    </Dialogo>
  )
}
