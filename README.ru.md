# dsh-bash-terminal-ts

> 🌐 [简体中文](README.md) | [English](README.en.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md) · Сообщество: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Плагин DSH (DeepSeek Harness): инструмент `shell`, единообразно выполняющий в Windows команды **четырёх** терминалов — **PowerShell / Git Bash / MSYS2 / WSL**.

> **Этот репозиторий — переписанный на TypeScript вариант `MAXeaglet/dsh-bash-terminal`** с работающей поддержкой MSYS2/MINGW64. Линии совместимости выделяются по сегменту версии хоста DSH; все линии используют одно имя пакета `dsh-bash-terminal-ts` и различаются npm dist-tag'ами:
>
> | Сегмент DSH | Ветка | Версия плагина | npm dist-tag |
> |--------|------|----------|--------------|
> | `>=0.2.0-rc.1 <0.2.1-0` | `compat/0.2.0` (эта ветка) | 0.7.x | `dsh-0.2.0` |
> | 0.1.7-rc.1 – 0.1.7.x | `compat/0.1.7` | 0.6.x | `dsh-0.1.7` |
> | 0.1.5-alpha.1 – 0.1.5-rc.x | `ts/0.1.5` (историческая, заморожена) | ≤ 0.5.2 | `dsh-0.1.5` |
> | 0.1.2-alpha.1 – 0.1.2-rc.x | `main` (историческая, заморожена) | ≤ 0.4.2 | `dsh-0.1.2` |
>
> Выбирайте линию под вашу версию DSH; серии версий не пересекаются, поэтому установка с `^` не сможет разрешиться через границы линий.

| Бэкенд | Фактическое выполнение | Синтаксис / пути | Переменные окружения |
|------|----------|-------------|----------|
| `powershell` (по умолчанию) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | `bash -lc <cmd>` из Git for Windows | POSIX; `/d/workspace`; PATH включает `/usr/bin` и `/mingw64/bin` | `$NAME` |
| `msys2` | `bash -lc <cmd>` MSYS2 (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH включает `/usr/bin` и `/mingw64/bin` (gcc / make) | `$NAME` (автоматически подставляется `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (через WSLENV) |

Каждый вызов запускает совершенно новую оболочку: **состояние не сохраняется** (cwd / переменные / алиасы) — передавайте `workdir`, а не используйте `cd`.

## Предпросмотр интерфейса

Строка «Терминал по умолчанию» в Настройки → Общие: пользователь выбирает между PowerShell / Git Bash / MSYS2 / WSL, а инструмент `shell` выполняется строго согласно этой настройке — модель не может её обойти:

![Строка настройки терминала по умолчанию](assets/shells.png)

## Ключевые решения дизайна

- **Терминал выбирает пользователь, ИИ не может его сменить**: на странице настроек веб-UI (Настройки → Общие) появляется выпадающий список «Терминал по умолчанию» (PowerShell / Git Bash / MSYS2 / WSL); инструмент `shell` всегда использует только эту настройку и не раскрывает модели параметров терминала. Настройка сохраняется через систему settings DSH (settings.yaml).
- **Не занимает стык возможностей `ctx.shell`**: штатный sandbox-инструмент `pwsh` из DSH остаётся доступным как есть; инструмент `shell` этого плагина — **дополнительная** точка входа к нескольким терминалам.
- Процессы порождаются через общий seam `ctx.subprocess`: завершение дерева процессов (в Windows `taskkill /T`), SIGTERM → льготный период → SIGKILL, spill-файлы вывода — поведение идентично официальным инструментам `dsh-tool-bash` / `dsh-tool-pwsh`.
- Фоновые задачи регистрируются в универсальном реестре `jobs` с поддержкой `run_in_background` / `job_output` / `job_kill`.
- Строка «Терминал по умолчанию» на странице настроек фронтенда — это перечисление (UI автоматически рендерит его выпадающим списком); при каждом вызове модель исполняет только согласно этой настройке и не может сменить терминал по собственной инициативе.

## Установка (web-профиль)

### Стандартная установка (после публикации в npm, официальный механизм bundle)

Плагин несёт собственный официальный манифест `dsh.bundle` (`cordis.patch.yml` внутри пакета); как только профиль перечисляет этот пакет, DSH **автоматически применяет монтирование**, вручную править конфигурацию профиля не нужно:

```powershell
# 1. Установить пакет плагина
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # автоматически добавляется в bundles профиля и применяет патч

# 2. Пропатчить whitelist настроек DSH (ограничение DSH, см. пояснение ниже)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Перезапустить dsh web
```

> Проверено на практике с временным профилем: `bundles: [dsh-bash-terminal-ts]` → запись `tool-bash-terminal` автоматически появляется в dump-config.

### Установка для локальной разработки (junction, изменения исходников вступают в силу сразу)

```powershell
# 1. Связать пакет плагина с node_modules профиля (junction, изменения исходников вступают в силу сразу)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Позволить плагину разрешать зависимости @deepseek-ai/* (junction на дерево зависимостей профиля; плагин и хост используют одни и те же экземпляры модулей)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Дать профилю смонтировать плагин через официальный bundle (install.ps1 install делает это автоматически; эквивалентно добавлению "dsh-bash-terminal-ts" в dsh.profile.bundles)
# 4. (только после правок фронтенд-кода) пересобрать клиентский bundle:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Перезапустить dsh web
```

> ⚠️ **Не запускайте `npm install` в этом проекте**: он удалит junction из шага 2 выше и установит для плагина **независимую** копию
> `@deepseek-ai/*` — плагин и хост перестанут использовать общие экземпляры модулей, и после обновления хоста плагин застрянет на старом API
> (этот проект однажды так застрял на 0.1.0-rc.6). Чтобы обновить только lock, используйте `npm install --package-lock-only`.

> **Совместимость**: требуется DSH ≥ **0.1.7-rc.1** (линия `compat/0.1.7`) или ≥ **0.2.0-rc.1** (линия `compat/0.2.0`, эта ветка).
> Историческая справка: в 0.1.5 `@deepseek-ai/dsh-client-runtime` в таблице клиентских модулей был переименован в `@deepseek-ai/dsh-client-store` и разрешается только по точному «голому» имени; старые bundle на новом хосте падают с
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Кроме того: с 0.1.5 веб-поверхность настроек перешла на динамическое перечисление `settings.describe()`, **whitelist пространств имён больше не существует**
> (`settings-not-exposed` упразднён), а whitelist-патч в `install.ps1` — лишь исторический остаток, его можно игнорировать.

> Теперь вручную править `cordis.patch.yml` профиля не нужно: пакет плагина несёт собственный `dsh.bundle.patch` (`cordis.patch.yml` внутри пакета); достаточно, чтобы `dsh-bash-terminal-ts` был указан в `dsh.profile.bundles` профиля — DSH смонтирует плагин автоматически.

Проверить собранное дерево (без перезапуска):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Использование

**Пользователь задаёт терминал по умолчанию в веб-UI**: откройте настройки (шестерёнка) → Общие → выпадающий список «Терминал по умолчанию» и выберите один из PowerShell / Git Bash / MSYS2 / WSL. Изменение вступает в силу сразу и сохраняется.

Увидев инструмент `shell`, модель автоматически использует выбранный вами терминал (инструмент не раскрывает параметров терминала, модель не может изменить ваш выбор):

- Терминал по умолчанию = Git Bash: `shell(command: "git status")` идёт через Git Bash
- Терминал по умолчанию = MSYS2: `shell(command: "gcc --version")` идёт через MSYS2 (окружение MINGW64, доступны gcc и make из `/mingw64/bin`)
- Терминал по умолчанию = WSL: `shell(command: "ls -la /mnt/d/workspace")` идёт через WSL; `distro: "Ubuntu"` позволяет указать дистрибутив
- Терминал по умолчанию = PowerShell: `shell(command: "Get-Process node")` идёт через PowerShell

## Примеры использования моделью

- Разовая команда (терминал по умолчанию): `shell(command: "git status", description: "посмотреть статус git")`
- Сохранение состояния между ходами (интерактивно): `terminal(action: "open")` → запишите `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Прервать запущенную программу: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Посмотреть активные сессии: `terminal(action: "list")`
- Эскалация после отказа песочницы: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Конфигурация

**Настройки веб-UI** (рекомендуется): Настройки → Общие → «Терминал по умолчанию».

`config` строки плагина (переопределяет значения по умолчанию и служит базой композиции для настроек):

| Ключ | По умолчанию | Описание |
|----|------|------|
| `defaultShell` | `powershell` | Бэкенд, если настройки не переопределили |
| `timeoutMs` | 120000 | Таймаут по умолчанию |
| `maxTimeoutMs` | 600000 | Верхний предел timeoutMs вызывающего |
| `pwshPath` | автопоиск | Фиксированный путь к pwsh.exe |
| `gitBashPath` | автопоиск | Фиксированный путь к git bash.exe |
| `msys2Path` | автопоиск (сначала `C:\msys64\usr\bin\bash.exe`, запасной вариант `msys2.exe`) | Фиксированный путь к MSYS2 bash.exe |
| `wslPath` | автопоиск | Фиксированный путь к wsl.exe |

## Публикация (npm)

У учётной записи npm включена проверка 2FA при публикации, нужен одноразовый код:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <код>   # код берётся из вашего аутентификатора
```

Перед публикацией выполните `npm pack --dry-run` для проверки содержимого и запустите `npm run build` для полной пересборки (серверная компиляция tsc + клиентский bundle + компиляция тестов).

## Удаление

Достаточно выполнить:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Команда удаляет junction, восстанавливает whitelist настроек, вычищает оставшиеся от старых версий блоки монтирования `cordis.patch.yml` и убирает `dsh-bash-terminal-ts` из `dsh.profile.bundles`. После этого перезапустите dsh web.

При ручном удалении, помимо удаления `node_modules\dsh-bash-terminal-ts`, не забудьте также убрать `dsh-bash-terminal-ts` из `dsh.profile.bundles` в `package.json` профиля.

## Интерактивный терминал (инструмент `terminal`)

Инструмент `terminal` предоставляет **постоянные интерактивные сессии** на стыке PTY (node-pty; в Windows из-за того, что process inspector вышестоящего `spawnTerminal` поддерживает только POSIX, `lib/terminal.js` подключается к node-pty напрямую; вне Windows по-прежнему используется официальный `ctx.subprocess.spawnTerminal`):

- `action: open` запускает настоящую терминальную сессию (согласно вашему терминалу по умолчанию; для wsl можно передать `distro`) и возвращает `sessionId`
- `action: send` записывает ввод и читает новый вывод; `action: read` только читает, не пишет; `action: signal` отправляет сигнал группе процессов переднего плана (SIGINT = Ctrl+C)
- `action: close` завершает сессию
- **Состояние сессии сохраняется между вызовами** (cwd / переменные / алиасы), подходит для REPL, ssh и интерактивных CLI
- `send` ждёт стабилизации вывода (300 мс тишины, предел 5 с) и возвращает **полный ответ**; при выводе свыше 1 МБ выдаётся пометка `truncated`
- Ввод завершается `\\n` (или \\r), что означает нажатие Enter

## Песочница (сопряжение с официальным механизмом)

Инструмент `shell` идёт через официальный стык песочницы DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- При каждом вызове разрешается текущая политика песочницы; сессии `danger-full-access` выполняются напрямую (без обёртки).
- Бэкенд PowerShell оборачивает argv через `ctx.sandbox.confine` — та же **fail-closed**-семантика, что у штатных исполнителей: если запрошен ограниченный режим, а доступного бэкенда нет, выбрасывается `SandboxUnavailableError`, «голый» запуск отвергается.
- Бэкенд Git Bash не оборачивается: restricted-token runner с Windows ACL у DSH несовместим с Cygwin/MSYS2 (bash падает сразу при старте с ошибкой Win32 5 от `CreateFileMapping`), поэтому Git Bash работает без sandbox-обёртки и в ограниченном режиме; результат сообщает `enforcement: gitbash-unconfined`.
- Бэкенд MSYS2 тоже не оборачивается (та же несовместимость рантайма Cygwin/MSYS2); результат сообщает `enforcement: msys2-unconfined`.
- Бэкенд WSL не оборачивается: отдельная виртуальная машина Linux у WSL сама по себе является изоляцией (результат сообщает `enforcement: wsl-isolation`).
- При отказе песочницы в ограниченном режиме результат несёт официальный маркер `[sandbox: file access denied under <mode> mode]` и подсказку об эскалации в тот же ход; модель может инициировать одну эскалацию с `sandbox_permissions` + `justification` (одобрение пользователем через `ctx.approval`) — в точности как официальные инструменты bash/pwsh.
- Примечание: когда runner Windows ACL у DSH доступен, ограниченный режим PowerShell оборачивается через него; Git Bash и MSYS2 из-за несовместимости с Cygwin/MSYS2 остаются без обёртки.

## ⚠️ Замечания по безопасности

Инструмент `shell` в ограниченном режиме: PowerShell оборачивается через `ctx.sandbox.confine` (fail-closed); Git Bash и MSYS2 из-за несовместимости Cygwin/MSYS2 с restricted-token Windows ACL **не оборачиваются** (те же права, что у процесса dsh); WSL не оборачивается благодаря отдельной Linux-VM. Это **дополнительная точка входа к нескольким терминалам**, она не подпадает под ограничения ConstrainedLanguage штатного инструмента `pwsh`. Инструменты работы с файлами DSH (read/write/edit) по-прежнему ограничены файловой песочницей. Используйте только в доверенных сессиях; для PowerShell под защитой песочницы продолжайте пользоваться штатным инструментом `pwsh`.

## Известные ограничения интерактивного терминала (ConPTY)

- **PowerShell 5.1 не может запуститься в ConPTY** (0x8009001d) — для интерактивного PowerShell установите [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (разовые команды не затронуты).
- **Интерактивный режим wsl.exe под ConPTY может вызвать RPC-ошибку службы WSL** (0x8007072c, спорадически) — разовые команды `wsl -e bash -lc ...` работают нормально; для интерактивных сессий лучше использовать сам Windows Terminal / терминал WSL либо повторить попытку.
- **node-pty в Windows не принимает именованные сигналы**: `SIGINT` у `signal` отображается на Ctrl+C (`\x03`); прочие сигналы (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) деградируют до завершения сессии.
- Интерактивные сессии Git Bash работают полностью штатно.

## Известные ограничения

- Фоновые процессы WSL после таймаута/прерывания могут недолгое время оставаться внутри дистрибутива (инстанс WSL автоматически гаснет после завершения последнего процесса).
- Git Bash — это среда msys2, она отличается от Linux-поведения WSL (отображение путей, доступность пакетов).
- Бэкенду MSYS2 нужна локально установленная MSYS2 (по умолчанию `C:\msys64`); без установки `shell` сообщает `backend unavailable`, а `msys2Path` позволяет указать произвольное расположение. Порядок кандидатов всегда таков: сначала `bash.exe`, `msys2.exe` — запасной вариант; при stdio через конвейер `msys2.exe` молча возвращает ноль байт и годится лишь как последнее средство.
- Этот плагин регистрирует инструменты только на платформе `win32`.

## Тесты

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # установить зависимости (включая typescript)
npm run build        # компиляция tsc: src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Исходный код написан на TypeScript (`strict` + `noUncheckedIndexedAccess`); артефакты сборки `lib/` и `dist/` коммитятся вместе с репозиторием, DSH загружает сразу `lib/index.js` — можно пользоваться без установки.
