# Cómo aportar

Bienvenido/a. Si cursás la materia y algo no funciona, o querés que la
herramienta haga algo que hoy no hace, mandá el aporte.

**Cómo se decide:** cualquiera puede abrir issues y pull requests. La revisión y
el merge los hace [@salvaKaraka](https://github.com/salvaKaraka), que tiene la
última palabra sobre qué entra. No es por celo: hay una restricción de diseño
que conviene explicar antes de que escribas código.

## La restricción que manda: fidelidad al original

Esto no es un editor de diagramas genérico. Es una reimplementación de **CasER**,
la herramienta de la cátedra, y su valor está en que se comporta **igual** que
ella: los mismos pasos, las mismas opciones en cada decisión, los mismos textos.
Si acá una jerarquía con cobertura Parcial ofreciera una opción que el original
no ofrece, la herramienta dejaría de servir para estudiar.

Entonces, si tu cambio toca una **regla de transformación**, hace falta que digas
de dónde sale. Las fuentes son dos:

- El **manual de usuario** del CasER original (`Manual.pdf`, viene con el
  programa).
- El **código fuente Java**, que el propio `.jar` del programa incluye bajo
  `src/`. Se lee sin decompilar nada:
  ```bash
  unzip -p plugins/trabajoDeGrado_1.1.0.jar src/trabajodegrado/modelo/Entidad.java \
    | iconv -f ISO-8859-1 -t UTF-8
  ```
  Está en ISO-8859-1, de ahí el `iconv`.

En el código de este repo, cada transformación cita en un comentario la clase y
el método del original que espeja. Seguí esa convención.

**Si encontrás que el original hace algo distinto de lo que hacemos acá, eso es
un bug y quiero saberlo.** Abrí un issue con el tipo "Regla de modelado" y la
referencia al fuente o al manual.

Hay dos excepciones documentadas, donde el Java original se contradice consigo
mismo y seguimos la regla estándar: la clave de la tabla de una relación N:M y la
matriz de cardinalidades. Están explicadas en el README y en
`src/domain/transform/tablas.ts`. Si querés discutirlas, abrí un issue antes de
mandar código.

## Cómo está organizado

```
src/
├── domain/       el motor. No importa React. Funciones puras.
│   └── transform/    una regla por archivo
├── persistence/  guardar y abrir
└── ui/           React
```

La regla de oro: **`domain/` no importa React, y `ui/` no tiene lógica de
modelado.** Si te encontrás escribiendo reglas de transformación dentro de un
componente, va en `domain/`.

Las transformaciones son funciones puras `(modelo, decisión) → modelo`. Gracias a
eso "Deshacer" es restaurar el estado anterior. Si escribís una transformación
que mute el modelo en su lugar, rompés el deshacer.

## Antes de mandar el PR

```bash
npm install
npm test              # 42 tests
npx tsc --noEmit      # sin errores de tipos
npm run build         # tiene que compilar
```

Los tres tienen que pasar. Además:

- **Si cambiás o agregás una regla de transformación, agregá un test.**
  `src/domain/__tests__/casos.test.ts` tiene el patrón: se arma un modelo chico,
  se aplica la transformación, se verifica el resultado. Si la regla sale del
  manual, dejá la figura citada en el test (`— Fig. 36`).
- **Si cambiás la UI, mirá que siga funcionando en claro y en oscuro.** El
  selector de tema está arriba a la derecha.
- El código y los comentarios están **en español**, sin tildes en los
  identificadores. Los textos de la interfaz que vienen del original se copian
  tal cual, con tildes.

No hay linter configurado ni reglas de formato estrictas. Escribí parecido a lo
que hay alrededor y listo.

## Ideas de por dónde empezar

Si querés aportar y no sabés en qué, esto es lo que falta:

- **Leer los archivos del CasER original.** Hoy sólo abrimos nuestro JSON. El
  formato original es serialización Java (header `AC ED 00 05`). La persistencia
  ya está detrás de una interfaz `Lector` en `src/persistence/types.ts`, así que
  es implementarla y registrarla en `LECTORES`. Es el aporte de mayor impacto
  para quien tenga trabajos hechos en la app vieja.
- **Relaciones con más de tres entidades.** El original no las contempla y acá
  tampoco, pero el modelo de datos no lo impide.
- **Layout automático del diagrama.** Hoy los objetos nuevos caen en una grilla y
  los movés a mano.
- **Normalización.** El original llega hasta las tablas y no analiza formas
  normales.

## Reportar un problema

Abrí un issue. Si es un bug del modelado, lo más útil que podés adjuntar es el
**modelo guardado** (Guardar te baja un `.caser.json`) junto con qué esperabas y
qué pasó.
