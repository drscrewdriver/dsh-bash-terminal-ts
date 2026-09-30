# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> Сообщество: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Плагин для DSH (DeepSeek Harness): инструмент `shell`, единообразно выполняющий команды на Windows через четыре терминала — **PowerShell / Git Bash / MSYS2 / WSL**.

> **Этот репозиторий — переписанная на TypeScript версия `MAXeaglet/dsh-bash-terminal`** с работающей поддержкой MSYS2/MINGW64. Две совместимые линии:
>
> | Ветка | Сегмент DSH | Имя пакета | Статус |
> |-------|-------------|------------|--------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | эта ветка; `build` / `unit` / `apply` / `client` / `terminal` локально зелёные |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | основная линия TypeScript-версии |
>
> **Обе линии намеренно используют разные имена пакетов**, поэтому их можно устанавливать параллельно, не перезаписывая друг друга. Выбирайте ветку в соответствии с вашей версией DSH.

| Бэкенд | Фактически выполняет | Синтаксис / пути | Переменные окружения |
|--------|----------------------|------------------|----------------------|
| `powershell` (по умолчанию) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX; `/d/workspace`; PATH включает `/usr/bin` и `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH включает `/usr/bin` и `/mingw64/bin` (gcc / make) | `$NAME` (автоматически подставляется `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (через WSLENV) |

При каждом вызове запускается совершенно новый shell: **состояние не сохраняется** (cwd / переменные / алиасы) — передавайте `workdir`, а не используйте `cd`.

## Предпросмотр интерфейса

Строка «Терминал по умолчанию» в настройках (Настройки → Общие): пользователь выбирает между PowerShell / Git Bash / MSYS2 / WSL, а инструмент `shell` выполняет команды строго согласно этой настройке — модель не может её переопределить:

![Строка настройки терминала по умолчанию](assets/shells.png)

## Ключевые особенности реализации

- **Терминал выбирает пользователь, ИИ не может его изменить**: на странице настроек веб-интерфейса (Настройки → Общие) появляется выпадающий список «Терминал по умолчанию» (PowerShell / Git Bash / MSYS2 / WSL); инструмент `shell` всегда использует только эту настройку и не раскрывает модели параметров выбора терминала. Настройка сохраняется через систему настроек DSH (settings.yaml).
- **Не занимает точку расширения `ctx.shell`**: входящий в DSH изолированный инструмент `pwsh` остаётся доступным как есть; инструмент `shell` из этого плагина — **дополнительная** точка входа для работы с несколькими терминалами.
- Порождает процессы через общий интерфейс `ctx.subprocess`: завершение дерева процессов (Windows `taskkill /T`), SIGTERM → льготный период → SIGKILL, spill-файлы для вывода — поведение совпадает с официальными `dsh-tool-bash` / `dsh-tool-pwsh`.
- Фоновые задачи регистрируются в универсальном реестре `jobs` с поддержкой `run_in_background` / `job_output` / `job_kill`.
- Параметр «Терминал по умолчанию» на странице настроек фронтенда — это перечисление (UI автоматически отображает его как выпадающий список); при каждом вызове модель выполняет команды строго согласно этой настройке и не может сама переключить терминал.

## Установка (web profile)

### Стандартная установка (после публикации в npm, официальный механизм bundle)

Плагин содержит официальный манифест `dsh.bundle` (файл `cordis.patch.yml` внутри пакета); когда пакет указан в profile, DSH **автоматически применяет монтирование** — вручную править конфигурацию profile не нужно:

```powershell
# 1. Установите пакет плагина
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # автоматически добавляет пакет в bundles профиля и применяет patch

# 2. Пропатчите белый список настроек DSH (ограничение DSH, см. пояснение ниже)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Перезапустите dsh web
```

> Проверено на временном profile: после `bundles: [dsh-bash-terminal-ts]` запись `tool-bash-terminal` автоматически появляется в dump-config.

### Примечание для пользователей pnpm: разрешите скрипт сборки node-pty

Для интерактивного терминала этот плагин использует нативную библиотеку PTY [`node-pty`](https://www.npmjs.com/package/node-pty) (поддерживается Microsoft, та же, что и в VS Code), и при установке нужно выполнить её скрипт компиляции. npm по умолчанию выполняет install-скрипты зависимостей — ничего делать не требуется; **pnpm ≥10 по умолчанию их блокирует**, и `pnpm add` завершается сообщением:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

Пакет при этом установлен, но нативная привязка не скомпилирована, поэтому инструмент `terminal` (интерактивный терминал) не сможет запуститься. Достаточно один раз дать разрешение:

```powershell
pnpm approve-builds      # интерактивно отметьте node-pty
# или объявите в package.json профиля и пересоберите:
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> Из собственных dsh-плагинов **только этот** имеет нативную зависимость; остальные плагины линейки 0.2.0 (search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper), а также live-token-stats — чистые JS-пакеты, pnpm устанавливает их напрямую, approve-builds не требуется.

### Локальная установка для разработки (junction-ссылки, изменения исходников вступают в силу сразу)

```powershell
# 1. Свяжите пакет плагина с node_modules профиля (junction; изменения исходников вступают в силу сразу)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Позвольте плагину разрешать зависимости @deepseek-ai/* (junction на дерево зависимостей профиля — плагин и хост используют один и тот же экземпляр модулей)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Дайте профилю смонтировать плагин через официальный bundle (install.ps1 install делает это автоматически; эквивалентно добавлению "dsh-bash-terminal-ts" в dsh.profile.bundles)
# 4. (только после изменения исходников фронтенда) пересоберите client bundle:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Перезапустите dsh web
```

> ⚠️ **Не запускайте `npm install` внутри этого проекта**: он удалит junction из шага 2 выше и вместо этого установит для плагина **отдельную** копию
> `@deepseek-ai/*` — плагин и хост перестанут использовать общие экземпляры модулей, и после обновления хоста плагин останется на старом API
> (этот проект однажды так застрял на 0.1.0-rc.6). Для обновления только lock-файла используйте `npm install --package-lock-only`.

> **Совместимость**: требуется DSH ≥ **0.1.5-rc.1**. В 0.1.5 модуль `@deepseek-ai/dsh-client-runtime` браузерной таблицы модулей переименован в
> `@deepseek-ai/dsh-client-store`, а сопоставление выполняется только по точному «голому» имени; старые bundle на новом хосте выдают
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Кроме того, в 0.1.5 панель веб-настроек переведена на динамическое перечисление через `settings.describe()`, **белых списков namespace больше нет**
> (`settings-not-exposed` больше не существует); patch белого списка в `install.ps1` — лишь историческое наследие, его можно игнорировать.

> Вручную править `cordis.patch.yml` профиля больше не нужно: пакет плагина содержит собственный `dsh.bundle.patch` (файл `cordis.patch.yml` внутри пакета), и если в `dsh.profile.bundles` профиля указан `dsh-bash-terminal-ts`, DSH смонтирует его автоматически.

Проверка итогового дерева конфигурации (без перезапуска):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Использование

**Пользователь задаёт терминал по умолчанию в веб-интерфейсе**: откройте настройки (шестерёнка) → Общие → выпадающий список «Терминал по умолчанию» и выберите один из вариантов: PowerShell / Git Bash / MSYS2 / WSL. Изменение вступает в силу немедленно и сохраняется.

Увидев инструмент `shell`, модель при выполнении команд автоматически использует выбранный вами терминал (инструмент не раскрывает параметров выбора терминала, поэтому модель не может изменить ваш выбор):

- Терминал по умолчанию = Git Bash: `shell(command: "git status")` выполняется через Git Bash
- Терминал по умолчанию = MSYS2: `shell(command: "gcc --version")` выполняется через MSYS2 (окружение MINGW64, доступны gcc и make из `/mingw64/bin`)
- Терминал по умолчанию = WSL: `shell(command: "ls -la /mnt/d/workspace")` выполняется через WSL; передайте `distro: "Ubuntu"`, чтобы указать дистрибутив
- Терминал по умолчанию = PowerShell: `shell(command: "Get-Process node")` выполняется через PowerShell

## Примеры использования моделью

- Разовая команда (терминал по умолчанию): `shell(command: "git status", description: "показать статус git")`
- Сохранение состояния между ходами (интерактивно): `terminal(action: "open")` → запомните `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Прерывание работающей программы: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Просмотр активных сеансов: `terminal(action: "list")`
- Эскалация после отказа песочницы: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Конфигурация

**Настройки веб-интерфейса** (рекомендуется): Настройки → Общие → «Терминал по умолчанию».

`config` в row плагина (переопределяет значения по умолчанию и служит базой композиции настроек):

| Ключ | По умолчанию | Описание |
|------|--------------|----------|
| `defaultShell` | `powershell` | Бэкенд, используемый, если настройка не переопределила его |
| `timeoutMs` | 120000 | Таймаут по умолчанию |
| `maxTimeoutMs` | 600000 | Верхний предел timeoutMs от вызывающей стороны |
| `pwshPath` | автоопределение | Явно заданный путь к pwsh.exe |
| `gitBashPath` | автоопределение | Явно заданный путь к git bash.exe |
| `msys2Path` | автоопределение (приоритет у `C:\msys64\usr\bin\bash.exe`, запасной вариант — `msys2.exe`) | Явно заданный путь к MSYS2 bash.exe |
| `wslPath` | автоопределение | Явно заданный путь к wsl.exe |

## Публикация (npm)

Для npm-аккаунта включена двухфакторная проверка публикации, требуется одноразовый код:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <код>   # код берётся из вашего аутентификатора
```

Перед публикацией выполните `npm pack --dry-run`, чтобы проверить содержимое, и `npm run build` для пересборки (компиляция серверной части через tsc + client bundle + компиляция тестов).

## Удаление

Рекомендуется выполнить напрямую:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Она удалит junction-ссылки, восстановит белый список настроек, вычистит оставшийся от старых версий блок монтирования в `cordis.patch.yml` и уберёт `dsh-bash-terminal-ts` из `dsh.profile.bundles`. После этого достаточно перезапустить dsh web.

При ручном удалении, помимо удаления `node_modules\dsh-bash-terminal-ts`, не забудьте убрать `dsh-bash-terminal-ts` из `dsh.profile.bundles` в `package.json` профиля.

## Интерактивный терминал (инструмент terminal)

Инструмент `terminal` предоставляет **устойчивые интерактивные сеансы** поверх PTY-прослойки (node-pty; на Windows из-за того, что process inspector вышестоящего `spawnTerminal` поддерживает только POSIX, к node-pty напрямую подключается `lib/terminal.js`, а на не-Windows по-прежнему используется официальный `ctx.subprocess.spawnTerminal`):

- `action: open` запускает реальный сеанс терминала (согласно вашему терминалу по умолчанию; для wsl можно передать `distro`) и возвращает `sessionId`
- `action: send` записывает ввод и читает новый вывод; `action: read` только читает, не записывая; `action: signal` отправляет сигнал группе процессов переднего плана (SIGINT = Ctrl+C)
- `action: close` завершает сеанс
- **Состояние сеанса сохраняется между вызовами** (cwd / переменные / алиасы) — подходит для REPL, ssh, интерактивных CLI
- `send` ждёт стабилизации вывода (300 мс тишины, предел 5 с) и возвращает **полный ответ**; при выводе свыше 1 МБ выдаётся пометка `truncated`
- Ввод, оканчивающийся на `\\n` (или \\r), означает нажатие Enter

## Песочница (интеграция с официальным механизмом)

Инструмент `shell` использует официальный песочный интерфейс DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- При каждом вызове разрешается текущая политика песочницы; сеансы `danger-full-access` выполняются напрямую (без обёртки).
- Бэкенд PowerShell оборачивает argv через `ctx.sandbox.confine` — та же семантика **fail-closed**, что и у официального executor: если запрошен ограниченный режим, но доступного бэкенда нет, выбрасывается `SandboxUnavailableError`, а запуск без ограничений отвергается.
- Бэкенд Git Bash не оборачивается: runner с ограниченным токеном Windows ACL в DSH несовместим с Cygwin/MSYS2 (bash сразу при запуске завершается с `CreateFileMapping` Win32 error 5), поэтому Git Bash в ограниченном режиме тоже работает без песочной обёртки; результат сообщает `enforcement: gitbash-unconfined`.
- Бэкенд MSYS2 также не оборачивается (та же несовместимость среды выполнения Cygwin/MSYS2); результат сообщает `enforcement: msys2-unconfined`.
- Бэкенд WSL не оборачивается: отдельная виртуальная машина Linux в WSL сама по себе является изоляцией (результат сообщает `enforcement: wsl-isolation`).
- При отказе песочницы в ограниченном режиме результат содержит официальную пометку `[sandbox: file access denied under <mode> mode]` и подсказку об эскалации в том же ходе; модель может выполнить одну эскалацию с помощью `sandbox_permissions` + `justification` (с утверждением пользователем через `ctx.approval`) — в точности как официальные инструменты bash/pwsh.
- Примечание: когда runner Windows ACL в DSH доступен, ограниченный режим PowerShell оборачивается через него; Git Bash и MSYS2 из-за несовместимости с Cygwin/MSYS2 остаются без обёртки.

## ⚠️ Замечания по безопасности

Инструмент `shell` в ограниченном режиме: PowerShell оборачивается через `ctx.sandbox.confine` (fail-closed); Git Bash и MSYS2 из-за несовместимости Cygwin/MSYS2 с ограниченным токеном Windows ACL **не оборачиваются** (права совпадают с процессом dsh); WSL не оборачивается благодаря отдельной виртуальной машине Linux. Это **дополнительная точка входа для нескольких терминалов**, на которую не распространяются ограничения ConstrainedLanguage официального инструмента `pwsh`. Инструменты DSH для работы с файлами (read/write/edit) по-прежнему ограничены файловой песочницей. Используйте только в сеансах, которым доверяете; если вам нужен защищённый песочницей PowerShell, продолжайте пользоваться официальным инструментом `pwsh`.

## Известные ограничения интерактивного терминала (ConPTY)

- **PowerShell 5.1 не может запуститься в ConPTY** (0x8009001d) — для интерактивного PowerShell установите [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (разовые команды не затронуты).
- **Интерактивный режим wsl.exe под ConPTY может вызывать RPC-ошибку службы WSL** (0x8007072c, спорадически) — разовая команда `wsl -e bash -lc ...` работает нормально; для интерактивных сеансов рекомендуется использовать напрямую Windows Terminal / терминал WSL либо повторить попытку.
- **node-pty на Windows не принимает именованные сигналы**: `SIGINT` в `signal` отображается на Ctrl+C (`\x03`), остальные сигналы (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) вырождаются в завершение сеанса.
- Интерактивные сеансы Git Bash работают полностью штатно.

## Известные ограничения

- Фоновые процессы WSL после таймаута/прерывания могут недолго оставаться в дистрибутиве (экземпляр WSL закрывается автоматически после выхода последнего процесса).
- Git Bash — это среда msys2, и её поведение отличается от Linux в WSL (отображение путей, доступность пакетов).
- Бэкенду MSYS2 нужна установленная локально MSYS2 (по умолчанию `C:\msys64`); если её нет, `shell` сообщает `backend unavailable`, а `msys2Path` позволяет указать нестандартное расположение. Порядок кандидатов всегда один: сначала `bash.exe`, запасной вариант — `msys2.exe`; при конвейерном stdio `msys2.exe` молча возвращает ноль байтов, поэтому это лишь крайняя мера.
- Этот плагин регистрирует инструменты только на платформе `win32`.

## Тестирование

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # установка зависимостей (включая typescript)
npm run build        # tsc компилирует src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Исходный код написан на TypeScript (`strict` + `noUncheckedIndexedAccess`); артефакты сборки `lib/` и `dist/` коммитятся в репозиторий, DSH загружает плагин напрямую из `lib/index.js`, поэтому он работает без установки.
