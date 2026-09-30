# dsh-bash-terminal-ts

> 🌐 [简体中文](README.md) | [English](README.en.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md) · Comunidad: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Plugin de DSH (DeepSeek Harness): una herramienta `shell` que ejecuta de forma unificada en Windows los comandos de **cuatro** terminales — **PowerShell / Git Bash / MSYS2 / WSL**.

> **Este repositorio es la reescritura en TypeScript de `MAXeaglet/dsh-bash-terminal`**, con soporte MSYS2/MINGW64 funcional. Las líneas de compatibilidad se cortan por segmento de versión del host DSH; todas las líneas comparten el nombre de paquete `dsh-bash-terminal-ts` y se distinguen mediante dist-tags de npm:
>
> | Segmento DSH | Rama | Versión del plugin | dist-tag npm |
> |--------|------|----------|--------------|
> | `>=0.2.0-rc.1 <0.2.1-0` | `compat/0.2.0` (esta rama) | 0.7.x | `dsh-0.2.0` |
> | 0.1.7-rc.1 – 0.1.7.x | `compat/0.1.7` | 0.6.x | `dsh-0.1.7` |
> | 0.1.5-alpha.1 – 0.1.5-rc.x | `ts/0.1.5` (histórica, congelada) | ≤ 0.5.2 | `dsh-0.1.5` |
> | 0.1.2-alpha.1 – 0.1.2-rc.x | `main` (histórica, congelada) | ≤ 0.4.2 | `dsh-0.1.2` |
>
> Elige la línea que cubra tu versión de DSH; las series de versiones nunca se solapan, por lo que una instalación con `^` no puede resolverse entre líneas.

| Backend | Ejecución real | Sintaxis / rutas | Variables de entorno |
|------|----------|-------------|----------|
| `powershell` (predeterminado) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | `bash -lc <cmd>` de Git for Windows | POSIX; `/d/workspace`; PATH con `/usr/bin` y `/mingw64/bin` | `$NAME` |
| `msys2` | `bash -lc <cmd>` de MSYS2 (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH con `/usr/bin` y `/mingw64/bin` (gcc / make) | `$NAME` (inyección automática de `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (vía WSLENV) |

Cada llamada arranca una shell totalmente nueva: **no se conserva estado alguno** (cwd / variables / alias) — pasa `workdir` en lugar de usar `cd`.

## Vista previa de la interfaz

La fila «Terminal predeterminado» en Ajustes → General: el usuario elige entre PowerShell / Git Bash / MSYS2 / WSL, y la herramienta `shell` ejecuta solo conforme a ese ajuste, sin que el modelo pueda saltárselo:

![Fila del ajuste del terminal predeterminado](assets/shells.png)

## Puntos de diseño

- **El terminal lo decide el usuario, la IA no puede cambiarlo**: la página de ajustes de la UI web (Ajustes → General) muestra un desplegable de «Terminal predeterminado» (PowerShell / Git Bash / MSYS2 / WSL); la herramienta `shell` usa siempre únicamente ese ajuste y no expone ningún parámetro de terminal al modelo. El ajuste se persiste mediante el sistema de settings de DSH (settings.yaml).
- **No ocupa la costura de capacidades `ctx.shell`**: la herramienta `pwsh` sandboxizada que trae DSH sigue disponible tal cual; la herramienta `shell` de este plugin es una **entrada adicional** multi-terminal.
- Los procesos se derivan mediante la costura compartida `ctx.subprocess`: terminación del árbol de procesos (`taskkill /T` en Windows), SIGTERM → gracia → SIGKILL, archivos de spill de salida — comportamiento idéntico al de las herramientas oficiales `dsh-tool-bash` / `dsh-tool-pwsh`.
- Las tareas en segundo plano se registran en el registro genérico de `jobs`, con soporte de `run_in_background` / `job_output` / `job_kill`.
- La fila «Terminal predeterminado» de la página de ajustes del frontend es una enumeración (la UI la renderiza automáticamente como desplegable); en cada llamada el modelo ejecuta solo conforme a ese ajuste y no puede cambiar de terminal por su cuenta.

## Instalación (perfil web)

### Instalación estándar (tras la publicación en npm, mecanismo oficial de bundle)

El plugin trae el manifiesto oficial `dsh.bundle` (`cordis.patch.yml` dentro del paquete); en cuanto un perfil lista este paquete, DSH **aplica el montaje automáticamente**, sin necesidad de editar a mano la configuración del perfil:

```powershell
# 1. Instalar el paquete del plugin
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # se añade automáticamente a los bundles del perfil y aplica el parche

# 2. Parchear la allowlist de ajustes de DSH (limitación de DSH, ver explicación abajo)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Reiniciar dsh web
```

> Probado en la práctica con un perfil temporal: `bundles: [dsh-bash-terminal-ts]` → la entrada `tool-bash-terminal` aparece automáticamente en el dump-config.

### Instalación para desarrollo local (junction, los cambios de código fuente surten efecto al instante)

```powershell
# 1. Enlazar el paquete del plugin a los node_modules del perfil (junction, los cambios de fuente surten efecto al instante)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Permitir que el plugin resuelva las dependencias @deepseek-ai/* (junction hacia el árbol de dependencias del perfil; plugin y host comparten las mismas instancias de módulos)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Dejar que el perfil monte el plugin mediante el bundle oficial (install.ps1 install lo hace automáticamente; equivale a añadir "dsh-bash-terminal-ts" a dsh.profile.bundles)
# 4. (solo tras modificar el código del frontend) recompilar el bundle del cliente:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Reiniciar dsh web
```

> ⚠️ **No ejecutes `npm install` en este proyecto**: borraría la junction del paso 2 de arriba e instalaría para el plugin una copia **independiente** de
> `@deepseek-ai/*` — plugin y host dejarían de compartir instancias de módulos y, tras una actualización del host, el plugin se quedaría en la API antigua
> (este proyecto llegó a quedarse atascado en 0.1.0-rc.6 por esa razón). Para refrescar solo el lock, usa `npm install --package-lock-only`.

> **Compatibilidad**: requiere DSH ≥ **0.1.7-rc.1** (línea `compat/0.1.7`) o ≥ **0.2.0-rc.1** (línea `compat/0.2.0`, esta rama).
> Contexto histórico: en 0.1.5, `@deepseek-ai/dsh-client-runtime` en la tabla de módulos del cliente pasó a llamarse `@deepseek-ai/dsh-client-store` y solo se resuelve por coincidencia exacta del nombre desnudo; los bundles antiguos fallan en el host nuevo con
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Además: desde 0.1.5 la superficie de ajustes web usa la enumeración dinámica `settings.describe()` y **ya no tiene una allowlist de namespaces**
> (`settings-not-exposed` ya no existe); el parche de allowlist presente en `install.ps1` es solo un residuo histórico y puede ignorarse.

> Ya no hace falta editar manualmente el `cordis.patch.yml` del perfil: el paquete del plugin trae su propio `dsh.bundle.patch` (`cordis.patch.yml` dentro del paquete); basta con que `dsh-bash-terminal-ts` figure en el `dsh.profile.bundles` del perfil para que DSH monte el plugin automáticamente.

Verificar el árbol combinado (sin reiniciar):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Uso

**El usuario establece el terminal predeterminado en la UI web**: abre los ajustes (engranaje) → General → desplegable «Terminal predeterminado» y elige uno entre PowerShell / Git Bash / MSYS2 / WSL. El cambio surte efecto de inmediato y se persiste.

Cuando el modelo ve la herramienta `shell`, ejecuta automáticamente con el terminal que elegiste (la herramienta no expone parámetros de terminal; el modelo no puede cambiar tu elección):

- Terminal predeterminado = Git Bash: `shell(command: "git status")` va por Git Bash
- Terminal predeterminado = MSYS2: `shell(command: "gcc --version")` va por MSYS2 (entorno MINGW64, disponibles gcc y make de `/mingw64/bin`)
- Terminal predeterminado = WSL: `shell(command: "ls -la /mnt/d/workspace")` va por WSL; `distro: "Ubuntu"` permite indicar la distribución
- Terminal predeterminado = PowerShell: `shell(command: "Get-Process node")` va por PowerShell

## Ejemplos de uso para el modelo

- Comando puntual (terminal predeterminado): `shell(command: "git status", description: "ver el estado de git")`
- Estado preservado entre turnos (interactivo): `terminal(action: "open")` → anota el `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Interrumpir un programa en ejecución: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Consultar las sesiones activas: `terminal(action: "list")`
- Escalada tras un rechazo de la sandbox: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Configuración

**Ajustes de la UI web** (recomendado): Ajustes → General → «Terminal predeterminado».

El `config` de la fila del plugin (sobrescribe los predeterminados y sirve de base de composición para los ajustes):

| Clave | Predeterminado | Descripción |
|----|------|------|
| `defaultShell` | `powershell` | Backend usado cuando los ajustes no sobrescriben |
| `timeoutMs` | 120000 | Tiempo de espera predeterminado |
| `maxTimeoutMs` | 600000 | Límite superior del timeoutMs del llamante |
| `pwshPath` | detección automática | Ruta fija de pwsh.exe |
| `gitBashPath` | detección automática | Ruta fija de git bash.exe |
| `msys2Path` | detección automática (primero `C:\msys64\usr\bin\bash.exe`, reserva en `msys2.exe`) | Ruta fija de MSYS2 bash.exe |
| `wslPath` | detección automática | Ruta fija de wsl.exe |

## Publicación (npm)

La cuenta de npm tiene activada la verificación 2FA para publicar; hace falta un código de un solo uso:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <código>   # el código lo da tu autenticador
```

Antes de publicar, haz un `npm pack --dry-run` para revisar el contenido y ejecuta `npm run build` para recompilar todo (compilación de servidor con tsc + bundle del cliente + compilación de los tests).

## Desinstalación

Basta con ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Elimina las junction, restaura la allowlist de ajustes, limpia los bloques de montaje `cordis.patch.yml` heredados de versiones antiguas y retira `dsh-bash-terminal-ts` del `dsh.profile.bundles`. Después reinicia dsh web.

En una desinstalación manual, además de borrar `node_modules\dsh-bash-terminal-ts`, recuerda también retirar `dsh-bash-terminal-ts` del `dsh.profile.bundles` del `package.json` del perfil.

## Terminal interactivo (herramienta `terminal`)

La herramienta `terminal` ofrece **sesiones interactivas persistentes** sobre la costura PTY (node-pty; en Windows, como el process inspector del `spawnTerminal` upstream solo admite POSIX, `lib/terminal.js` se conecta directamente a node-pty; fuera de Windows se sigue usando el `ctx.subprocess.spawnTerminal` oficial):

- `action: open` inicia una sesión de terminal real (según tu terminal predeterminado configurado; en wsl se puede pasar `distro`) y devuelve un `sessionId`
- `action: send` escribe la entrada y lee la nueva salida; `action: read` solo lee, sin escribir; `action: signal` envía una señal al grupo de procesos en primer plano (SIGINT = Ctrl+C)
- `action: close` termina la sesión
- **El estado de la sesión se conserva entre llamadas** (cwd / variables / alias), ideal para REPL, ssh y CLIs interactivos
- `send` espera a que la salida se estabilice (300 ms de silencio, tope de 5 s) y devuelve la **respuesta completa**; con más de 1 MB de salida emite el aviso `truncated`
- La entrada termina en `\\n` (o \\r) para representar la tecla Enter

## Sandbox (conexión con el mecanismo oficial)

La herramienta `shell` pasa por la costura oficial de sandbox de DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- En cada llamada se resuelve la política de sandbox vigente; las sesiones `danger-full-access` se ejecutan directamente (sin envoltura).
- El backend PowerShell envuelve el argv mediante `ctx.sandbox.confine` — la misma semántica **fail-closed** que los ejecutores oficiales: si se pide el modo restringido y no hay backend disponible, se lanza `SandboxUnavailableError`, rechazando la ejecución desnuda.
- El backend Git Bash no se envuelve: el runner de token restringido con ACL de Windows de DSH es incompatible con Cygwin/MSYS2 (bash aborta al arrancar con el error Win32 5 de `CreateFileMapping`); por eso Git Bash tampoco pasa por envoltura de sandbox en modo restringido; el resultado informa `enforcement: gitbash-unconfined`.
- El backend MSYS2 tampoco se envuelve (la misma incompatibilidad de runtime Cygwin/MSYS2); el resultado informa `enforcement: msys2-unconfined`.
- El backend WSL no se envuelve: la máquina virtual Linux independiente de WSL es por sí misma el aislamiento (el resultado informa `enforcement: wsl-isolation`).
- Cuando la sandbox rechaza en modo restringido, el resultado lleva el marcador oficial `[sandbox: file access denied under <mode> mode]` y la pista de escalada del mismo turno; el modelo puede iniciar una escalada con `sandbox_permissions` + `justification` (aprobación del usuario vía `ctx.approval`), exactamente igual que las herramientas oficiales bash/pwsh.
- Nota: cuando el runner de ACL de Windows de DSH está disponible, el modo restringido de PowerShell se envuelve a través de él; Git Bash y MSYS2 siguen sin envolver por la incompatibilidad Cygwin/MSYS2.

## ⚠️ Notas de seguridad

La herramienta `shell` en modo restringido: PowerShell se envuelve vía `ctx.sandbox.confine` (fail-closed); Git Bash y MSYS2 **no se envuelven** por la incompatibilidad entre Cygwin/MSYS2 y los tokens restringidos de ACL de Windows (mismos permisos que el proceso dsh); WSL no se envuelve gracias a su VM Linux independiente. Es una **entrada adicional multi-terminal** y no disfruta de las restricciones ConstrainedLanguage de la herramienta oficial `pwsh`. Las herramientas de manejo de archivos de DSH (read/write/edit) siguen sujetas a la sandbox de archivos. Úsala solo en sesiones de confianza; para un PowerShell protegido por la sandbox sigue usando la herramienta oficial `pwsh`.

## Limitaciones conocidas del terminal interactivo (ConPTY)

- **PowerShell 5.1 no puede arrancar en un ConPTY** (0x8009001d) — para PowerShell interactivo instala [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (los comandos puntuales no se ven afectados).
- **El modo interactivo de wsl.exe puede desencadenar un error RPC del servicio WSL bajo ConPTY** (0x8007072c, intermitente) — los comandos puntuales `wsl -e bash -lc ...` funcionan con normalidad; para sesiones interactivas conviene usar directamente Windows Terminal / un terminal de WSL, o reintentar.
- **node-pty no acepta señales con nombre en Windows**: el `SIGINT` de `signal` se mapea a Ctrl+C (`\x03`); las demás señales (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) degradan a terminar la sesión.
- Las sesiones interactivas de Git Bash funcionan por completo.

## Limitaciones conocidas

- Los procesos en segundo plano de WSL pueden sobrevivir brevemente dentro de la distribución tras un timeout/interrupción (la instancia de WSL se apaga sola tras la salida del último proceso).
- Git Bash es un entorno msys2, con diferencias respecto al comportamiento Linux de WSL (mapeo de rutas, disponibilidad de paquetes).
- El backend MSYS2 requiere MSYS2 instalado localmente (por defecto `C:\msys64`); sin instalación `shell` informa `backend unavailable`, y con `msys2Path` se puede indicar una ubicación personalizada. El orden de candidatos siempre es `bash.exe` primero y `msys2.exe` de reserva — con stdio por tubería `msys2.exe` devuelve silenciosamente cero bytes y solo sirve como último recurso.
- Este plugin registra sus herramientas únicamente en la plataforma `win32`.

## Pruebas

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # instalar las dependencias (typescript incluido)
npm run build        # compilación tsc de src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

El código fuente está en TypeScript (`strict` + `noUncheckedIndexedAccess`); los artefactos de compilación `lib/` y `dist/` se suben al repositorio y DSH carga directamente `lib/index.js`, listo para usar sin instalación.
