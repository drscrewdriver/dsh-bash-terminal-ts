# Changelog

## 0.7.0 (2026-09-29)

- **Línea de compatibilidad DSH 0.2.0** (rama `compat/0.2.0`, dist-tag npm `dsh-0.2.0`): los 11 rangos peer `@deepseek-ai/dsh-*` pasan en bloque a `>=0.2.0-rc.1 <0.2.1-0` (la línea 0.1.7 queda congelada en `compat/0.1.7` siguiendo sirviendo a los hosts antiguos, sin verse afectada). 0.2.0-rc.1 es totalmente compatible con la API de plugins de 0.1.7; esta línea no cambia nada de código, es una adaptación puramente de metadatos.
- **Actualización sincronizada de devDependencies**: los 15 paquetes `dsh-*` fijados con precisión a `0.1.7-rc.2` (11 homónimos de los peer + scope / subprocess / sandbox-policy / http-proxy) → `0.2.0-rc.1`, de modo que el build/test de un checkout limpio siga siendo representativo frente a un host 0.2.0.
- **Lockfile en el repositorio**: esta rama elimina del `.gitignore` la línea que ignoraba `package-lock.json`; el lockfile refrescado tras actualizar el árbol de dependencias se sube con la rama (la línea 0.1.7 mantiene su ignorado actual).
- **Metadatos de publicación**: versión 0.6.4 → 0.7.0; `publishConfig.tag` `dsh-0.1.7` → `dsh-0.2.0`; `version` y `engines.dsh` del `dsh.plugin.json` actualizados en consecuencia.
- **Reordenación de la matriz de compatibilidad del README** (bilingüe zh/en): se añaden las filas 0.1.7 y 0.2.0, se corrige la narración desfasada de «nombres de paquete distintos» (las líneas comparten ahora el nombre de paquete `dsh-bash-terminal-ts` y se distinguen por dist-tag), la sección de instalación se actualiza al doble criterio 0.1.7-rc.1 / 0.2.0-rc.1.
- **Verificación**: `npm install` / `build` / `test` todos en verde (4 suites unit / apply / client / terminal), `npm ls` sin conflictos de peer.

## 0.6.4 (2026-09-26)

- **Corregida la causa raíz del fallo de carga (residuo del cambio de nombre del paquete)**: el paquete ya se había renombrado a `dsh-bash-terminal-ts`, pero el `name` de la entrada bundle del `cordis.patch.yml` seguía indicando el `dsh-bash-terminal` anterior a la bifurcación. El cargador de 0.1.7 resuelve los módulos por nombre, así que el fallo era inevitable (`failed to import loader entry (dsh-bash-terminal)`); no se podía crear ni una fiber, y ni el montaje en caliente ni un reinicio permitían recuperarse. Ahora el `name` de la entrada coincide con el nombre del paquete y la activación funciona con normalidad bajo DSH 0.1.7.
- **Bifurcación completa del nombre del proyecto**: el `id` / `name` del `dsh.plugin.json`, el id de registro del cliente, `install.ps1` (rutas junction, nombre del bundle, textos de ayuda), así como las rutas y descripciones del proyecto en README / CONTRIBUTING / documento de compatibilidad pasan todos a `dsh-bash-terminal-ts`; solo quedan sin cambios `MAXeaglet/dsh-bash-terminal` (referencia al repositorio upstream) y el id de la entrada de herramienta `tool-bash-terminal`. La regex de limpieza del uninstall de `install.ps1` pasa a `dsh-bash-terminal(-ts)?`, de modo que los bloques legados del formato antiguo siguen pudiendo eliminarse.
- **Robustez del cliente**: la página de ajustes muestra una fila «no disponible» (con pistas de diagnóstico) cuando el host no proporciona la entrada `configForms` de este plugin, en lugar de quedarse en blanco en silencio.

## 0.3.18 (sin publicar)

- **Sincronización de la línea de compatibilidad DSH 0.1.5** (esta línea mantiene `ts/0.1.5`): los cambios independientes aplicados a la línea 0.1.2 tras la bifurcación se verificaron uno a uno y se trasladaron a esta línea.
- **Manifiesto estándar completado**: se añaden `dsh.plugin.json` (`id` / `components` / `engines`) y `screenshots.json`, ambos incorporados a la allowlist `files`.
- **Cierre de `engines`**: `node` sube de `>=20` a `>=22` y se añade `engines.dsh` = `>=0.1.5-alpha.1 <0.2.0-0` (antes era justamente esta línea la que carecía de esa declaración).
- **Corregida la atribución de la identidad del paquete**: `author` / `repository` / `bugs` / `homepage` pasan del fork upstream (MAXeaglet/dsh-bash-terminal) a este repositorio (drscrewdriver/dsh-bash-terminal-ts).
- **Typecheck posible en checkout limpio**: las devDependencies se completan con los paquetes peer de DSH (fijados con exactitud a `0.1.5-rc.2`). Antes de la corrección, `tsc` reportaba `TS7006` (`revision` / `writable` any implícito en `src/client.tsx`) — los peer solo estaban declarados en `peerDependencies` y como opcionales, así que `npm install` no instalaba nada. Como `dsh-shell@0.1.5-rc.1` aún declara el peer `0.1.2-rc.1`, instalar el árbol exigía `--legacy-peer-deps`.
- **`react-dom` añadido como devDependency**: antes `react` se resolvía desde este repositorio mientras `react-dom/server` recaía en la copia anidada del árbol de instalación de DSH; `renderToString` recibía dos instancias de React distintas y el test del cliente fallaba con “Objects are not valid as a React child”. Tras completar, `react` y `react-dom` son ambos 18.3.1 y los tests pasan.
- **Decisión consciente de no renombrar**: esta línea mantiene el nombre de paquete `dsh-bash-terminal-ts` (no sigue el `dsh-bash-terminal-ts` de la línea 0.1.2), de modo que las dos líneas puedan coexistir en la instalación sin chocar por la identidad del paquete.
- **Verificación (probado en local)**: `npm run build` exit 0; `test-dist/{unit,apply,client}.js` exit 0 cada uno; `test-dist/terminal.js` ejecutado por separado exit 0 (3/3 superados). El smoke MSYS2 de `unit` **se ejecuta de verdad** y saca `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `/usr/bin/bash`: la semántica de entorno MSYS2, razón de ser de esta línea, queda confirmada de extremo a extremo.
- **Fallo ambiental conocido (no introducido por esta línea)**: el 4.º segmento del `npm test` encadenado (`terminal.js`) reporta `AttachConsole failed` en consola no interactiva (sin Console a la que atacharse); en la baseline sin modificar se reproduce igual.

## 0.3.17 (2026-09-13)

- **MSYS2 se convierte en el 4.º backend de terminal** (orden de `SHELLS`: powershell / gitbash / msys2 / wsl). `Config` añade `msys2Path`, cableado vía `resolveAllPaths`; `SHELL_DESCRIPTIONS.msys2` y `toolDescription` se completan con la descripción del backend.
- **Ajuste de MSYS2 completado (cliente)**: la fila «Terminal predeterminado» de la UI web ofrecía antes solo powershell / gitbash / wsl — el backend MSYS2 existía pero el frontend no dejaba elegirlo. `src/client.tsx` añade la opción `msys2` y los textos bilingües de `shell.msys2` (MSYS2 es un nombre propio, idéntico en chino y en inglés).
- **Corrección del stdio por tubería en MSYS2**: `C:\msys64\msys2.exe` es un lanzador de Cygwin que asigna consola; con stdio por tubería retorna con exit 0 y cero bytes (stdout/stderr a 0 bytes, medido con MSYS2 bash 5.3.15), así que cualquier comando MSYS2 se quedaba mudo sin salida. El orden de candidatos pasa a ser: primero `C:\msys64\usr\bin\bash.exe` → `bin\bash.exe` → entradas mingw64/msys64 del PATH, con `msys2.exe` degradado a red de seguridad al final de la lista.
- **Login shell de MSYS2**: `buildArgv` usa `-lc` en lugar de `-c`; solo el login shell hace source de `/etc/profile`, añadiendo `/usr/bin` y `/mingw64/bin` al PATH (con `-c` desnudo, `bash` se resuelve a `C:\Windows\System32\bash.exe`, y `gcc`/`make` dan ambos command not found).
- **Entorno MSYS2**: `buildEnv` inyecta `MSYSTEM=MINGW64` (el valor pasado explícitamente por el usuario tiene prioridad) para que gcc y make de `/mingw64/bin` entren en el PATH; el env de las sesiones interactivas de la herramienta `terminal` queda alineado con ese comportamiento.
- **Sandbox de MSYS2**: como Git Bash, sin envoltura (el runner de token restringido con ACL de Windows es incompatible con Cygwin/MSYS2); el resultado informa `enforcement: msys2-unconfined`.
- **El env del terminal interactivo pasa por `buildEnv`**: `src/terminal.ts` antes montaba su propio env, esquivando la inyección de MSYSTEM de `buildEnv` — resultado: la herramienta `shell` funcionaba, pero el **terminal interactivo** msys2 no tenía `/mingw64/bin` (`/etc/profile` configuraba el PATH para el entorno MSYS por defecto). Ahora: `buildEnv(shell, ctx.shellEnv.collect(exec), process.env.WSLENV)` — se obtiene la inyección de MSYSTEM y ya no se duplica la lógica de WSLENV. El tercer parámetro debe pasarse explícitamente: `spawnTerminal` reemplaza por completo el entorno del proceso hijo mediante `childEnv(spec.env)`, de modo que el WSLENV del entorno seguiría invisible.
- **WSL `WSLENV`: acumular en vez de reconstruir**: WSLENV es la allowlist transfronteriza de WSL; el código antiguo la reconstruía solo desde `dshEnv`, perdiendo las entradas ya presentes en el entorno (en local `WSLENV=WT_SESSION:WT_PROFILE_ID:`, exportado por Windows Terminal), que dejaban de entrar en WSL. Ahora se acumula sobre los valores heredados: dividir por `:` y filtrar las entradas vacías (el valor heredado acaba en `:`, la mera concatenación de cadenas produciría entradas vacías), excluir la propia clave `WSLENV` (también es una clave de `dshEnv`, añadirla produciría `...:WSLENV`); el WSLENV que el llamante pase explícitamente tiene prioridad sobre los valores heredados.
- **Terminal interactivo**: `terminalArgv("msys2")` usa `-l`. No se puede mantener `-lc`: ese argv no lleva comando (el PTY es en sí la sesión), y `bash -lc` sin operandos sale de inmediato con `-c: option requires an argument` (exit 2).
- **Bundle del cliente reproducible**: `scripts/build-client.mjs` dejaba antes que esbuild buscara el tsconfig subiendo desde `src/client.tsx`; una build dentro del repositorio daba con el `tsconfig.json` raíz y sacaba una línea `"use strict";` de más, cosa que una build de worktree fuera del repositorio no hacía — el mismo código fuente producía dos artefactos commiteados distintos. Ahora se fija explícitamente `tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } }` (es decir, los valores realmente vigentes del tsconfig raíz); la única diferencia observable es la desaparición de esa línea `"use strict";`.
- **Protección contra regresiones**: `test/unit.ts` comprueba el argv `-lc` de msys2, la inyección de `MSYSTEM` con prioridad del valor del usuario, que `bash.exe` deba ir antes que `msys2.exe` y la semántica de acumulación de `WSLENV` (las entradas heredadas se conservan / no hay entradas vacías / no se añade `WSLENV` en sí / el valor explícito gana), más una comprobación smoke de spawn real (stdout no vacío y con `/mingw64/bin/gcc`; 0 bytes = fallo); `test/apply.ts` comprueba el argv/env de msys2, `msys2-unconfined` y la estructura de WSLENV; `test/terminal.ts` comprueba el argv interactivo y el cableado del PTY env vía `buildEnv`, y abre una **sesión msys2 real con node-pty** (comprobaciones de `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `BASH=/usr/bin/bash`); `test/client.ts` gana un guardián anti-deriva — para cada `SHELLS` del host comprueba que la lista del bundle del cliente y las entradas de menú renderizadas coinciden (orden incluido) y que tanto el diccionario chino como el inglés tienen `shell.<id>`. Cada uno de estos guardianes se contrastó en sentido inverso (romper el artefacto de build → la comprobación falla → en verde tras restaurar).

## 0.3.16 (2026-09-12)

- **Reescritura TypeScript integral**. Lado servidor `lib/index.js` / `lib/terminal.js` → `src/index.ts` / `src/terminal.ts`; cliente `src/client.jsx` → `src/client.tsx`; tests `test/*.mjs` → `test/*.ts` (compilados a `test-dist/` y ejecutados desde ahí). `tsc --strict` + `noUncheckedIndexedAccess` todo en verde.
- Los contratos del plugin hacia las costuras de DSH se reducen a tipos estructurales escritos a mano (`src/dsh-types.ts`); los imports de valores de los paquetes peer pasan todos por el puente de estrechamiento `src/dsh.ts`, la deriva de versiones de los peer ya no se filtra en el código reescrito.
- Cadena de build: `npm run build` = `tsc` (servidor → `lib/`) + `tsc -p tsconfig.client.json` (comprobación de tipos del cliente) + esbuild (`src/client.tsx` → `lib/client.js` + `dist/client.js`) + `tsc -p tsconfig.test.json`. Los artefactos `lib/` y `dist/` siguen subiéndose al repositorio, y la ruta de carga `lib/index.js` por parte de DSH no cambia.
- Superficie de exportación conservada al pie de la letra (`name` / `inject` / `Config` / `apply` / `SHELLS` / `DEFAULT_SHELL` / `SETTINGS_NAMESPACE` / `internals`), comportamiento en ejecución idéntico al de 0.3.15; solo se retiraron una función muerta `pathResolve` inalcanzable al final de terminal.js y el import sin uso `MAX_TIMER_DELAY_MS`.

## 0.3.15 (2026-09-11)

- **Adaptación a DSH 0.1.5-rc.1**. La tabla de módulos del cliente (`PLATFORM_MODULES`) renombra `@deepseek-ai/dsh-client-runtime` a `@deepseek-ai/dsh-client-store` y solo atrapa por **nombre desnuo exacto** (sin subruta `/client`, sin reserva a la factoría del paquete). El bundle del cliente antes hacía `require("@deepseek-ai/dsh-client-runtime/client")`, bajo 0.1.5 un fallo garantizado → la GUI web caía al arrancar con `Failed to load plugins / require(...) missed the module table`. Ahora se usa `@deepseek-ai/dsh-client-store`, y los 4 require del bundle (`react`, `react/jsx-runtime`, `dsh-client-store`, `dsh-client-ui-primitives`) caen todos dentro de la tabla semilla de la plataforma, sin necesidad de `dsh.client.external`.
- `dsh.client.inject` se actualiza con los nombres reales de los paquetes de cliente existentes en 0.1.5 (`dsh-client-locale`, `dsh-client-ui-settings`, `dsh-api-remotes`).
- La costura de settings del servidor ya no exporta `settingsNamespace()` (desde 0.1.5, `register(ns: string, schema, { base })` recibe directamente la cadena de namespace); se retiró el envoltorio en consecuencia y el código vale para las dos generaciones de API, 0.1.0/0.1.5.
- `peerDependencies` alineadas con `^0.1.5-rc.1` (se añade `dsh-sandbox`, realmente dependido; `cordis` sube a `^4.0.2`); el test del cliente añade una aserción anti-regresión: el bundle no debe volver a contener `dsh-client-runtime`.
- El parche de la allowlist de settings en `install.ps1` gana una sonda de existencia: 0.1.5 ya no tiene allowlist codificada a mano, el guion ya no reescribe el archivo del host por sustituciones sin coincidencias (lo único que conseguía era añadirle un BOM).
- Git Bash deja de envolverse vía `ctx.sandbox.confine`: el runner de token restringido con ACL de Windows de DSH es incompatible con Cygwin/MSYS2 (bash aborta al arrancar con el error Win32 5 de `CreateFileMapping`); ahora Git Bash también corre sin envoltura en modo restringido, y el resultado informa `enforcement: gitbash-unconfined`. Corrige #6.

## 0.3.14 (2026-08-14)

- La fila de ajustes refleja ahora exactamente la EnterBehaviorRow incluida: disposición de la fila (título + descripción terciaria a la izquierda, selector de cápsula a la derecha), disparador de cápsula de 36px (`--dsw-alias-bg-module-platform`, radio 18px, estado hover) con chevron, Menu en portal con `align="end"`. CSS inyectado de la misma forma que las filas de primer partido.
- Se eliminó la frase descriptiva «(由你决定，AI 无法更改)».

## 0.3.13 (2026-08-14)

- La fila de ajustes sigue la gramática de las filas de la sección General incluida (apilado en columna, filete inferior de 1px vía `--dsw-alias-border-l2`, padding vertical de 16px, título de 14px/400) — coincide con la disposición de la fila Appearance.

## 0.3.12 (2026-08-14)

- **UI nativa orientada al usuario**: la fila «Terminal predeterminado» de Ajustes → General ahora se renderiza con primitivas nativas de DSH (`Menu` + `Button` + `IconCodeOutline16`) en lugar de un simple `<select>` HTML — se ve y se comporta exactamente como un ajuste de primer partido. El test del cliente renderiza la fila mediante React real (renderToString) con primitivas simuladas.

## 0.3.11 (2026-08-14)

- Herramienta `terminal`: el WSL interactivo sobre la distribución por defecto usa ahora `wsl -- bash -i` (el `-e` desnudo falla bajo ConPTY con el error RPC 0x8007072c del servicio WSL); un `-d <distro>` explícito mantiene `-e`. Verificado: pwd → /mnt/d/WorkSpace.
- Correcciones de CI: la aserción del argv de wsl usa SystemRoot (sin distinguir mayúsculas); los tests client/terminal resuelven react + node-pty entre entornos (la CI los instala no-save); el test interactivo de wsl tolera entornos sin distribución.

## 0.3.10 (2026-08-14)

- install.ps1 migra el perfil a la instalación por bundle oficial (añade `dsh-bash-terminal-ts` a `dsh.profile.bundles` y elimina la inserción manual heredada), escribiendo package.json sin BOM UTF-8 (el BOM del `Set-Content` de PS 5.1 rompía el JSON.parse de DSH). Perfil web actual verificado: el bundle proporciona la entrada `tool-bash-terminal` vía `--dump-config`.

## 0.3.9 (2026-08-14)

- **Manifiesto de bundle oficial**: el paquete declara ahora `dsh.bundle.patch` (trae su propio `cordis.patch.yml`); un perfil que liste `dsh-bash-terminal-ts` en `dsh.profile.bundles` aplica el montaje automáticamente — verificado con un perfil temporal + `--dump-config` (la entrada aparece sin parche manual alguno del perfil).

## 0.3.8 (2026-08-14)

- Cobertura de tests: la ejecución en segundo plano de `shell` registra un job con hooks `cancel` / `done` / `readOutput` funcionales (13 casos apply/execute en total).

## 0.3.7 (2026-08-14)

- Herramienta `terminal`: las lecturas esperan ahora a que la salida se estabilice (300 ms de silencio, tope de 5 s) en lugar de un retardo fijo, de modo que `send` devuelve la respuesta COMPLETA (verificado: salida multilínea completa, p. ej. `seq 1 8`).

## 0.3.6 (2026-08-14)

- Cobertura de tests: apertura del `terminal` con comando inicial (ejecución inmediata en una shell fresca) y la forma de los hooks del job (cancel / done / readOutput) verificadas contra una sesión real de node-pty.

## 0.3.5 (2026-08-14)

- Herramienta `terminal`: el desbordamiento del búfer se informa (flag `truncated` + aviso “[terminal buffer overflowed; oldest output dropped]”) para que una sesión muy activa nunca pierda el historial en silencio.

## 0.3.4 (2026-08-14)

- Herramienta `terminal`: las sesiones WSL llevan ahora las variables de entorno DSH_* vía WSLENV, en sintonía con la herramienta `shell`.

## 0.3.3 (2026-08-14)

- Herramienta `terminal`: la nueva acción `list` enumera las sesiones activas (sessionId / shell / pid) para la gestión multisesión.

## 0.3.2 (2026-08-14)

- Tope de sesiones: como mucho 8 sesiones de terminal simultáneas (más allá: fallo rápido).
- Verificación interactiva multi-backend: Git Bash (completa), límites ConPTY documentados de PowerShell 5.1 y wsl.exe (0x8009001d / 0x8007072c; pwsh 7 y los comandos puntuales -lc funcionan).
- README (zh/en): limitaciones conocidas del terminal interactivo.

## 0.3.1 (2026-08-14)

- Las sesiones de terminal se registran en el registro genérico de jobs (jobId al abrir; `job_kill` / `job_output` funcionan sobre ellas).
- Tiempo de espera por inactividad: las sesiones se cierran solas tras 10 minutos sin send/read/signal (configurable vía `idleMs` al abrir) para que los PTY abandonados nunca dejen árboles de procesos a la fuga.

## 0.3.0 (2026-08-14)

- **Herramienta de terminal interactivo (`terminal`)**: sesiones PTY persistentes sobre la costura oficial `ctx.subprocess.spawnTerminal` (node-pty). Acciones: `open` / `send` / `read` / `signal` (Ctrl+C etc.) / `close`. El estado de la shell (cwd, variables, alias) se conserva entre llamadas; el backend sigue el ajuste del terminal predeterminado del usuario. Verificado con una sesión real interactiva de Git Bash vía node-pty (cd + pwd + echo + SIGINT + close).

## 0.2.3 (2026-08-14)

- Cobertura de tests fail-closed (un backend de sandbox no disponible rechaza la llamada).
- Documentación de la sandbox en el README.
- CI con GitHub Actions (suites unit / apply / client en windows-latest).

## 0.2.2 (2026-08-14)

- **Renderizado oficial de los rechazos**: una llamada envuelta cuyo stderr coincide con las firmas de rechazo del runner informa `sandbox.denied: true` y la salida orientada al modelo lleva los marcadores oficiales exactos — `[sandbox: file access denied under <mode> mode]` más la pista de escalada del mismo turno.

## 0.2.1 (2026-08-14)

- **Superficie oficial de escalada de la sandbox**: la herramienta `shell` anuncia ahora `sandbox_permissions` / `justification` (el contrato exacto de tool-bash / tool-pwsh): una llamada rechazada puede reintentarse una vez con el modo más amplio más estrecho posible, enrutada vía `ctx.approval` (`approveEscalation`), con validación estricta de ensanchamiento.

## 0.2.0 (2026-08-14)

- **Integración de la sandbox (costura oficial)**: la herramienta `shell` resuelve la política de sandbox de DSH en cada llamada (`ctx.sandboxPolicy`) y envuelve el argv de PowerShell / Git Bash mediante `ctx.sandbox` — la misma semántica fail-closed `SandboxUnavailableError` que los ejecutores incluidos. WSL corre sin envolver (su aislamiento por VM Linux ES la sandbox). Los datos de la sandbox (`sandbox.mode` / `sandbox.enforcement`) viajan en los resultados de primer plano.
- **Preferencia del modelo**: la sección del system prompt del plugin indica a los agentes que prefieran la herramienta `shell` sobre `pwsh` para comandos de terminal; la descripción de la herramienta encabeza con el terminal predeterminado elegido por el usuario.

## 0.1.0 (2026-08-14)

Lanzamiento inicial.

- Herramienta `shell`: ejecutar comandos a través de PowerShell / Git Bash / WSL en Windows.
- El terminal predeterminado lo elige el usuario en los ajustes de la UI web (Ajustes → General → Terminal predeterminado); el modelo no puede sobrescribirlo.
- Ejecución en segundo plano vía el registro genérico de jobs (`run_in_background` / `job_output` / `job_kill`).
- El plugin cliente registra la fila de ajustes; el plugin host lee el ajuste del usuario en cada llamada.
- install.ps1: instalación junction, montaje cordis.patch.yml y parche automático de la allowlist de ajustes dsh-host-apiproxy (limitación de DSH; ver README).
