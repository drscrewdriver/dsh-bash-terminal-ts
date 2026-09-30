# dsh-bash-terminal-ts

> 🌐 [简体中文](README.md) | [English](README.en.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md) · Community: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

DSH-Plugin (DeepSeek Harness): ein `shell`-Werkzeug, das unter Windows die Befehle **vierer** Terminals – **PowerShell / Git Bash / MSYS2 / WSL** – einheitlich ausführt.

> **Dieses Repository ist die TypeScript-Neuschreibung von `MAXeaglet/dsh-bash-terminal`** mit funktionsfähiger MSYS2/MINGW64-Unterstützung. Die Kompatibilitätslinien werden pro DSH-Host-Segment geschnitten; alle Linien teilen sich den Paketnamen `dsh-bash-terminal-ts` und werden über npm-dist-tags unterschieden:
>
> | DSH-Segment | Branch | Plugin-Version | npm-dist-tag |
> |--------|------|----------|--------------|
> | `>=0.2.0-rc.1 <0.2.1-0` | `compat/0.2.0` (dieser Branch) | 0.7.x | `dsh-0.2.0` |
> | 0.1.7-rc.1 – 0.1.7.x | `compat/0.1.7` | 0.6.x | `dsh-0.1.7` |
> | 0.1.5-alpha.1 – 0.1.5-rc.x | `ts/0.1.5` (historisch, eingefroren) | ≤ 0.5.2 | `dsh-0.1.5` |
> | 0.1.2-alpha.1 – 0.1.2-rc.x | `main` (historisch, eingefroren) | ≤ 0.4.2 | `dsh-0.1.2` |
>
> Wählen Sie die Linie passend zu Ihrer DSH-Version; die Versionsserien überlappen nicht, daher kann eine `^`-Installation nie über Linien hinweg auflösen.

| Backend | Tatsächliche Ausführung | Syntax / Pfade | Umgebungsvariablen |
|------|----------|-------------|----------|
| `powershell` (Standard) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | `bash -lc <cmd>` aus Git for Windows | POSIX; `/d/workspace`; PATH enthält `/usr/bin` und `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH enthält `/usr/bin` und `/mingw64/bin` (gcc / make) | `$NAME` (`MSYSTEM=MINGW64` wird automatisch injiziert) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (über WSLENV) |

Jeder Aufruf startet eine komplett neue Shell: **Es wird kein Zustand bewahrt** (cwd / Variablen / Aliasse) – übergeben Sie `workdir`, statt `cd` zu verwenden.

## Vorschau der Oberfläche

Die Zeile „Standardterminal" in Einstellungen → Allgemein: Der Nutzer wählt zwischen PowerShell / Git Bash / MSYS2 / WSL, und das `shell`-Werkzeug führt ausschließlich gemäß dieser Einstellung aus – das Modell kann sie nicht überschreiben:

![Zeile für die Standardterminal-Einstellung](assets/shells.png)

## Entwurfsprinzipien

- **Das Terminal bestimmt der Nutzer, die KI kann es nicht ändern**: Die Einstellungsseite der Web-UI (Einstellungen → Allgemein) bietet ein Dropdown „Standardterminal" (PowerShell / Git Bash / MSYS2 / WSL); das `shell`-Werkzeug folgt stets ausschließlich dieser Einstellung und legt dem Modell keine Terminal-Parameter offen. Die Einstellung wird über das DSH-Settings-System persistiert (settings.yaml).
- **Belegt die Fähigkeitsschnittstelle `ctx.shell` nicht**: Das sandboxierte `pwsh`-Werkzeug von DSH bleibt unverändert nutzbar; das `shell`-Werkzeug dieses Plugins ist ein **zusätzlicher** Multi-Terminal-Einstiegspunkt.
- Prozesse werden über die gemeinsame `ctx.subprocess`-Naht erzeugt: Beendigung des Prozessbaums (unter Windows `taskkill /T`), SIGTERM → Gnistenfrist → SIGKILL, Ausgabe-Spill-Dateien – Verhalten identisch zu den offiziellen Werkzeugen `dsh-tool-bash` / `dsh-tool-pwsh`.
- Hintergrundaufgaben werden im generischen `jobs`-Registry registriert, mit Unterstützung für `run_in_background` / `job_output` / `job_kill`.
- Die Zeile „Standardterminal" der Frontend-Einstellungsseite ist eine Enumeration (von der UI automatisch als Dropdown gerendert); das Modell führt bei jedem Aufruf gemäß dieser Einstellung aus und kann das Terminal nicht eigenmächtig wechseln.

## Installation (Web-Profil)

### Standardinstallation (nach der npm-Veröffentlichung, offizieller Bundle-Mechanismus)

Das Plugin bringt das offizielle `dsh.bundle`-Manifest mit (eigene `cordis.patch.yml` im Paket); sobald ein Profil dieses Paket aufführt, **wendet DSH den Mount automatisch an** – eine manuelle Anpassung der Profil-Konfiguration ist nicht nötig:

```powershell
# 1. Plugin-Paket installieren
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # automatisch in die Profile-Bundles aufnehmen und Patch anwenden

# 2. Settings-Allowlist von DSH patchen (DSH-Einschränkung, siehe Erläuterung unten)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. dsh web neu starten
```

> Mit einem temporären Profil praktisch erprobt: `bundles: [dsh-bash-terminal-ts]` → der Eintrag `tool-bash-terminal` erscheint automatisch im dump-config.

### Installation für die lokale Entwicklung (Junction, Quellcode-Änderungen wirken sofort)

```powershell
# 1. Plugin-Paket in die node_modules des Profils linken (Junction, Quellcode-Änderungen wirken sofort)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Dem Plugin die Auflösung der @deepseek-ai/*-Abhängigkeiten ermöglichen (Junction in den Abhängigkeitsbaum des Profils; Plugin und Host teilen sich dieselben Modulinstanzen)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Das Profil das Plugin über das offizielle Bundle mounten lassen (install.ps1 install erledigt das automatisch; entspricht dem Eintrag "dsh-bash-terminal-ts" in dsh.profile.bundles)
# 4. (nur nach Änderungen am Frontend-Quellcode) Client-Bundle neu bauen:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. dsh web neu starten
```

> ⚠️ **Führen Sie in diesem Projekt kein `npm install` aus**: Es würde die Junction aus Schritt 2 oben löschen und stattdessen eine **eigenständige** Kopie von
> `@deepseek-ai/*` für das Plugin installieren – Plugin und Host teilten sich dann keine Modulinstanzen mehr, und nach einem Host-Upgrade bliebe das Plugin auf der alten API hängen
> (dieses Projekt hing dadurch einmal auf 0.1.0-rc.6 fest). Nur zum Aktualisieren des Locks `npm install --package-lock-only` verwenden.

> **Kompatibilität**: Erfordert DSH ≥ **0.1.7-rc.1** (Linie `compat/0.1.7`) oder ≥ **0.2.0-rc.1** (Linie `compat/0.2.0`, dieser Branch).
> Historischer Hintergrund: In 0.1.5 wurde `@deepseek-ai/dsh-client-runtime` in der Client-Modultabelle in `@deepseek-ai/dsh-client-store` umbenannt und wird nur über exakte Treffer des nackten Namens aufgelöst; alte Bundles schlagen auf dem neuen Host fehl mit
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Hinweis: Seit 0.1.5 nutzt die Web-Settings-Oberfläche die dynamische Enumeration `settings.describe()` und hat **keine Namespace-Allowlist mehr**
> (`settings-not-exposed` existiert nicht mehr); der Allowlist-Patch in `install.ps1` ist nur noch ein historisches Überbleibsel und kann ignoriert werden.

> Eine manuelle Anpassung der `cordis.patch.yml` des Profils ist nicht mehr erforderlich: Das Plugin-Paket bringt sein eigenes `dsh.bundle.patch` mit (`cordis.patch.yml` im Paket); sobald `dsh-bash-terminal-ts` im `dsh.profile.bundles` des Profils steht, mountet DSH das Plugin automatisch.

Kombinierten Baum verifizieren (ohne Neustart):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Verwendung

**Der Nutzer wählt das Standardterminal in der Web-UI**: Einstellungen (Zahnrad) öffnen → Allgemein → Dropdown „Standardterminal" und eines der Terminals PowerShell / Git Bash / MSYS2 / WSL wählen. Änderungen wirken sofort und werden persistiert.

Sobald das Modell das `shell`-Werkzeug sieht, verwendet es automatisch das von Ihnen gewählte Terminal (das Werkzeug legt keinen Terminal-Parameter offen; das Modell kann Ihre Wahl nicht ändern):

- Standardterminal = Git Bash: `shell(command: "git status")` läuft über Git Bash
- Standardterminal = MSYS2: `shell(command: "gcc --version")` läuft über MSYS2 (MINGW64-Umgebung, gcc und make aus `/mingw64/bin` verfügbar)
- Standardterminal = WSL: `shell(command: "ls -la /mnt/d/workspace")` läuft über WSL; mit `distro: "Ubuntu"` lässt sich die Distribution angeben
- Standardterminal = PowerShell: `shell(command: "Get-Process node")` läuft über PowerShell

## Beispiele zur Modellnutzung

- Einmalbefehl (Standardterminal): `shell(command: "git status", description: "Git-Status prüfen")`
- Zustand über Runden hinweg bewahren (interaktiv): `terminal(action: "open")` → `sessionId` notieren → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Laufendes Programm unterbrechen: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Aktive Sitzungen einsehen: `terminal(action: "list")`
- Eskalation nach Sandbox-Ablehnung: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Konfiguration

**Web-UI-Einstellungen** (empfohlen): Einstellungen → Allgemein → „Standardterminal".

`config` der Plugin-Zeile (überschreibt die Standardwerte und dient als Kompositionsgrundlage der Einstellungen):

| Schlüssel | Standard | Beschreibung |
|----|------|------|
| `defaultShell` | `powershell` | Backend, sofern die Einstellungen nichts anderes festlegen |
| `timeoutMs` | 120000 | Standard-Timeout |
| `maxTimeoutMs` | 600000 | Obergrenze für das timeoutMs des Aufrufers |
| `pwshPath` | automatische Erkennung | Fester Pfad zu pwsh.exe |
| `gitBashPath` | automatische Erkennung | Fester Pfad zu git bash.exe |
| `msys2Path` | automatische Erkennung (`C:\msys64\usr\bin\bash.exe` bevorzugt, Fallback `msys2.exe`) | Fester Pfad zu MSYS2 bash.exe |
| `wslPath` | automatische Erkennung | Fester Pfad zu wsl.exe |

## Veröffentlichung (npm)

Das npm-Konto hat die 2FA-Verifizierung für Veröffentlichungen aktiviert; ein Einmalcode ist erforderlich:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <Code>   # der Code stammt von Ihrem Authentifikator
```

Vor der Veröffentlichung mit `npm pack --dry-run` den Inhalt prüfen und `npm run build` ausführen, um alles neu zu bauen (tsc-Serverkompilierung + Client-Bundle + Testkompilierung).

## Deinstallation

Einfach ausführen:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Der Befehl entfernt die Junctions, stellt die Settings-Allowlist wieder her, räumt die veralteten `cordis.patch.yml`-Mount-Blöcke früherer Versionen auf und entfernt `dsh-bash-terminal-ts` aus dem `dsh.profile.bundles`. Anschließend dsh web neu starten.

Bei manueller Deinstallation ist – neben dem Entfernen von `node_modules\dsh-bash-terminal-ts` – auch daran zu denken, `dsh-bash-terminal-ts` aus dem `dsh.profile.bundles` der Profil-`package.json` zu entfernen.

## Interaktives Terminal (Werkzeug `terminal`)

Das Werkzeug `terminal` stellt **persistente interaktive Sitzungen** über die PTY-Naht bereit (node-pty; unter Windows direkt über node-pty, weil der Process Inspector des upstream `spawnTerminal` nur POSIX unterstützt – `lib/terminal.js` verbindet sich daher direkt mit node-pty; unter Nicht-Windows wird weiterhin das offizielle `ctx.subprocess.spawnTerminal` verwendet):

- `action: open` startet eine echte Terminal-Sitzung (gemäß Ihrer Standardterminal-Einstellung; bei wsl kann `distro` angegeben werden) und liefert eine `sessionId`
- `action: send` schreibt die Eingabe und liest die neue Ausgabe; `action: read` liest nur, ohne zu schreiben; `action: signal` sendet ein Signal an die Vordergrund-Prozessgruppe (SIGINT = Ctrl+C)
- `action: close` beendet die Sitzung
- **Der Sitzungszustand bleibt über Aufrufe hinweg erhalten** (cwd / Variablen / Aliasse), geeignet für REPL, ssh und interaktive CLIs
- `send` wartet, bis sich die Ausgabe stabilisiert hat (300 ms Stille, Obergrenze 5 s), und liefert die **vollständige Antwort**; bei mehr als 1 MB Ausgabe folgt der Hinweis `truncated`
- Die Eingabe endet mit `\\n` (oder \\r), um die Eingabetaste zu signalisieren

## Sandbox (Anbindung an den offiziellen Mechanismus)

Das `shell`-Werkzeug nutzt die offizielle Sandbox-Naht von DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- Bei jedem Aufruf wird die aktuelle Sandbox-Richtlinie aufgelöst; `danger-full-access`-Sitzungen werden direkt ausgeführt (ohne Ummantelung).
- Das PowerShell-Backend umhüllt argv über `ctx.sandbox.confine` – dieselbe **Fail-closed**-Semantik wie bei den offiziellen Executoren: Wird der eingeschränkte Modus angefordert, aber kein Backend gefunden, fliegt eine `SandboxUnavailableError`; ein ungeschützter Lauf wird verweigert.
- Das Git-Bash-Backend wird nicht umhüllt: Der Windows-ACL-Restricted-Token-Runner von DSH ist inkompatibel mit Cygwin/MSYS2 (bash bricht beim Start mit `CreateFileMapping` Win32-Fehler 5 ab); daher läuft Git Bash auch im eingeschränkten Modus ohne Sandbox-Ummantelung; das Ergebnis meldet `enforcement: gitbash-unconfined`.
- Das MSYS2-Backend wird ebenfalls nicht umhüllt (dieselbe Cygwin/MSYS2-Laufzeitinkompatibilität); das Ergebnis meldet `enforcement: msys2-unconfined`.
- Das WSL-Backend wird nicht umhüllt: Die eigenständige Linux-VM von WSL ist selbst die Isolation (das Ergebnis meldet `enforcement: wsl-isolation`).
- Wird ein Aufruf im eingeschränkten Modus von der Sandbox abgelehnt, trägt das Ergebnis das offizielle Kennzeichen `[sandbox: file access denied under <mode> mode]` samt Eskalationshinweis für dieselbe Runde; das Modell kann mit `sandbox_permissions` + `justification` eine Eskalation anstoßen (Nutzerfreigabe über `ctx.approval`) – exakt wie bei den offiziellen bash/pwsh-Werkzeugen.
- Hinweis: Wenn der Windows-ACL-Runner von DSH verfügbar ist, wird der eingeschränkte Modus von PowerShell über ihn umhüllt; Git Bash und MSYS2 bleiben wegen der Cygwin/MSYS2-Inkompatibilität unumhüllt.

## ⚠️ Sicherheitshinweis

Das `shell`-Werkzeug im eingeschränkten Modus: PowerShell wird über `ctx.sandbox.confine` umhüllt (fail-closed); Git Bash und MSYS2 bleiben wegen der Inkompatibilität von Cygwin/MSYS2 mit dem Windows-ACL-Restricted-Token **unumhüllt** (gleiche Berechtigungen wie der dsh-Prozess); WSL bleibt dank seiner eigenständigen Linux-VM unumhüllt. Es ist ein **zusätzlicher Multi-Terminal-Einstiegspunkt** und genießt nicht die ConstrainedLanguage-Einschränkungen des offiziellen `pwsh`-Werkzeugs. Die Datei-Werkzeuge von DSH (read/write/edit) unterliegen weiterhin der Datei-Sandbox. Nur in Sitzungen verwenden, denen Sie vertrauen; für sandboxgeschütztes PowerShell weiterhin das offizielle `pwsh`-Werkzeug nutzen.

## Bekannte Einschränkungen des interaktiven Terminals (ConPTY)

- **PowerShell 5.1 kann in einem ConPTY nicht starten** (0x8009001d) – für interaktives PowerShell [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) installieren (Einmalbefehle sind nicht betroffen).
- **Der interaktive Modus von wsl.exe kann unter ConPTY einen RPC-Fehler des WSL-Dienstes auslösen** (0x8007072c, sporadisch) – Einmalbefehle `wsl -e bash -lc ...` funktionieren normal; für interaktive Sitzungen besser Windows Terminal / ein WSL-Terminal verwenden oder es erneut versuchen.
- **node-pty akzeptiert unter Windows keine benannten Signale**: `SIGINT` von `signal` wird auf Ctrl+C (`\x03`) abgebildet; andere Signale (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) degradieren zur Beendigung der Sitzung.
- Interaktive Git-Bash-Sitzungen funktionieren vollumfänglich.

## Bekannte Einschränkungen

- WSL-Hintergrundprozesse können nach Timeout/Abbruch noch kurz in der Distribution weiterlaufen (die WSL-Instanz schaltet sich nach dem Ende des letzten Prozesses automatisch ab).
- Git Bash ist eine msys2-Umgebung und weicht vom Linux-Verhalten von WSL ab (Pfad-Mapping, Paketverfügbarkeit).
- Das MSYS2-Backend erfordert eine lokal installierte MSYS2 (Standard `C:\msys64`); ohne Installation meldet `shell` den Fehler `backend unavailable`, mit `msys2Path` lässt sich ein benutzerdefinierter Ort angeben. Die Kandidatenreihenfolge bleibt immer: `bash.exe` zuerst, `msys2.exe` als Fallback – bei weitergeleitetem stdio liefert `msys2.exe` stumm null Byte und dient nur als letzte Rettung.
- Dieses Plugin registriert seine Werkzeuge nur auf der Plattform `win32`.

## Tests

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # Abhängigkeiten installieren (typescript inklusive)
npm run build        # tsc-Kompilierung src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Der Quellcode ist TypeScript (`strict` + `noUncheckedIndexedAccess`); die Build-Artefakte `lib/` und `dist/` werden mit dem Repository eingecheckt, DSH lädt direkt `lib/index.js` – ohne Installation einsatzbereit.
