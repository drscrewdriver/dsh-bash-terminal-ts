# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> Community: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Ein DSH-Plugin (DeepSeek Harness): ein einzelnes `shell`-Tool, das unter Windows Terminal-Befehle einheitlich über die vier Backends **PowerShell / Git Bash / MSYS2 / WSL** ausführt.

> **Dieses Repository ist ein TypeScript-Rewrite von `MAXeaglet/dsh-bash-terminal`** mit funktionierender MSYS2/MINGW64-Unterstützung. Zwei Kompatibilitätslinien:
>
> | Branch | DSH-Segment | Paketname | Status |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | dieser Branch; `build` / `unit` / `apply` / `client` / `terminal` lokal komplett grün |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | Hauptlinie des TypeScript-Rewrites |
>
> Die beiden Linien verwenden **bewusst unterschiedliche Paketnamen**, sodass sie parallel installiert werden können, ohne sich gegenseitig zu überschreiben. Wählen Sie den Branch passend zu Ihrer DSH-Version.

| Backend | Tatsächliche Ausführung | Syntax / Pfade | Umgebungsvariablen |
|------|----------|-------------|----------|
| `powershell` (Standard) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX; `/d/workspace`; PATH enthält `/usr/bin` und `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH enthält `/usr/bin` und `/mingw64/bin` (gcc / make) | `$NAME` (setzt automatisch `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (über WSLENV) |

Jeder Aufruf startet eine vollständig neue Shell: **kein Zustand wird beibehalten** (cwd / Variablen / Aliase) — übergeben Sie daher `workdir`, statt `cd` zu verwenden.

## Vorschau der Benutzeroberfläche

Die Zeile „Standard-Terminal“ unter Einstellungen → Allgemein: Der Benutzer wählt zwischen PowerShell / Git Bash / MSYS2 / WSL, und das `shell`-Tool führt ausschließlich gemäß dieser Einstellung aus — das Modell kann sie nicht überschreiben:

![Einstellungszeile für das Standard-Terminal](assets/shells.png)

## Designprinzipien

- **Das Terminal bestimmt der Benutzer, die KI kann es nicht ändern**: Auf der Web-UI-Einstellungsseite (Einstellungen → Allgemein) erscheint eine Dropdown-Liste „Standard-Terminal“ (PowerShell / Git Bash / MSYS2 / WSL); das `shell`-Tool verwendet stets nur diese Einstellung und legt dem Modell keine Terminal-Parameter offen. Die Einstellung wird über das DSH-settings-System persistiert (settings.yaml).
- **Belegt nicht die Capability-Schnittstelle `ctx.shell`**: Das von DSH mitgelieferte, sandboxed `pwsh`-Tool bleibt unverändert nutzbar; das `shell`-Tool dieses Plugins ist ein **zusätzlicher** Multi-Terminal-Einstiegspunkt.
- Prozesse werden über die gemeinsame `ctx.subprocess`-Schnittstelle (Seam) erzeugt: Beendigung des Prozessbaums (unter Windows `taskkill /T`), SIGTERM→Grace→SIGKILL sowie Ausgabe-Spill-Dateien — im Verhalten identisch mit den offiziellen Tools `dsh-tool-bash` / `dsh-tool-pwsh`.
- Hintergrundtasks werden im generischen `jobs`-Registry registriert und unterstützen `run_in_background` / `job_output` / `job_kill`.
- „Standard-Terminal“ auf der Frontend-Einstellungsseite ist ein Enum (die UI rendert es automatisch als Dropdown); das Modell führt bei jedem Aufruf ausschließlich gemäß dieser Einstellung aus und kann das Terminal nicht selbst wechseln.

## Installation (Web-Profil)

### Standardinstallation (nach der npm-Veröffentlichung, offizieller Bundle-Mechanismus)

Das Plugin bringt ein offizielles `dsh.bundle`-Manifest mit (eigene `cordis.patch.yml` im Paket); sobald das Profil dieses Paket auflistet, **wendet DSH das Mounting automatisch an** — eine manuelle Anpassung der Profil-Konfiguration ist nicht erforderlich:

```powershell
# 1. Plugin-Paket installieren
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # wird automatisch in die Bundles des Profils aufgenommen und der Patch angewendet

# 2. DSH-Einstellungs-Allowlist patchen (DSH-Einschränkung, siehe Erläuterung unten)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. dsh web neu starten
```

> Praktisch mit einem temporären Profil erprobt: `bundles: [dsh-bash-terminal-ts]` → der Eintrag `tool-bash-terminal` erscheint automatisch in der dump-config.

### Hinweis für pnpm-Nutzer: Build-Skript von node-pty freigeben

Dieses Plugin verwendet für das interaktive Terminal die native PTY-Bibliothek [`node-pty`](https://www.npmjs.com/package/node-pty) (von Microsoft gepflegt, dieselbe wie in VS Code); bei der Installation muss ihr Kompilierungsskript ausgeführt werden. npm führt die Install-Skripte von Abhängigkeiten standardmäßig aus — hier ist nichts zu tun. **pnpm ≥10 blockiert sie standardmäßig**, weshalb `pnpm add` am Ende meldet:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

Das Paket ist dann zwar installiert, aber die native Bindung wurde nicht kompiliert — das `terminal`-Tool (interaktives Terminal) startet nicht. Einmalig freigeben genügt:

```powershell
pnpm approve-builds      # node-pty interaktiv auswählen
# oder im package.json des Profils deklarieren und anschließend neu bauen:
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> Von den eigenen dsh-Plugins ist **nur dieses** mit einer nativen Abhängigkeit ausgestattet; die übrigen Plugins der 0.2.0-Linie (search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper) sowie live-token-stats sind reine JS-Pakete und lassen sich mit pnpm direkt ohne approve-builds installieren.

### Installation für die lokale Entwicklung (Junction-Direktverbindung, Quellcode-Änderungen werden sofort wirksam)

```powershell
# 1. Plugin-Paket in die node_modules des Profils linken (Junction; Quellcode-Änderungen werden sofort wirksam)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Dem Plugin das Auflösen der @deepseek-ai/*-Abhängigkeiten ermöglichen (Junction in den Abhängigkeitsbaum des Profils; Plugin und Host teilen sich dieselben Modulinstanzen)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Das Profil bindet das Plugin über das offizielle Bundle ein (install.ps1 install erledigt das automatisch; entspricht dem Eintrag von "dsh-bash-terminal-ts" in dsh.profile.bundles)
# 4. (nur nach Änderungen am Frontend-Quellcode) Client-Bundle neu bauen:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. dsh web neu starten
```

> ⚠️ **Führen Sie in diesem Projekt kein `npm install` aus**: Es löscht die Junction aus Schritt 2 oben und installiert dem Plugin stattdessen eine **eigenständige** Kopie von
> `@deepseek-ai/*` — Plugin und Host teilen sich dann keine Modulinstanzen mehr, und nach einem Host-Upgrade bleibt das Plugin auf einer alten API stehen
> (dieses Projekt blieb dadurch einmal bei 0.1.0-rc.6 hängen). Nur zum reinen Aktualisieren der Lock-Datei `npm install --package-lock-only` verwenden.

> **Kompatibilität**: Erfordert DSH ≥ **0.1.5-rc.1**. 0.1.5 hat `@deepseek-ai/dsh-client-runtime` in der Browser-Modultabelle in
> `@deepseek-ai/dsh-client-store` umbenannt und löst es nur noch unter dem exakten Bare-Namen auf; ältere Bundles melden auf einem neuen Host
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Hinweis: Die Web-Einstellungsfläche wurde in 0.1.5 auf die dynamische Enumeration über `settings.describe()` umgestellt; **eine Namespace-Allowlist gibt es nicht mehr**
> (`settings-not-exposed` existiert nicht mehr). Der Allowlist-Patch in `install.ps1` ist ein historisches Überbleibsel und kann ignoriert werden.

> Ein manuelles Anpassen der `cordis.patch.yml` des Profils ist heute nicht mehr nötig: Das Plugin-Paket bringt sein `dsh.bundle.patch` selbst mit (eigene `cordis.patch.yml` im Paket); solange `dsh-bash-terminal-ts` in `dsh.profile.bundles` des Profils steht, mountet DSH es automatisch.

So lässt sich der Kompositionsbaum verifizieren (ohne Neustart):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Verwendung

**Der Benutzer legt das Standard-Terminal in der Web-UI fest**: Einstellungen öffnen (Zahnrad) → Allgemein → Dropdown „Standard-Terminal“ und eines von PowerShell / Git Bash / MSYS2 / WSL wählen. Änderungen wirken sofort und werden persistiert.

Sobald das Modell das `shell`-Tool sieht, führt es Befehle automatisch mit dem von Ihnen gewählten Terminal aus (das Tool legt keine Terminal-Parameter offen, das Modell kann Ihre Wahl nicht ändern):

- Ist das Standard-Terminal Git Bash: `shell(command: "git status")` läuft über Git Bash
- Ist das Standard-Terminal MSYS2: `shell(command: "gcc --version")` läuft über MSYS2 (MINGW64-Umgebung; gcc und make aus `/mingw64/bin` sind verfügbar)
- Ist das Standard-Terminal WSL: `shell(command: "ls -la /mnt/d/workspace")` läuft über WSL; mit `distro: "Ubuntu"` geben Sie die Distribution an
- Ist das Standard-Terminal PowerShell: `shell(command: "Get-Process node")` läuft über PowerShell

## Verwendungsbeispiele für das Modell

- Einmaliger Befehl (Standard-Terminal): `shell(command: "git status", description: "git-Status prüfen")`
- Zustand über mehrere Runden hinweg halten (interaktiv): `terminal(action: "open")` → `sessionId` notieren → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Laufendes Programm unterbrechen: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Aktive Sitzungen anzeigen: `terminal(action: "list")`
- Nach einer Sandbox-Ablehnung eskalieren: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Konfiguration

**Web-UI-Einstellung** (empfohlen): Einstellungen → Allgemein → „Standard-Terminal“.

Die `config` der Plugin-Row (überschreibt die Vorgaben und dient als Composition-Basis der Einstellungen):

| Schlüssel | Standard | Beschreibung |
|----|------|------|
| `defaultShell` | `powershell` | Backend, sofern die Einstellung nichts anderes vorgibt |
| `timeoutMs` | 120000 | Standard-Timeout |
| `maxTimeoutMs` | 600000 | Obergrenze für das timeoutMs des Aufrufers |
| `pwshPath` | automatische Erkennung | fester Pfad zu pwsh.exe |
| `gitBashPath` | automatische Erkennung | fester Pfad zu git bash.exe |
| `msys2Path` | automatische Erkennung (`C:\msys64\usr\bin\bash.exe` zuerst, `msys2.exe` als Rückfallebene) | fester Pfad zur MSYS2 bash.exe |
| `wslPath` | automatische Erkennung | fester Pfad zu wsl.exe |

## Veröffentlichung (npm)

Für das npm-Konto ist die 2FA-Verifizierung bei der Veröffentlichung aktiviert; ein Einmalcode wird benötigt:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <Einmalcode>   # der Einmalcode stammt aus Ihrem Authenticator
```

Vor der Veröffentlichung zuerst mit `npm pack --dry-run` den Inhalt prüfen und `npm run build` ausführen (tsc-Server-Kompilierung + Client-Bundle + Test-Kompilierung).

## Deinstallation

Empfohlen, direkt auszuführen:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Das Skript entfernt die Junctions, stellt die Einstellungs-Allowlist wieder her, räumt die aus älteren Versionen stammenden `cordis.patch.yml`-Mount-Blöcke weg und entfernt `dsh-bash-terminal-ts` aus `dsh.profile.bundles`. Anschließend nur noch dsh web neu starten.

Bei einer manuellen Deinstallation darf neben dem Löschen von `node_modules\dsh-bash-terminal-ts` nicht vergessen werden, `dsh-bash-terminal-ts` aus `dsh.profile.bundles` in der `package.json` des Profils zu entfernen.

## Interaktives Terminal (Tool `terminal`)

Das `terminal`-Tool stellt auf der PTY-Schnittstelle (node-pty; unter Windows verbindet sich `lib/terminal.js` direkt mit node-pty, weil der Process Inspector des Upstream-`spawnTerminal` nur POSIX unterstützt; auf Nicht-Windows wird weiterhin der offizielle `ctx.subprocess.spawnTerminal`-Seam verwendet) **persistente interaktive Sitzungen** bereit:

- `action: open` startet eine echte Terminal-Sitzung (gemäß dem als Standard-Terminal eingestellten Backend; bei WSL kann `distro` übergeben werden) und gibt eine `sessionId` zurück
- `action: send` schreibt Eingaben und liest die neue Ausgabe; `action: read` liest nur, ohne zu schreiben; `action: signal` sendet ein Signal an die Vordergrund-Prozessgruppe (SIGINT = Ctrl+C)
- `action: close` beendet die Sitzung
- **Der Sitzungszustand bleibt über Aufrufe hinweg erhalten** (cwd / Variablen / Aliase) — geeignet für REPL, ssh und interaktive CLIs
- `send` wartet, bis sich die Ausgabe stabilisiert hat (300 ms Stille, Obergrenze 5 s), und gibt die **vollständige Antwort** zurück; bei mehr als 1 MB Ausgabe erscheint ein `truncated`-Hinweis
- Eingaben enden mit `\\n` (oder \r) für ein Return

## Sandbox (Anbindung an den offiziellen Mechanismus)

Das `shell`-Tool nutzt die offizielle DSH-Sandbox-Schnittstelle (`ctx.sandboxPolicy` + `ctx.sandbox`):

- Bei jedem Aufruf wird die aktuelle Sandbox-Richtlinie ausgewertet; `danger-full-access`-Sitzungen werden direkt ausgeführt (ohne Wrapping).
- Das PowerShell-Backend wrappt argv über `ctx.sandbox.confine` — dieselbe **Fail-closed**-Semantik wie der offizielle Executor: Wird ein eingeschränkter Modus angefordert, aber kein Backend gefunden, wird `SandboxUnavailableError` geworfen und ein ungeschützter Lauf verweigert.
- Das Git-Bash-Backend wird nicht gewrappt: Der Windows-ACL-Restricted-Token-Runner von DSH ist mit Cygwin/MSYS2 inkompatibel (bash bricht beim Start mit `CreateFileMapping` Win32 error 5 ab), daher läuft Git Bash auch im eingeschränkten Modus ohne Sandbox-Wrapping; das Ergebnis meldet `enforcement: gitbash-unconfined`.
- Das MSYS2-Backend wird ebenfalls nicht gewrappt (dieselbe Cygwin/MSYS2-Runtime-Inkompatibilität); das Ergebnis meldet `enforcement: msys2-unconfined`.
- Das WSL-Backend wird nicht gewrappt: Die isolierte Linux-VM von WSL ist selbst die Isolation (das Ergebnis meldet `enforcement: wsl-isolation`).
- Wird im eingeschränkten Modus von der Sandbox abgelehnt, trägt das Ergebnis den offiziellen Marker `[sandbox: file access denied under <mode> mode]` samt Eskalationshinweis für dieselbe Runde; das Modell kann mit `sandbox_permissions` + `justification` eine Eskalation anstoßen (Freigabe durch den Benutzer über `ctx.approval`) — exakt wie bei den offiziellen bash/pwsh-Tools.
- Hinweis: Steht der Windows-ACL-Runner von DSH zur Verfügung, wird der eingeschränkte Modus von PowerShell über ihn gewrappt; Git Bash und MSYS2 bleiben wegen der Cygwin/MSYS2-Inkompatibilität ungewrappt.

## ⚠️ Sicherheitshinweise

Das `shell`-Tool im eingeschränkten Modus: PowerShell wird über `ctx.sandbox.confine` gewrappt (fail-closed); Git Bash und MSYS2 werden wegen der Inkompatibilität von Cygwin/MSYS2 mit Windows-ACL-Restricted-Tokens **nicht gewrappt** (gleiche Berechtigungen wie der dsh-Prozess); WSL wird wegen der isolierten Linux-VM nicht gewrappt. Es ist ein **zusätzlicher Multi-Terminal-Einstiegspunkt** und genießt nicht die ConstrainedLanguage-Einschränkungen des offiziellen `pwsh`-Tools. Die Datei-Operationstools von DSH (read/write/edit) unterliegen weiterhin der Datei-Sandbox. Nur in Sitzungen verwenden, denen Sie vertrauen; benötigen Sie eine sandboxgeschützte PowerShell, verwenden Sie weiterhin das offizielle `pwsh`-Tool.

## Bekannte Einschränkungen des interaktiven Terminals (ConPTY)

- **PowerShell 5.1 lässt sich nicht in einem ConPTY starten** (0x8009001d) — für interaktives PowerShell muss [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) installiert sein (einmalige Befehle sind nicht betroffen).
- **Der interaktive Modus von wsl.exe kann unter ConPTY einen RPC-Fehler des WSL-Dienstes auslösen** (0x8007072c, sporadisch) — einmalige `wsl -e bash -lc ...`-Befehle funktionieren normal; für interaktive Sitzungen wird empfohlen, direkt Windows Terminal / ein WSL-Terminal zu verwenden oder den Versuch zu wiederholen.
- **node-pty akzeptiert unter Windows keine benannten Signale**: `SIGINT` bei `signal` wird auf Ctrl+C (`\x03`) abgebildet; andere Signale (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) werden zum Beenden der Sitzung degradiert.
- Interaktive Git-Bash-Sitzungen funktionieren vollständig.

## Bekannte Einschränkungen

- WSL-Hintergrundprozesse können nach Timeout/Abbruch noch kurz in der Distribution zurückbleiben (die WSL-Instanz wird automatisch geschlossen, sobald der letzte Prozess endet).
- Git Bash ist eine msys2-Umgebung und weicht vom Linux-Verhalten unter WSL ab (Pfad-Zuordnung, Paketverfügbarkeit).
- Das MSYS2-Backend setzt eine lokale MSYS2-Installation voraus (Standard: `C:\msys64`); ist sie nicht vorhanden, meldet `shell` `backend unavailable`, und mit `msys2Path` lässt sich ein benutzerdefinierter Speicherort angeben. Die Kandidatenreihenfolge ist stets `bash.exe` zuerst, `msys2.exe` als Rückfallebene — `msys2.exe` gibt bei piped stdio stillschweigend null Bytes zurück und ist nur als letzter Ausweg gedacht.
- Dieses Plugin registriert seine Tools nur auf der Plattform `win32`.

## Tests

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # Abhängigkeiten installieren (typescript eingeschlossen)
npm run build        # tsc kompiliert src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Der Quellcode ist TypeScript (`strict` + `noUncheckedIndexedAccess`); die Build-Artefakte `lib/` und `dist/` sind im Repository eingecheckt, DSH lädt direkt `lib/index.js` — das Plugin ist damit ohne Installation nutzbar.
