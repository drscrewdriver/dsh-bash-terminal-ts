# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> Comunità: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Plugin DSH (DeepSeek Harness): un unico strumento `shell` che esegue in modo unificato i comandi dei quattro terminali **PowerShell / Git Bash / MSYS2 / WSL** su Windows.

> **Questo repository è la riscrittura in TypeScript di `MAXeaglet/dsh-bash-terminal`**, con supporto MSYS2/MINGW64 funzionante. Due linee di compatibilità:
>
> | Ramo | Segmento DSH | Nome del pacchetto | Stato |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | questo ramo; `build` / `unit` / `apply` / `client` / `terminal` tutti verdi in locale |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | linea principale della riscrittura TypeScript |
>
> Le due linee **usano deliberatamente nomi di pacchetto diversi**, quindi possono essere installate fianco a fianco senza sovrascriversi a vicenda. Scegli il ramo in base alla tua versione di DSH.

| Backend | Esecuzione effettiva | Sintassi / percorsi | Variabili d'ambiente |
|------|----------|-------------|----------|
| `powershell` (predefinito) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX; `/d/workspace`; PATH con `/usr/bin` e `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH con `/usr/bin` e `/mingw64/bin` (gcc / make) | `$NAME` (inietta automaticamente `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (tramite WSLENV) |

Ogni chiamata avvia una shell completamente nuova: **lo stato non viene conservato** (cwd / variabili / alias) — passa `workdir` invece di usare `cd`.

## Anteprima dell'interfaccia

La riga «Terminale predefinito» in Impostazioni → Generale: l'utente sceglie tra PowerShell / Git Bash / MSYS2 / WSL e lo strumento `shell` esegue solo in base a questa impostazione; il modello non può ignorarla:

![Riga dell'impostazione del terminale predefinito](assets/shells.png)

## Punti chiave della progettazione

- **Il terminale lo decide l'utente e l'IA non può cambiarlo**: nella pagina delle impostazioni della Web UI (Impostazioni → Generale) compare il menu a tendina «Terminale predefinito» (PowerShell / Git Bash / MSYS2 / WSL); lo strumento `shell` usa sempre e soltanto quell'impostazione e non espone alcun parametro di terminale al modello. L'impostazione viene persistita tramite il sistema di settings di DSH (settings.yaml).
- **Non occupa la seam della capacità `ctx.shell`**: lo strumento `pwsh` con sandbox incluso in DSH resta disponibile invariato; lo strumento `shell` di questo plugin è un punto di ingresso multi-terminale **aggiuntivo**.
- I processi vengono derivati tramite la seam condivisa `ctx.subprocess`: terminazione dell'albero dei processi (`taskkill /T` su Windows), SIGTERM → grace → SIGKILL, file di spill dell'output — lo stesso comportamento dei `dsh-tool-bash` / `dsh-tool-pwsh` ufficiali.
- I task in background vengono registrati nel registro generico `jobs`, con supporto per `run_in_background` / `job_output` / `job_kill`.
- Il «Terminale predefinito» nella pagina delle impostazioni del frontend è un enum (la UI lo renderizza automaticamente come menu a tendina); a ogni chiamata il modello esegue solo in base a quell'impostazione e non può cambiare terminale da solo.

## Installazione (profilo web)

### Installazione standard (dopo la pubblicazione su npm, meccanismo bundle ufficiale)

Il plugin include il manifest ufficiale `dsh.bundle` (il file `cordis.patch.yml` nel pacchetto): quando il profilo elenca questo pacchetto, DSH **applica automaticamente il mount**, senza dover modificare a mano la configurazione del profilo:

```powershell
# 1. Installa il pacchetto del plugin
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # viene aggiunto automaticamente ai bundles del profilo e la patch viene applicata

# 2. Applica la patch alla whitelist delle impostazioni di DSH (limitazione di DSH, vedi nota più sotto)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Riavvia dsh web
```

> Verificato in pratica con un profilo temporaneo: con `bundles: [dsh-bash-terminal-ts]` la voce `tool-bash-terminal` compare automaticamente nel dump-config.

### Nota per gli utenti pnpm: approvare lo script di build di node-pty

Questo plugin dipende dalla libreria PTY nativa [`node-pty`](https://www.npmjs.com/package/node-pty) (mantenuta da Microsoft, la stessa libreria usata da VS Code) per implementare il terminale interattivo; durante l'installazione è necessario eseguire il suo script di compilazione. npm esegue per impostazione predefinita gli script di installazione delle dipendenze, quindi non serve fare nulla; **pnpm ≥10 li blocca per impostazione predefinita** e `pnpm add` termina con:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

A questo punto il pacchetto risulta installato, ma il binding nativo non è stato compilato e lo strumento `terminal` (terminale interattivo) non riuscirà ad avviarsi. Basta approvare una volta:

```powershell
pnpm approve-builds      # seleziona node-pty in modo interattivo
# oppure dichiaralo nel package.json del profilo e poi ricompila:
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> Tra i plugin dsh proprietari, **solo questo** include una dipendenza nativa; gli altri plugin della linea 0.2.0 (search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper) e live-token-stats sono pacchetti JavaScript puri: si installano con pnpm senza alcun approve-builds.

### Installazione per lo sviluppo locale (junction diretta, le modifiche al sorgente hanno effetto immediato)

```powershell
# 1. Collega il pacchetto del plugin al node_modules del profilo (junction: le modifiche al sorgente hanno effetto immediato)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Permetti al plugin di risolvere le dipendenze @deepseek-ai/* (junction verso l'albero delle dipendenze del profilo: plugin e host condividono la stessa istanza dei moduli)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Fai in modo che il profilo monti il plugin tramite il bundle ufficiale (install.ps1 install lo fa automaticamente; equivale ad aggiungere "dsh-bash-terminal-ts" a dsh.profile.bundles)
# 4. (solo dopo aver modificato il sorgente del frontend) ricompila il client bundle:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Riavvia dsh web
```

> ⚠️ **Non eseguire `npm install` dentro questo progetto**: cancellerebbe la junction del passo 2 qui sopra e installerebbe invece per il plugin una copia **indipendente** di `@deepseek-ai/*` — plugin e host smetterebbero di condividere le istanze dei moduli e, dopo un aggiornamento dell'host, il plugin resterebbe fermo sulle vecchie API (questo progetto è rimasto su 0.1.0-rc.6 per questo motivo). Per limitarti ad aggiornare il lock file usa `npm install --package-lock-only`.

> **Compatibilità**: richiede DSH ≥ **0.1.5-rc.1**. La 0.1.5 rinomina `@deepseek-ai/dsh-client-runtime` in `@deepseek-ai/dsh-client-store` nella tabella dei moduli del browser e la risoluzione avviene solo per corrispondenza esatta del bare name; i vecchi bundle sul nuovo host segnalano `Failed to load plugins` / `require(...) missed the module table`.
>
> Inoltre: nella 0.1.5 la superficie delle impostazioni Web è passata all'enumerazione dinamica con `settings.describe()` e **non esiste più una whitelist di namespace** (`settings-not-exposed` non è più presente); la patch alla whitelist presente in `install.ps1` è solo un retaggio storico e può essere ignorata.

> Oggi non serve più modificare a mano il `cordis.patch.yml` del profilo: il pacchetto del plugin include il proprio `dsh.bundle.patch` (il `cordis.patch.yml` nel pacchetto); finché `dsh-bash-terminal-ts` compare in `dsh.profile.bundles` del profilo, DSH esegue il mount automaticamente.

Verifica dell'albero di composizione (senza bisogno di riavvii):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Utilizzo

**L'utente imposta il terminale predefinito nella Web UI**: apri le impostazioni (icona a forma di ingranaggio) → Generale → menu a tendina «Terminale predefinito» e scegli uno tra PowerShell / Git Bash / MSYS2 / WSL. La modifica ha effetto immediato e viene persistita.

Quando il modello vede lo strumento `shell`, esegue i comandi automaticamente con il terminale che hai scelto (lo strumento non espone parametri di terminale, quindi il modello non può cambiare la tua scelta):

- Con terminale predefinito = Git Bash: `shell(command: "git status")` passa per Git Bash
- Con terminale predefinito = MSYS2: `shell(command: "gcc --version")` passa per MSYS2 (ambiente MINGW64; gcc e make di `/mingw64/bin` disponibili)
- Con terminale predefinito = WSL: `shell(command: "ls -la /mnt/d/workspace")` passa per WSL; con `distro: "Ubuntu"` si indica la distribuzione
- Con terminale predefinito = PowerShell: `shell(command: "Get-Process node")` passa per PowerShell

## Esempi di utilizzo da parte del modello

- Comando una tantum (terminale predefinito): `shell(command: "git status", description: "controlla lo stato git")`
- Mantenere lo stato tra i turni (interattivo): `terminal(action: "open")` → annota il `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Interrompere un programma in esecuzione: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Vedere le sessioni attive: `terminal(action: "list")`
- Escalation dopo un rifiuto della sandbox: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Configurazione

**Impostazioni della Web UI** (consigliato): Impostazioni → Generale → «Terminale predefinito».

Il `config` della riga del plugin (sovrascrive i valori predefiniti e funge da baseline di composition per le impostazioni):

| Chiave | Predefinito | Descrizione |
|----|------|------|
| `defaultShell` | `powershell` | backend usato quando l'impostazione non effettua l'override |
| `timeoutMs` | 120000 | timeout predefinito |
| `maxTimeoutMs` | 600000 | limite superiore per il timeoutMs del chiamante |
| `pwshPath` | rilevamento automatico | percorso fisso di pwsh.exe |
| `gitBashPath` | rilevamento automatico | percorso fisso di git bash.exe |
| `msys2Path` | rilevamento automatico (con priorità a `C:\msys64\usr\bin\bash.exe`, `msys2.exe` come fallback) | percorso fisso di MSYS2 bash.exe |
| `wslPath` | rilevamento automatico | percorso fisso di wsl.exe |

## Pubblicazione (npm)

Sull'account npm è attiva la verifica di pubblicazione 2FA: è richiesto un codice monouso:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <codice>   # il codice viene dal tuo autenticatore
```

Prima di pubblicare, verifica il contenuto con `npm pack --dry-run` ed esegui `npm run build` per ricompilare (compilazione lato server con tsc + client bundle + compilazione dei test).

## Disinstallazione

Si consiglia di eseguire direttamente:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Rimuove le junction, ripristina la whitelist delle impostazioni, ripulisce i blocchi di mount `cordis.patch.yml` lasciati dalle versioni precedenti e rimuove `dsh-bash-terminal-ts` da `dsh.profile.bundles`. Dopo di che basta riavviare dsh web.

Per la disinstallazione manuale, oltre a eliminare `node_modules\dsh-bash-terminal-ts`, ricorda di rimuovere `dsh-bash-terminal-ts` da `dsh.profile.bundles` nel `package.json` del profilo.

## Terminale interattivo (strumento terminal)

Lo strumento `terminal` fornisce **sessioni interattive persistenti** sopra la seam PTY (node-pty; su Windows, poiché il process inspector dello `spawnTerminal` upstream supporta solo POSIX, `lib/terminal.js` si collega direttamente a node-pty, mentre fuori da Windows si continua a passare per il `ctx.subprocess.spawnTerminal` ufficiale):

- `action: open` avvia una vera sessione di terminale (in base al terminale predefinito impostato; con wsl è possibile passare `distro`) e restituisce `sessionId`
- `action: send` scrive l'input e legge il nuovo output; `action: read` legge senza scrivere; `action: signal` invia un segnale al gruppo di processi in primo piano (SIGINT = Ctrl+C)
- `action: close` termina la sessione
- **Lo stato della sessione si conserva tra le chiamate** (cwd / variabili / alias): ideale per REPL, ssh e CLI interattive
- `send` attende che l'output si stabilizzi (300ms di silenzio, limite 5s) e restituisce la **risposta completa**; se l'output supera 1MB viene emesso l'avviso `truncated`
- l'input termina con `\\n` (oppure \r) per indicare la pressione di Invio

## Sandbox (integrazione con il meccanismo ufficiale)

Lo strumento `shell` passa per la seam della sandbox ufficiale di DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- a ogni chiamata viene valutata la politica sandbox corrente; le sessioni `danger-full-access` vengono eseguite direttamente (senza incapsulamento).
- il backend PowerShell incapsula argv tramite `ctx.sandbox.confine` — la stessa semantica **fail-closed** degli executor ufficiali: se viene richiesta la modalità confinata ma non c'è un backend disponibile viene sollevato `SandboxUnavailableError`, rifiutando l'esecuzione senza protezione.
- il backend Git Bash non viene incapsulato: il runner Windows ACL con token con restrizioni di DSH è incompatibile con Cygwin/MSYS2 (bash termina appena avviato con `CreateFileMapping` Win32 error 5), quindi anche in modalità confinata Git Bash resta senza incapsulamento della sandbox; il risultato riporta `enforcement: gitbash-unconfined`.
- anche il backend MSYS2 non viene incapsulato (stessa incompatibilità del runtime Cygwin/MSYS2); il risultato riporta `enforcement: msys2-unconfined`.
- il backend WSL non viene incapsulato: la macchina virtuale Linux indipendente di WSL è di per sé un isolamento (il risultato riporta `enforcement: wsl-isolation`).
- quando la sandbox rifiuta in modalità confinata, il risultato porta con sé il marcatore ufficiale `[sandbox: file access denied under <mode> mode]` e un suggerimento di escalation nello stesso turno; il modello può avviare una escalation con `sandbox_permissions` + `justification` (approvata dall'utente tramite `ctx.approval`), esattamente come gli strumenti bash/pwsh ufficiali.
- nota: quando il runner Windows ACL di DSH è disponibile, la modalità confinata di PowerShell passa per il suo incapsulamento; Git Bash e MSYS2 restano senza incapsulamento per l'incompatibilità con Cygwin/MSYS2.

## ⚠️ Note sulla sicurezza

In modalità confinata lo strumento `shell` si comporta così: PowerShell viene incapsulato tramite `ctx.sandbox.confine` (fail-closed); Git Bash e MSYS2 **non vengono incapsulati** per l'incompatibilità tra Cygwin/MSYS2 e i token con restrizioni Windows ACL (permessi identici a quelli del processo dsh); WSL non viene incapsulato grazie alla VM Linux indipendente. È un punto di ingresso **multi-terminale aggiuntivo** e non beneficia delle restrizioni ConstrainedLanguage dello strumento `pwsh` ufficiale. Gli strumenti di DSH per le operazioni sui file (read/write/edit) restano soggetti alla sandbox dei file. Usalo solo in sessioni di cui ti fidi; quando ti serve un PowerShell protetto dalla sandbox, continua a usare lo strumento `pwsh` ufficiale.

## Limiti noti del terminale interattivo (ConPTY)

- **PowerShell 5.1 non riesce ad avviarsi in un ConPTY** (0x8009001d) — per il PowerShell interattivo è necessario installare [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (i comandi una tantum non sono interessati).
- **La modalità interattiva di wsl.exe può innescare un errore RPC del servizio WSL sotto ConPTY** (0x8007072c, intermittente) — il comando una tantum `wsl -e bash -lc ...` funziona regolarmente; per le sessioni interattive conviene usare direttamente Windows Terminal / il terminale WSL, oppure riprovare.
- **Su Windows node-pty non accetta segnali nominati**: `signal` mappa `SIGINT` su Ctrl+C (`\x03`); gli altri segnali (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) degradano nella terminazione della sessione.
- Le sessioni interattive di Git Bash funzionano pienamente.

## Limiti noti

- I processi in background su WSL possono rimanere attivi per breve tempo all'interno della distribuzione dopo un timeout/interruzione (l'istanza WSL si chiude automaticamente quando esce l'ultimo processo).
- Git Bash è un ambiente msys2 e presenta differenze rispetto al comportamento Linux di WSL (mapping dei percorsi, disponibilità dei pacchetti).
- Il backend MSYS2 richiede che MSYS2 sia installato sulla macchina (predefinito `C:\msys64`); se non è installato, `shell` riporta `backend unavailable` e si può usare `msys2Path` per indicare una posizione personalizzata. L'ordine di scelta dei candidati vede sempre `bash.exe` primo e `msys2.exe` come fallback — con stdio su pipe `msys2.exe` restituisce silenziosamente zero byte e va usato solo come ultima risorsa.
- Questo plugin registra gli strumenti solo sulla piattaforma `win32`.

## Test

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # installa le dipendenze (typescript incluso)
npm run build        # tsc compila src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Il sorgente è in TypeScript (`strict` + `noUncheckedIndexedAccess`); gli artefatti compilati `lib/` e `dist/` sono inclusi nel repository e DSH carica direttamente `lib/index.js`, quindi il plugin è utilizzabile senza alcuna installazione.
