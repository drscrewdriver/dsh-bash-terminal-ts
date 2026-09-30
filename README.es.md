# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> Comunidad: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Complemento de DSH (DeepSeek Harness): una herramienta `shell` que ejecuta de manera unificada comandos de las cuatro terminales **PowerShell / Git Bash / MSYS2 / WSL** en Windows.

> **Este repositorio es una reescritura en TypeScript de `MAXeaglet/dsh-bash-terminal`**, con soporte operativo de MSYS2/MINGW64. Dos líneas de compatibilidad:
>
> | Rama | Segmento de DSH | Nombre del paquete | Estado |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | esta rama; `build` / `unit` / `apply` / `client` / `terminal` todos en verde en local |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | línea principal de la reescritura en TypeScript |
>
> Las dos líneas **usan deliberadamente nombres de paquete distintos**, de modo que pueden instalarse en paralelo sin sobrescribirse entre sí. Elige la rama según tu versión de DSH.

| Backend | Ejecución real | Sintaxis / rutas | Variables de entorno |
|------|----------|-------------|----------|
| `powershell` (predeterminado) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX; `/d/workspace`; PATH incluye `/usr/bin` y `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH incluye `/usr/bin` y `/mingw64/bin` (gcc / make) | `$NAME` (inyecta `MSYSTEM=MINGW64` automáticamente) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (vía WSLENV) |

Cada llamada arranca un shell completamente nuevo: **no se conserva estado alguno** (cwd / variables / alias) — pasa `workdir` en lugar de usar `cd`.

## Vista previa de la interfaz

La fila «Terminal predeterminada» en Configuración → General: el usuario elige entre PowerShell / Git Bash / MSYS2 / WSL, y la herramienta `shell` se ejecuta únicamente conforme a esa configuración; el modelo no puede sobrescribirla:

![Fila de configuración de la terminal predeterminada](assets/shells.png)

## Puntos de diseño

- **La terminal la decide el usuario y la IA no puede cambiarla**: en la página de configuración de la Web UI (Configuración → General) aparece el desplegable «Terminal predeterminada» (PowerShell / Git Bash / MSYS2 / WSL); la herramienta `shell` siempre usa exclusivamente esa configuración y no expone parámetros de terminal al modelo. La configuración se persiste mediante el sistema de settings de DSH (settings.yaml).
- **No ocupa el *seam* de capacidades `ctx.shell`**: la herramienta `pwsh` con sandbox incluida de serie en DSH sigue disponible tal cual; la herramienta `shell` de este complemento es un punto de entrada multi-terminal **adicional**.
- Deriva procesos a través del *seam* compartido `ctx.subprocess`: terminación del árbol de procesos (`taskkill /T` en Windows), SIGTERM→grace→SIGKILL, archivos de spill para la salida — el mismo comportamiento que los oficiales `dsh-tool-bash` / `dsh-tool-pwsh`.
- Las tareas en segundo plano se registran en el registro genérico de `jobs`, con soporte para `run_in_background` / `job_output` / `job_kill`.
- La «Terminal predeterminada» de la página de configuración del frontend es un enum (la UI lo renderiza automáticamente como desplegable); el modelo ejecuta cada llamada conforme a esa configuración y no puede cambiar de terminal por su cuenta.

## Instalación (web profile)

### Instalación estándar (tras la publicación en npm, mecanismo oficial de bundle)

El complemento incluye el manifiesto oficial `dsh.bundle` (su propio `cordis.patch.yml` dentro del paquete); cuando el profile enumera este paquete, DSH **aplica el montaje automáticamente**, sin necesidad de editar a mano la configuración del profile:

```powershell
# 1. Instalar el paquete del complemento
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # se añade automáticamente a los bundles del profile y aplica el patch

# 2. Parchear la lista blanca de settings de DSH (limitación de DSH, ver la explicación de abajo)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Reiniciar dsh web
```

> Verificado en la práctica con un profile temporal: con `bundles: [dsh-bash-terminal-ts]`, la entrada `tool-bash-terminal` aparece automáticamente en dump-config.

### Nota para usuarios de pnpm: aprobar el script de build de node-pty

Este complemento depende de la librería PTY nativa [`node-pty`](https://www.npmjs.com/package/node-pty) (mantenida por Microsoft, la misma que usa VS Code) para implementar la terminal interactiva, y durante la instalación debe ejecutarse su script de compilación. npm ejecuta por defecto los install scripts de las dependencias, así que no hay que hacer nada; **pnpm ≥10 los bloquea por defecto**, y `pnpm add` termina con:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

En ese punto el paquete ya está instalado, pero el binding nativo no se ha compilado, por lo que la herramienta `terminal` (terminal interactiva) fallará al arrancar. Basta con autorizarlo una vez:

```powershell
pnpm approve-builds      # marcar node-pty de forma interactiva
# o declararlo en el package.json del profile y reconstruir:
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> De los complementos dsh propios, **solo este** lleva una dependencia nativa; los demás complementos de la línea 0.2.0 (search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper) y live-token-stats son paquetes de JS puro y se instalan en pnpm directamente, sin necesidad de approve-builds.

### Instalación para desarrollo local (junction de enlace directo, los cambios de código aplican al instante)

```powershell
# 1. Enlazar el paquete del complemento al node_modules del profile (junction; los cambios en el código fuente aplican al instante)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Permitir que el complemento resuelva las dependencias @deepseek-ai/* (junction hacia el árbol de dependencias del profile; el complemento y el host comparten la misma instancia de módulos)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Hacer que el profile monte el complemento mediante el bundle oficial (install.ps1 install lo hace automáticamente; equivale a añadir "dsh-bash-terminal-ts" a dsh.profile.bundles)
# 4. (solo tras modificar el código fuente del frontend) reempaquetar el client bundle:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Reiniciar dsh web
```

> ⚠️ **No ejecutes `npm install` dentro de este proyecto**: borra la junction del paso 2 de arriba y, en su lugar, instala una copia **independiente** de `@deepseek-ai/*` para el complemento — el complemento y el host dejan de compartir la instancia de módulos y, cuando el host se actualiza, el complemento se queda anclado a una API antigua
> (este proyecto llegó a quedarse en 0.1.0-rc.6 por esa razón). Para refrescar únicamente el lock usa `npm install --package-lock-only`.

> **Compatibilidad**: requiere DSH ≥ **0.1.5-rc.1**. La versión 0.1.5 renombró `@deepseek-ai/dsh-client-runtime` a `@deepseek-ai/dsh-client-store` en la tabla de módulos del navegador y solo resuelve por el nombre exacto; los bundles antiguos sobre el host nuevo fallan con
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Además: la superficie de configuración web de 0.1.5 pasó a un enum dinámico mediante `settings.describe()` y **ya no existe lista blanca de namespaces**
> (`settings-not-exposed` ya no existe); el patch de lista blanca dentro de `install.ps1` es solo un vestigio histórico y puede ignorarse.

> Hoy en día ya no hace falta editar a mano el `cordis.patch.yml` del profile: el paquete del complemento trae su propio `dsh.bundle.patch` (`cordis.patch.yml` dentro del paquete); mientras `dsh-bash-terminal-ts` figure en el `dsh.profile.bundles` del profile, DSH lo montará automáticamente.

Verificar el árbol de composición resultante (sin necesidad de reiniciar):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Uso

**El usuario configura la terminal predeterminada en la Web UI**: abre Configuración (engranaje) → General → desplegable «Terminal predeterminada» y elige una entre PowerShell / Git Bash / MSYS2 / WSL. Los cambios aplican al instante y se persisten.

Cuando el modelo ve la herramienta `shell`, ejecuta los comandos automáticamente con la terminal que elegiste (la herramienta no expone parámetros de terminal; el modelo no puede cambiar tu elección):

- Con la terminal predeterminada = Git Bash: `shell(command: "git status")` se ejecuta en Git Bash
- Con la terminal predeterminada = MSYS2: `shell(command: "gcc --version")` se ejecuta en MSYS2 (entorno MINGW64; disponibles gcc y make de `/mingw64/bin`)
- Con la terminal predeterminada = WSL: `shell(command: "ls -la /mnt/d/workspace")` se ejecuta en WSL; pasa `distro: "Ubuntu"` para indicar la distribución
- Con la terminal predeterminada = PowerShell: `shell(command: "Get-Process node")` se ejecuta en PowerShell

## Ejemplos de uso del modelo

- Comando de una sola vez (terminal predeterminada): `shell(command: "git status", description: "Ver el estado de git")`
- Mantener el estado entre turnos (interactivo): `terminal(action: "open")` → anota el `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Interrumpir un programa en ejecución: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Ver las sesiones activas: `terminal(action: "list")`
- Escalar tras un rechazo del sandbox: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Configuración

**Configuración en la Web UI** (recomendado): Configuración → General → «Terminal predeterminada».

El `config` de la fila del complemento (sobrescribe los valores predeterminados y sirve de base de composición para la configuración):

| Clave | Predeterminado | Descripción |
|----|------|------|
| `defaultShell` | `powershell` | backend empleado cuando la configuración no lo sobrescribe |
| `timeoutMs` | 120000 | timeout predeterminado |
| `maxTimeoutMs` | 600000 | límite superior del timeoutMs del llamador |
| `pwshPath` | detección automática | fija la ruta de pwsh.exe |
| `gitBashPath` | detección automática | fija la ruta de git bash.exe |
| `msys2Path` | detección automática (prioriza `C:\msys64\usr\bin\bash.exe`, con `msys2.exe` como respaldo) | fija la ruta de MSYS2 bash.exe |
| `wslPath` | detección automática | fija la ruta de wsl.exe |

## Publicación (npm)

La cuenta de npm tiene habilitada la verificación 2FA para publicar, por lo que se necesita un código de un solo uso:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <código>   # el código procede de tu autenticador
```

Antes de publicar, ejecuta `npm pack --dry-run` para revisar el contenido y ejecuta `npm run build` para recompilar (compilación del servidor con tsc + client bundle + compilación de los tests).

## Desinstalación

Se recomienda ejecutar directamente:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Elimina las junction, restaura la lista blanca de settings, limpia los bloques de montaje `cordis.patch.yml` heredados de versiones anteriores y quita `dsh-bash-terminal-ts` de `dsh.profile.bundles`. Después basta con reiniciar dsh web.

En una desinstalación manual, además de eliminar `node_modules\dsh-bash-terminal-ts`, recuerda quitar `dsh-bash-terminal-ts` del `dsh.profile.bundles` del `package.json` del profile.

## Terminal interactiva (herramienta terminal)

La herramienta `terminal` proporciona **sesiones interactivas persistentes** sobre el *seam* PTY (node-pty; en Windows, como el process inspector del `spawnTerminal` ascendente solo admite POSIX, `lib/terminal.js` se conecta directamente a node-pty; en plataformas que no son Windows se sigue utilizando el `ctx.subprocess.spawnTerminal` oficial):

- `action: open` inicia una sesión de terminal real (según la terminal predeterminada que hayas configurado; con wsl puedes pasar `distro`) y devuelve un `sessionId`
- `action: send` escribe la entrada y lee la nueva salida; `action: read` solo lee sin escribir; `action: signal` envía una señal al grupo de procesos en primer plano (SIGINT = Ctrl+C)
- `action: close` termina la sesión
- **El estado de la sesión se conserva entre llamadas** (cwd / variables / alias), ideal para REPL, ssh y CLIs interactivas
- `send` espera a que la salida se estabilice (300ms de silencio, tope de 5s) y devuelve la **respuesta completa**; si la salida supera 1MB se emite el aviso `truncated`
- La entrada termina en `\\n` (o \\r) para indicar un Enter

## Sandbox (integración con el mecanismo oficial)

La herramienta `shell` utiliza el *seam* de sandbox oficial de DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- En cada llamada se resuelve la política de sandbox vigente; las sesiones `danger-full-access` se ejecutan directamente (sin envoltura).
- El backend de PowerShell envuelve el argv mediante `ctx.sandbox.confine` — la misma semántica **fail-closed** que el executor oficial: si se solicita el modo restringido y no hay backend disponible, se lanza `SandboxUnavailableError` y se rechaza la ejecución sin protección.
- El backend de Git Bash no se envuelve: el runner de token restringido con Windows ACL de DSH es incompatible con Cygwin/MSYS2 (bash termina nada más arrancar con `CreateFileMapping` Win32 error 5), por lo que Git Bash tampoco pasa por la envoltura del sandbox en modo restringido; el resultado informa `enforcement: gitbash-unconfined`.
- El backend de MSYS2 tampoco se envuelve (misma incompatibilidad con el runtime Cygwin/MSYS2); el resultado informa `enforcement: msys2-unconfined`.
- El backend de WSL no se envuelve: la máquina virtual Linux independiente de WSL ya es en sí misma un aislamiento (el resultado informa `enforcement: wsl-isolation`).
- Cuando el sandbox rechaza una llamada en modo restringido, el resultado incluye el marcador oficial `[sandbox: file access denied under <mode> mode]` junto con una sugerencia de escalado en el mismo turno; el modelo puede iniciar un escalado con `sandbox_permissions` + `justification` (sometido a la aprobación del usuario mediante `ctx.approval`), exactamente igual que las herramientas oficiales bash/pwsh.
- Nota: cuando el runner de Windows ACL de DSH está disponible, el modo restringido de PowerShell se envuelve a través de él; Git Bash y MSYS2 permanecen sin envolver debido a la incompatibilidad con Cygwin/MSYS2.

## ⚠️ Nota de seguridad

La herramienta `shell` en modo restringido: PowerShell se envuelve mediante `ctx.sandbox.confine` (fail-closed); Git Bash y MSYS2 **no se envuelven** porque Cygwin/MSYS2 es incompatible con el token restringido de Windows ACL (mismos permisos que el proceso dsh); WSL no se envuelve por tratarse de una VM Linux independiente. Es un **punto de entrada multi-terminal adicional** y no se beneficia de las restricciones ConstrainedLanguage de la herramienta oficial `pwsh`. Las herramientas de operaciones sobre archivos de DSH (read/write/edit) siguen sujetas al sandbox de archivos. Úsala solo en sesiones en las que confíes; cuando necesites un PowerShell protegido por el sandbox, sigue usando la herramienta oficial `pwsh`.

## Limitaciones conocidas de la terminal interactiva (ConPTY)

- **PowerShell 5.1 no puede arrancar en un ConPTY** (0x8009001d) — para PowerShell interactivo es necesario instalar [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (los comandos de una sola vez no se ven afectados).
- **El modo interactivo de wsl.exe puede desencadenar un error RPC del servicio WSL bajo ConPTY** (0x8007072c, intermitente) — los comandos de una sola vez `wsl -e bash -lc ...` funcionan correctamente; para sesiones interactivas se recomienda usar directamente Windows Terminal / la terminal de WSL, o reintentar.
- **En Windows, node-pty no acepta señales con nombre**: en `signal`, `SIGINT` se mapea a Ctrl+C (`\x03`); las demás señales (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) se degradan a terminar la sesión.
- Las sesiones interactivas de Git Bash funcionan perfectamente.

## Limitaciones conocidas

- Los procesos en segundo plano de WSL pueden quedar residiendo brevemente dentro de la distribución tras un timeout/interrupción (la instancia de WSL se cierra automáticamente cuando sale el último proceso).
- Git Bash es un entorno msys2 y presenta diferencias respecto al comportamiento Linux de WSL (mapeo de rutas, disponibilidad de paquetes).
- El backend de MSYS2 requiere tener MSYS2 instalado en la máquina (por defecto `C:\msys64`); si no está instalado, `shell` informa `backend unavailable`, y se puede usar `msys2Path` para indicar una ubicación personalizada. El orden de candidatos siempre prioriza `bash.exe` y deja `msys2.exe` como respaldo — bajo stdio por tubería, `msys2.exe` devuelve silenciosamente cero bytes, así que solo se emplea como último recurso.
- Este complemento registra sus herramientas únicamente en la plataforma `win32`.

## Pruebas

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # instala las dependencias (incluye typescript)
npm run build        # tsc compila src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

El código fuente está en TypeScript (`strict` + `noUncheckedIndexedAccess`); los artefactos compilados `lib/` y `dist/` se incluyen en el repositorio, y DSH carga directamente `lib/index.js`, de modo que puede usarse sin necesidad de instalar.
