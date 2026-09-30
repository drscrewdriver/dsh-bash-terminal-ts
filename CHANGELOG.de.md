# Changelog

## 0.7.0 (2026-09-29)

- **DSH-0.2.0-Kompatibilitätslinie** (Branch `compat/0.2.0`, npm-dist-tag `dsh-0.2.0`): Alle 11 peer-Bereiche `@deepseek-ai/dsh-*` wechseln im Block auf `>=0.2.0-rc.1 <0.2.1-0` (die 0.1.7-Linie bleibt auf `compat/0.1.7` eingefroren und versorgt weiter alte Hosts, unbeeinflusst). 0.2.0-rc.1 ist zur Plugin-API von 0.1.7 vollständig kompatibel; diese Linie ändert keinen Code, sie ist eine reine Metadaten-Anpassung.
- **Synchronisiertes Upgrade der devDependencies**: Die 15 exakt auf `0.1.7-rc.2` gepinnten `dsh-*`-Pakete (11 Namensträger der Peers + scope / subprocess / sandbox-policy / http-proxy) → `0.2.0-rc.1`, damit Build/Test aus einem sauberen Checkout gegenüber einem 0.2.0-Host repräsentativ bleiben.
- **Lockfile eingecheckt**: Dieser Branch entfernt die `package-lock.json`-Ignorierzeile aus dem `.gitignore`; das nach der Aktualisierung des Abhängigkeitsbaums erneuerte Lockfile wird mit dem Branch committet (die 0.1.7-Linie behält ihr Ignorierverhalten bei).
- **Veröffentlichungs-Metadaten**: Version 0.6.4 → 0.7.0; `publishConfig.tag` `dsh-0.1.7` → `dsh-0.2.0`; `version` und `engines.dsh` in `dsh.plugin.json` synchron angepasst.
- **Kompatibilitätsmatrix im README umsortiert** (zweisprachig zh/en): Zeilen für 0.1.7 und 0.2.0 ergänzt, den veralteten Text „unterschiedliche Paketnamen" korrigiert (alle Linien teilen sich nun den Paketnamen `dsh-bash-terminal-ts` und unterscheiden sich per dist-tag), Installationsabschnitt auf die Doppelbedingung 0.1.7-rc.1 / 0.2.0-rc.1 aktualisiert.
- **Verifikation**: `npm install` / `build` / `test` durchweg grün (4 Suiten unit / apply / client / terminal), `npm ls` ohne Peer-Konflikte.

## 0.6.4 (2026-09-26)

- **Ursache des Ladefehlers behoben (Überbleibsel der Paketumbenennung)**: Das Paket hieß bereits `dsh-bash-terminal-ts`, doch der bundle-entry-`name` in der `cordis.patch.yml` nannte noch den Namen vor der Abspaltung, `dsh-bash-terminal`. Der 0.1.7-Loader löst Module nach Name auf – das Scheitern war unausweichlich (`failed to import loader entry (dsh-bash-terminal)`); es ließ sich nicht einmal eine Fiber anlegen, weder Hot-Mount noch Neustart konnten es beheben. Der entry-`name` entspricht nun dem Paketnamen; unter DSH 0.1.7 läuft die Aktivierung normal.
- **Vollständige Abkopplung des Projektnamens**: `id` / `name` in `dsh.plugin.json`, die Client-Registrierungs-ID, `install.ps1` (Junction-Pfade, Bundle-Name, Hinweistexte) sowie Projekt-Pfade und -Beschreibungen in README / CONTRIBUTING / Kompatibilitätsdokumentation lauten durchweg `dsh-bash-terminal-ts`; nur `MAXeaglet/dsh-bash-terminal` (Verweis aufs Upstream-Repository) und die Tool-entry-ID `tool-bash-terminal` bleiben unverändert. Die Uninstall-Aufräum-Regex in `install.ps1` wurde zu `dsh-bash-terminal(-ts)?` erweitert, damit auch im alten Format hinterlassene Blöcke entfernt werden können.
- **Client-Robustheit**: Zeigt die Einstellungsseite einen „nicht verfügbar"-Hinweis (mit Ansatzpunkten zur Fehlersuche), wenn der Host keinen `configForms`-Eintrag für dieses Plugin liefert, statt stumm leer zu bleiben.

## 0.3.18 (unveröffentlicht)

- **Synchronisierung der DSH-0.1.5-Kompatibilitätslinie** (diese Linie pflegt `ts/0.1.5`): Die nach der Abspaltung eigenständig entstandenen Änderungen der 0.1.2-Linie wurden einzeln geprüft und auf diese Linie übertragen.
- **Standardmanifest vervollständigt**: `dsh.plugin.json` (`id` / `components` / `engines`) und `screenshots.json` ergänzt; beide in die `files`-Allowlist aufgenommen.
- **`engines` verschärft**: `node` von `>=20` auf `>=22` angehoben und `engines.dsh` = `>=0.1.5-alpha.1 <0.2.0-0` ergänzt (bisher fehlte ausgerechnet diese Linie mit der Deklaration).
- **Paketidentität korrigiert**: `author` / `repository` / `bugs` / `homepage` vom Upstream-Fork (MAXeaglet/dsh-bash-terminal) auf dieses Repository (drscrewdriver/dsh-bash-terminal-ts) umgestellt.
- **Typecheck im sauberen Checkout möglich**: devDependencies um die DSH-Peer-Pakete vervollständigt (exakt auf `0.1.5-rc.2` gepinnt). Vor der Fix meldete `tsc` `TS7006` (`revision` / `writable` implizit any in `src/client.tsx`) – die Peers waren nur in `peerDependencies` deklariert und optional, `npm install` installierte also nichts. Da `dsh-shell@0.1.5-rc.1` weiterhin den Peer `0.1.2-rc.1` deklariert, erforderte die Installation des Baums `--legacy-peer-deps`.
- **`react-dom` als devDependency ergänzt**: Bisher wurde `react` aus diesem Repository aufgelöst, während `react-dom/server` auf die verschachtelte Kopie im DSH-Installationsbaum zurückfiel; `renderToString` erhielt zwei unterschiedliche React-Instanzen und der Client-Test scheiterte mit „Objects are not valid as a React child". Nach der Ergänzung sind `react` und `react-dom` beide 18.3.1, und die Tests laufen durch.
- **Bewusst keine Umbenennung**: Diese Linie behält den Paketnamen `dsh-bash-terminal-ts` (sie folgt nicht dem `dsh-bash-terminal-ts` der 0.1.2-Linie), damit beide Linien parallel installiert werden können, ohne bei der Paketidentität zu kollidieren.
- **Verifikation (lokal erprobt)**: `npm run build` exit 0; `test-dist/{unit,apply,client}.js` jeweils exit 0; `test-dist/terminal.js` einzeln gestartet exit 0 (3/3 bestanden). Der MSYS2-Smoke von `unit` **wird real ausgeführt** und gibt `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `/usr/bin/bash` aus – die MSYS2-Umgebungssemantik, der Daseinsgrund dieser Linie, ist damit Ende-zu-Ende bestätigt.
- **Bekannter umweltbedingter Fehler (nicht durch diese Linie eingeführt)**: Das 4. Glied der verketteten `npm test`-Kette (`terminal.js`) meldet auf einer nicht-interaktiven Konsole (keine Console zum Anhängen) `AttachConsole failed`; auf der unveränderten Basislinie reproduziert es sich gleichermaßen.

## 0.3.17 (2026-09-13)

- **MSYS2 wird das 4. Terminal-Backend** (Reihenfolge in `SHELLS`: powershell / gitbash / msys2 / wsl). `Config` erhält `msys2Path`, verdrahtet über `resolveAllPaths`; `SHELL_DESCRIPTIONS.msys2` und `toolDescription` um die Backend-Beschreibung ergänzt.
- **MSYS2-Einstellung nachgereicht (Client)**: Die Zeile „Standardterminal" der Web-UI bot bisher nur powershell / gitbash / wsl – das Backend MSYS2 existierte, war im Frontend aber nicht wählbar. `src/client.tsx` ergänzt die Option `msys2` und die zweisprachigen Texte für `shell.msys2` (MSYS2 ist ein Eigenname, im Chinesischen wie im Englischen identisch).
- **MSYS2-Pipeline-stdio-Fix**: `C:\msys64\msys2.exe` ist ein Cygwin-Launcher, der eine Konsole alloziert; bei weitergeleitetem stdio kehrt er mit exit 0 und null Byte zurück (stdout/stderr je 0 Byte, mit MSYS2 bash 5.3.15 gemessen) – jeder MSYS2-Befehl blieb stumm ohne Ausgabe. Die Kandidatenreihenfolge lautet nun: bevorzugt `C:\msys64\usr\bin\bash.exe` → `bin\bash.exe` → mingw64/msys64-Einträge im PATH, `msys2.exe` als Sicherheitsnetz ans Ende zurückgestuft.
- **MSYS2-Login-Shell**: `buildArgv` verwendet `-lc` statt `-c`; nur die Login-Shell source't `/etc/profile` und nimmt `/usr/bin` und `/mingw64/bin` in den PATH auf (bei nacktem `-c` löst `bash` zu `C:\Windows\System32\bash.exe` auf, und `gcc`/`make` liefern beide command not found).
- **MSYS2-Umgebung**: `buildEnv` injiziert `MSYSTEM=MINGW64` (ein explizit vom Nutzer übergebener Wert hat Vorrang), sodass gcc und make aus `/mingw64/bin` in den PATH gelangen; die env der interaktiven Sitzungen des `terminal`-Werkzeugs ist darauf abgestimmt.
- **MSYS2-Sandbox**: Wie Git Bash ohne Ummantelung (der Windows-ACL-Restricted-Token-Runner ist inkompatibel mit Cygwin/MSYS2); das Ergebnis meldet `enforcement: msys2-unconfined`.
- **Env des interaktiven Terminals läuft über `buildEnv`**: `src/terminal.ts` baute zuvor eine eigene env zusammen und umging damit die MSYSTEM-Injektion aus `buildEnv` – Folge: das `shell`-Werkzeug funktionierte, doch das msys2-**interaktive Terminal** bekam `/mingw64/bin` nicht (`/etc/profile` konfigurierte den PATH für die MSYS-Standardumgebung). Jetzt: `buildEnv(shell, ctx.shellEnv.collect(exec), process.env.WSLENV)` – die MSYSTEM-Injektion greift und die WSLENV-Logik wird nicht doppelt gepflegt. Der dritte Parameter muss explizit übergeben werden: `spawnTerminal` ersetzt die Kindprozess-Umgebung vollständig via `childEnv(spec.env)`, das WSLENV der Umgebung bliebe sonst unsichtbar.
- **WSL `WSLENV`: Anfügen statt Neuaufbau**: WSLENV ist die grenzüberschreitende Allowlist von WSL; der alte Code baute sie allein aus `dshEnv` neu auf und verlor dadurch vorhandene Umgebungs-Einträge (lokal `WSLENV=WT_SESSION:WT_PROFILE_ID:`, exportiert vom Windows Terminal), die nicht mehr nach WSL gelangten. Nun wird auf die geerbten Werten angefügt: Aufsplitten nach `:` und Leereinträge herausfiltern (der geerbte Wert endet auf `:`, schieres String-Anfügen erzeugte Leereinträge), den Schlüssel `WSLENV` selbst ausschließen (er ist zugleich Schlüssel von `dshEnv`; Anhängen ergäbe `...:WSLENV`); der vom Aufrufer explizit gelieferte WSLENV hat Vorrang vor den geerbten Werten.
- **Interaktives Terminal**: `terminalArgv("msys2")` verwendet `-l`. `-lc` geht nicht: Dieses argv trägt keinen Befehl (das PTY ist selbst die Sitzung), und `bash -lc` ohne Operanden beendet sich sofort mit `-c: option requires an argument` (exit 2).
- **Client-Bundle reproduzierbar**: `scripts/build-client.mjs` ließ esbuild zuvor von `src/client.tsx` aufwärts nach dem tsconfig suchen; ein Build im Repository traf auf die Wurzel-`tsconfig.json` und gab eine zusätzliche Zeile `"use strict";` aus, ein Worktree-Build außerhalb des Repositorys nicht – dieselbe Quelle lieferte zwei unterschiedliche eingecheckte Artefakte. Nun ist `tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } }` explizit fixiert (exakt die tatsächlich wirksamen Werte des Wurzel-tsconfigs); der einzige beobachtbare Unterschied ist das Verschwinden jener Zeile `"use strict";`.
- **Regressionsschutz**: `test/unit.ts` asserted das `-lc`-argv von msys2, die `MSYSTEM`-Injektion mit Vorrang des Nutzerwerts, dass `bash.exe` vor `msys2.exe` stehen muss, sowie die Anfüge-Semantik von `WSLENV` (geerbte Einträge bleiben / keine Leereinträge / kein Anfügen von `WSLENV` selbst / expliziter Wert gewinnt), plus eine echte Spawn-Smoke-Assertion (stdout nicht leer und enthält `/mingw64/bin/gcc`; 0 Byte = Fehler); `test/apply.ts` asserted argv/env von msys2, `msys2-unconfined` und die WSLENV-Struktur; `test/terminal.ts` asserted das interaktive argv und die PTY-env-Verdrahtung über `buildEnv` und fährt eine **echte node-pty-msys2-Sitzung** (Assertionen `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `BASH=/usr/bin/bash`); `test/client.ts` erhält einen Drift-Wächter – je nach Host-`SHELLS` wird asserted, dass die Liste des Client-Bundles und die gerenderten Menüeinträge übereinstimmen (Reihenfolge eingeschlossen) und sowohl das chinesische als auch das englische Wörterbuch `shell.<id>` enthalten. Jeder dieser Wächter wurde gegenläufig gegenprobe: Build-Artefakt kaputt gemacht → Assertion schlug fehl → nach Wiederherstellung grün.

## 0.3.16 (2026-09-12)

- **Vollständige TypeScript-Neuschreibung**. Serverseitig `lib/index.js` / `lib/terminal.js` → `src/index.ts` / `src/terminal.ts`; Client `src/client.jsx` → `src/client.tsx`; Tests `test/*.mjs` → `test/*.ts` (kompiliert nach `test-dist/` und dort ausgeführt). `tsc --strict` + `noUncheckedIndexedAccess` durchweg grün.
- Die Verträge des Plugins gegenüber den DSH-Nähten sind in handgeschriebene Strukturtypen gebündelt (`src/dsh-types.ts`); Wert-Importe der Peer-Pakete laufen einheitlich über die Verengungs-Brücke `src/dsh.ts`, Peer-Versionsdrift sickert nicht mehr in den neugeschriebenen Code.
- Build-Kette: `npm run build` = `tsc` (Server → `lib/`) + `tsc -p tsconfig.client.json` (Client-Typecheck) + esbuild (`src/client.tsx` → `lib/client.js` + `dist/client.js`) + `tsc -p tsconfig.test.json`. Die Artefakte `lib/` und `dist/` werden weiter eingecheckt, und der Lade_pfad `lib/index.js` bei DSH bleibt unverändert.
- Die Export-Oberfläche bleibt wortgleich (`name` / `inject` / `Config` / `apply` / `SHELLS` / `DEFAULT_SHELL` / `SETTINGS_NAMESPACE` / `internals`), das Laufzeitverhalten entspricht 0.3.15; entfernt wurden nur eine unerreichbare, tote Funktion `pathResolve` am Ende von terminal.js und der ungenutzte Import `MAX_TIMER_DELAY_MS`.

## 0.3.15 (2026-09-11)

- **Anpassung an DSH 0.1.5-rc.1**. Die Client-Modultabelle (`PLATFORM_MODULES`) benennt `@deepseek-ai/dsh-client-runtime` in `@deepseek-ai/dsh-client-store` um und trifft nur bei **exaktem nacktem Namen** (kein `/client`-Unterpfad, kein Fallback auf die Paket-Factory). Das Client-Bundle tat zuvor `require("@deepseek-ai/dsh-client-runtime/client")` – unter 0.1.5 ein garantierter Fehlgriff → die Web-GUI stürzte beim Start mit `Failed to load plugins / require(...) missed the module table`. Nun wird `@deepseek-ai/dsh-client-store` verwendet, und die 4 requires des Bundles (`react`, `react/jsx-runtime`, `dsh-client-store`, `dsh-client-ui-primitives`) landen sämtlich in der Plattform-Seed-Tabelle, ganz ohne `dsh.client.external`.
- `dsh.client.inject` auf die in 0.1.5 tatsächlich existierenden Client-Paketnamen aktualisiert (`dsh-client-locale`, `dsh-client-ui-settings`, `dsh-api-remotes`).
- Die serverseitige Settings-Naht exportiert `settingsNamespace()` nicht mehr (ab 0.1.5 nimmt `register(ns: string, schema, { base })` den Namespace-String direkt entgegen); der Wrapper wurde entsprechend entfernt, der Code gilt für beide API-Generationen 0.1.0/0.1.5.
- `peerDependencies` an `^0.1.5-rc.1` angeglichen (`dsh-sandbox` ergänzt, tatsächlich benötigt; `cordis` auf `^4.0.2` angehoben); der Client-Test erhält eine Regression-Assertion: das Bundle darf `dsh-client-runtime` nicht mehr enthalten.
- Der Settings-Allowlist-Patch in `install.ps1` erhält eine Existenzsonde: 0.1.5 hat keine hartcodierte Allowlist mehr, das Skript schreibt die Host-Datei nicht mehr für ersatzlose Ersetzungen um (das hätte ihr nur einen BOM verpasst).
- Git Bash wird nicht mehr über `ctx.sandbox.confine` umhüllt: Der Windows-ACL-Restricted-Token-Runner von DSH ist inkompatibel mit Cygwin/MSYS2 (bash bricht beim Start mit `CreateFileMapping` Win32-Fehler 5 ab); nun läuft Git Bash auch im eingeschränkten Modus ohne Ummantelung, das Ergebnis meldet `enforcement: gitbash-unconfined`. Behebt #6.

## 0.3.14 (2026-08-14)

- Die Settings-Zeile spiegelt nun exakt die mitgelieferte EnterBehaviorRow wider: Zeilenlayout (Titel + tertiäre Beschreibung links, Kapsel-Selektor rechts), 36px-Kapsel-Trigger (`--dsw-alias-bg-module-platform`, Radius 18px, Hover-Zustand) mit Chevron, portal-Menü mit `align="end"`. CSS auf demselben Weg injiziert wie bei First-Party-Zeilen.
- Die Beschreibungs-Formulierung „(由你决定，AI 无法更改)" entfernt.

## 0.3.13 (2026-08-14)

- Die Settings-Zeile folgt der Grammatik der mitgelieferten Zeilen des Allgemein-Abschnitts (Spaltenstapel, 1px-Haarlinie unten via `--dsw-alias-border-l2`, 16px vertikales Padding, Titel 14px/400) – entspricht dem Layout der Appearance-Zeile.

## 0.3.12 (2026-08-14)

- **Nutzerseitig natives UI**: Die Zeile „Standardterminal" unter Einstellungen → Allgemein rendert nun mit DSH-nativen Primitives (`Menu` + `Button` + `IconCodeOutline16`) statt eines schlichten HTML-`<select>` – sie sieht aus und verhält sich exakt wie eine First-Party-Einstellung. Der Client-Test rendert die Zeile durch echtes React (renderToString) mit gemockten Primitives.

## 0.3.11 (2026-08-14)

- `terminal`-Werkzeug: WSL-interaktiv auf der Standarddistribution nutzt nun `wsl -- bash -i` (nacktes `-e` scheitert unter ConPTY mit WSL-Dienst-RPC 0x8007072c); explizites `-d <distro>` behält `-e`. Verifiziert: pwd → /mnt/d/WorkSpace.
- CI-Fixes: wsl-argv-Assertion nutzt SystemRoot (Groß-/Kleinschreibung egal); client/terminal-Tests lösen react + node-pty umgebungsübergreifend auf (die CI installiert sie no-save); der wsl-interaktive Test toleriert Umgebungen ohne Distribution.

## 0.3.10 (2026-08-14)

- install.ps1 migriert das Profil auf die offizielle Bundle-Installation (fügt `dsh-bash-terminal-ts` zu `dsh.profile.bundles` hinzu und entfernt den veralteten manuellen Eintrag) und schreibt package.json ohne UTF-8-BOM (der BOM von PS 5.1 `Set-Content` brach DSHs JSON.parse). Aktuelles Web-Profil verifiziert: das Bundle liefert den Eintrag `tool-bash-terminal` via `--dump-config`.

## 0.3.9 (2026-08-14)

- **Offizielles Bundle-Manifest**: Das Paket deklariert nun `dsh.bundle.patch` (bringt sein eigenes `cordis.patch.yml` mit); ein Profil, das `dsh-bash-terminal-ts` in `dsh.profile.bundles` aufführt, wendet den Mount automatisch an – verifiziert über ein temporäres Profil + `--dump-config` (der Eintrag erscheint ohne jeden manuellen Profil-Patch).

## 0.3.8 (2026-08-14)

- Testabdeckung: Die Hintergrund-Ausführung von `shell` registriert einen Job mit funktionierenden `cancel` / `done` / `readOutput`-Hooks (insgesamt 13 apply/execute-Fälle).

## 0.3.7 (2026-08-14)

- `terminal`-Werkzeug: Lesevorgänge warten nun, bis sich die Ausgabe stabilisiert hat (300 ms Stille, Obergrenze 5 s), statt einer festen Verzögerung, sodass `send` die VOLLSTÄNDIGE Antwort liefert (verifiziert: komplette mehrzeilige Ausgabe, z. B. `seq 1 8`).

## 0.3.6 (2026-08-14)

- Testabdeckung: `terminal`-Open mit Initialbefehl (sofortige Ausführung in einer frischen Shell) und die Form der Job-Hooks (cancel / done / readOutput) gegen eine echte node-pty-Sitzung verifiziert.

## 0.3.5 (2026-08-14)

- `terminal`-Werkzeug: Pufferüberlauf wird gemeldet (`truncated`-Flag + Hinweis „[terminal buffer overflowed; oldest output dropped]"), damit eine stark beschäftigte Sitzung nie stumm die Historie verliert.

## 0.3.4 (2026-08-14)

- `terminal`-Werkzeug: WSL-Sitzungen führen nun die DSH_*-Umgebungsvariablen via WSLENV mit, passend zum `shell`-Werkzeug.

## 0.3.3 (2026-08-14)

- `terminal`-Werkzeug: Die neue Aktion `list` enumeriert aktive Sitzungen (sessionId / shell / pid) für die Verwaltung mehrerer Sitzungen.

## 0.3.2 (2026-08-14)

- Sitzungslimit: höchstens 8 gleichzeitige Terminal-Sitzungen (beyond: schneller Fehlschlag).
- Interaktive Multi-Backend-Verifikation: Git Bash (vollumfänglich), dokumentierte ConPTY-Grenzen von PowerShell 5.1 und wsl.exe (0x8009001d / 0x8007072c; pwsh 7 und einmalige -lc-Befehle funktionieren).
- README (zh/en): bekannte Grenzen des interaktiven Terminals.

## 0.3.1 (2026-08-14)

- Terminal-Sitzungen registrieren sich im generischen Jobs-Registry (jobId beim Öffnen; `job_kill` / `job_output` wirken darauf).
- Idle-Timeout: Sitzungen schließen sich nach 10 Minuten ohne send/read/signal automatisch (konfigurierbar über `idleMs` beim Öffnen), damit verlassene PTYs nie Prozessbäume hinterlassen.

## 0.3.0 (2026-08-14)

- **Interaktives Terminal-Werkzeug (`terminal`)**: persistente PTY-Sitzungen über die offizielle `ctx.subprocess.spawnTerminal`-Naht (node-pty). Aktionen: `open` / `send` / `read` / `signal` (Ctrl+C usw.) / `close`. Der Shell-Zustand (cwd, Variablen, Aliasse) bleibt über Aufrufe hinweg erhalten; das Backend folgt der Standardterminal-Einstellung des Nutzers. Verifiziert mit einer echten interaktiven node-pty-Git-Bash-Sitzung (cd + pwd + echo + SIGINT + close).

## 0.2.3 (2026-08-14)

- Fail-closed-Testabdeckung (ein nicht verfügbares Sandbox-Backend weist den Aufruf zurück).
- Sandbox-Dokumentation im README.
- GitHub-Actions-CI (Suiten unit / apply / client auf windows-latest).

## 0.2.2 (2026-08-14)

- **Offizielles Ablehnungs-Rendering**: Ein umhüllter Aufruf, dessen stderr den Ablehnungssignaturen des Runners entspricht, meldet `sandbox.denied: true`, und die modellseitige Ausgabe trägt die exakten offiziellen Kennzeichen – `[sandbox: file access denied under <mode> mode]` samt Eskalationshinweis für dieselbe Runde.

## 0.2.1 (2026-08-14)

- **Offizielle Sandbox-Eskalationsoberfläche**: Das `shell`-Werkzeug bietet nun `sandbox_permissions` / `justification` an (exakt der tool-bash-/tool-pwsh-Vertrag): Ein abgelehnter Aufruf kann einmalig mit dem schmalsten breiteren Modus wiederholt werden, geroutet über `ctx.approval` (`approveEscalation`), mit strenger Verschärfungs-Validierung.

## 0.2.0 (2026-08-14)

- **Sandbox-Integration (offizielle Naht)**: Das `shell`-Werkzeug löst die DSH-Sandbox-Richtlinie je Aufruf auf (`ctx.sandboxPolicy`) und umhüllt PowerShell-/Git-Bash-argv über `ctx.sandbox` – dieselbe Fail-closed-Semantik `SandboxUnavailableError` wie bei den mitgelieferten Executoren. WSL läuft unumhüllt (seine Linux-VM-Isolation IST die Sandbox). Sandbox-Fakten (`sandbox.mode` / `sandbox.enforcement`) reisen mit den Vordergrund-Ergebnissen.
- **Modellpräferenz**: Der Systemprompt-Abschnitt des Plugins weist Agenten an, für Terminal-Befehle das `shell`-Werkzeug statt `pwsh` zu bevorzugen; die Werkzeugbeschreibung führt das vom Nutzer gewählte Standardterminal an.

## 0.1.0 (2026-08-14)

Erstveröffentlichung.

- `shell`-Werkzeug: Befehle unter Windows über PowerShell / Git Bash / WSL ausführen.
- Das Standardterminal wählt der Nutzer in den Web-UI-Einstellungen (Einstellungen → Allgemein → Standardterminal); das Modell kann es nicht überschreiben.
- Hintergrund-Ausführung über das generische Jobs-Registry (`run_in_background` / `job_output` / `job_kill`).
- Das Client-Plugin registriert die Settings-Zeile; das Host-Plugin liest die Nutzereinstellung bei jedem Aufruf.
- install.ps1: Junction-Installation, cordis.patch.yml-Mount und automatisches Patchen der dsh-host-apiproxy-Settings-Allowlist (DSH-Einschränkung; siehe README).
