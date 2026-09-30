# dsh-bash-terminal-ts

> 🌐 [简体中文](README.md) | [English](README.en.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md) · Community: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Plugin DSH (DeepSeek Harness): uno strumento `shell` che esegue in modo unificato su Windows i comandi di **quattro** terminali — **PowerShell / Git Bash / MSYS2 / WSL**.

> **Questo repository è la riscrittura TypeScript di `MAXeaglet/dsh-bash-terminal`**, con supporto MSYS2/MINGW64 funzionante. Le linee di compatibilità sono ricavate per segmento di versione dell'host DSH; tutte le linee condividono il nome di pacchetto `dsh-bash-terminal-ts` e si distinguono tramite dist-tag npm:
>
> | Segmento DSH | Branch | Versione plugin | dist-tag npm |
> |--------|------|----------|--------------|
> | `>=0.2.0-rc.1 <0.2.1-0` | `compat/0.2.0` (questo branch) | 0.7.x | `dsh-0.2.0` |
> | 0.1.7-rc.1 – 0.1.7.x | `compat/0.1.7` | 0.6.x | `dsh-0.1.7` |
> | 0.1.5-alpha.1 – 0.1.5-rc.x | `ts/0.1.5` (storico, congelata) | ≤ 0.5.2 | `dsh-0.1.5` |
> | 0.1.2-alpha.1 – 0.1.2-rc.x | `main` (storico, congelata) | ≤ 0.4.2 | `dsh-0.1.2` |
>
> Scegli la linea corrispondente alla tua versione di DSH; le serie di versioni non si sovrappongono mai, quindi un'installazione con `^` non può risolvere da una linea all'altra.

| Backend | Esecuzione effettiva | Sintassi / percorsi | Variabili d'ambiente |
|------|----------|-------------|----------|
| `powershell` (predefinito) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | `bash -lc <cmd>` di Git for Windows | POSIX; `/d/workspace`; PATH con `/usr/bin` e `/mingw64/bin` | `$NAME` |
| `msys2` | `bash -lc <cmd>` di MSYS2 (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH con `/usr/bin` e `/mingw64/bin` (gcc / make) | `$NAME` (injection automatica di `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (tramite WSLENV) |

Ogni chiamata avvia una shell completamente nuova: **nessuno stato viene conservato** (cwd / variabili / alias) — passa `workdir` invece di usare `cd`.

## Anteprima dell'interfaccia

La riga «Terminale predefinito» in Impostazioni → Generali: l'utente sceglie tra PowerShell / Git Bash / MSYS2 / WSL e lo strumento `shell` esegue solo in base a questa impostazione, senza che il modello possa aggirarla:

![Riga dell'impostazione del terminale predefinito](assets/shells.png)

## Punti di progettazione

- **Il terminale lo decide l'utente, l'IA non può cambiarlo**: la pagina delle impostazioni della UI Web (Impostazioni → Generali) mostra un menu a discesa «Terminale predefinito» (PowerShell / Git Bash / MSYS2 / WSL); lo strumento `shell` usa sempre e solo quell'impostazione e non espone alcun parametro di terminale al modello. L'impostazione viene persistita tramite il sistema di settings di DSH (settings.yaml).
- **Non occupa la giunzione di capacità `ctx.shell`**: lo strumento `pwsh` sandboxato fornito con DSH resta utilizzabile così com'è; lo strumento `shell` di questo plugin è un **ulteriore** punto d'ingresso multi-terminale.
- I processi vengono avviati tramite la seam condivisa `ctx.subprocess`: terminazione dell'albero di processi (su Windows `taskkill /T`), SIGTERM → grazia → SIGKILL, file di spill dell'output — comportamento identico a quello degli strumenti ufficiali `dsh-tool-bash` / `dsh-tool-pwsh`.
- I lavori in background vengono registrati nel registro generico `jobs`, con supporto per `run_in_background` / `job_output` / `job_kill`.
- La riga «Terminale predefinito» della pagina delle impostazioni del frontend è un enumerazione (renderizzata automaticamente come menu a discesa dalla UI); a ogni chiamata il modello esegue solo in base a quell'impostazione e non può cambiare terminale per conto proprio.

## Installazione (profilo web)

### Installazione standard (dopo la pubblicazione npm, meccanismo ufficiale di bundle)

Il plugin include il manifest ufficiale `dsh.bundle` (`cordis.patch.yml` nel pacchetto); appena un profilo elenca questo pacchetto, DSH **applica automaticamente il mount**, senza dover modificare a mano la configurazione del profilo:

```powershell
# 1. Installare il pacchetto del plugin
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # aggiunto automaticamente ai bundle del profilo e patch applicata

# 2. Patch della allowlist delle impostazioni DSH (limitazione DSH, vedi spiegazione sotto)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. Riavviare dsh web
```

> Verificato nella pratica con un profilo temporaneo: `bundles: [dsh-bash-terminal-ts]` → la voce `tool-bash-terminal` compare automaticamente nel dump-config.

### Installazione per lo sviluppo locale (junction, le modifiche al sorgente hanno effetto immediato)

```powershell
# 1. Collegare il pacchetto del plugin ai node_modules del profilo (junction, le modifiche al sorgente hanno effetto immediato)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. Consentire al plugin di risolvere le dipendenze @deepseek-ai/* (junction verso l'albero delle dipendenze del profilo; plugin e host condividono le stesse istanze dei moduli)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. Far montare il plugin al profilo tramite il bundle ufficiale (install.ps1 install lo fa automaticamente; equivale ad aggiungere "dsh-bash-terminal-ts" a dsh.profile.bundles)
# 4. (solo dopo modifiche al codice del frontend) ricompilare il bundle client:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. Riavviare dsh web
```

> ⚠️ **Non eseguire `npm install` in questo progetto**: cancellerebbe la junction del punto 2 qui sopra e installerebbe per il plugin una copia **indipendente** di
> `@deepseek-ai/*` — plugin e host smetterebbero così di condividere le istanze dei moduli e, dopo un aggiornamento dell'host, il plugin resterebbe bloccato sulla vecchia API
> (questo progetto rimase così bloccato su 0.1.0-rc.6). Per aggiornare solo il lock usare `npm install --package-lock-only`.

> **Compatibilità**: richiede DSH ≥ **0.1.7-rc.1** (linea `compat/0.1.7`) oppure ≥ **0.2.0-rc.1** (linea `compat/0.2.0`, questo branch).
> Contesto storico: in 0.1.5 `@deepseek-ai/dsh-client-runtime` nella tabella dei moduli client è stato rinominato `@deepseek-ai/dsh-client-store` e viene risolto solo con corrispondenza esatta del nome nudo; i bundle vecchi sull'host nuovo falliscono con
> `Failed to load plugins` / `require(...) missed the module table`.
>
> Inoltre: dal 0.1.5 la superficie delle impostazioni Web usa l'enumerazione dinamica `settings.describe()` e **non ha più una allowlist di namespace**
> (`settings-not-exposed` non esiste più); la patch della allowlist presente in `install.ps1` è solo un relitto storico e può essere ignorata.

> Non serve più modificare manualmente il `cordis.patch.yml` del profilo: il pacchetto del plugin include il suo `dsh.bundle.patch` (`cordis.patch.yml` nel pacchetto); basta che `dsh-bash-terminal-ts` figurì nel `dsh.profile.bundles` del profilo perché DSH monti automaticamente il plugin.

Verificare l'albero combinato (senza riavvio):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Uso

**L'utente imposta il terminale predefinito nella UI Web**: apri le impostazioni (ingranaggio) → Generali → menu a discesa «Terminale predefinito» e scegli uno tra PowerShell / Git Bash / MSYS2 / WSL. La modifica ha effetto immediato e viene persistita.

Quando il modello vede lo strumento `shell`, esegue automaticamente con il terminale che hai scelto (lo strumento non espone parametri di terminale; il modello non può cambiare la tua scelta):

- Terminale predefinito = Git Bash: `shell(command: "git status")` passa per Git Bash
- Terminale predefinito = MSYS2: `shell(command: "gcc --version")` passa per MSYS2 (ambiente MINGW64, gcc e make di `/mingw64/bin` disponibili)
- Terminale predefinito = WSL: `shell(command: "ls -la /mnt/d/workspace")` passa per WSL; con `distro: "Ubuntu"` si può indicare la distribuzione
- Terminale predefinito = PowerShell: `shell(command: "Get-Process node")` passa per PowerShell

## Esempi di utilizzo per il modello

- Comando una tantum (terminale predefinito): `shell(command: "git status", description: "controllare lo stato git")`
- Stato preservato tra i turni (interattivo): `terminal(action: "open")` → annotare il `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Interrompere un programma in esecuzione: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Consultare le sessioni attive: `terminal(action: "list")`
- Escalation dopo un rifiuto della sandbox: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Configurazione

**Impostazioni della UI Web** (consigliato): Impostazioni → Generali → «Terminale predefinito».

Il `config` della riga del plugin (sovrascrive i predefiniti e funge da base di composizione per le impostazioni):

| Chiave | Predefinito | Descrizione |
|----|------|------|
| `defaultShell` | `powershell` | Backend usato quando le impostazioni non sovrascrivono |
| `timeoutMs` | 120000 | Timeout predefinito |
| `maxTimeoutMs` | 600000 | Limite superiore del timeoutMs del chiamante |
| `pwshPath` | rilevamento automatico | Percorso fisso di pwsh.exe |
| `gitBashPath` | rilevamento automatico | Percorso fisso di git bash.exe |
| `msys2Path` | rilevamento automatico (prima `C:\msys64\usr\bin\bash.exe`, ripiego su `msys2.exe`) | Percorso fisso di MSYS2 bash.exe |
| `wslPath` | rilevamento automatico | Percorso fisso di wsl.exe |

## Pubblicazione (npm)

L'account npm ha la verifica 2FA attiva per la pubblicazione; serve un codice monouso:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <codice>   # il codice arriva dal tuo autenticatore
```

Prima di pubblicare, fai un `npm pack --dry-run` per controllare il contenuto e lancia `npm run build` per ricompilare tutto (compilazione server tsc + bundle client + compilazione dei test).

## Disinstallazione

Basta eseguire:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Il comando rimuove le junction, ripristina la allowlist delle impostazioni, ripulisce i blocchi di mount `cordis.patch.yml` lasciati dalle versioni precedenti e rimuove `dsh-bash-terminal-ts` dal `dsh.profile.bundles`. Poi riavvia dsh web.

In caso di disinstallazione manuale, oltre a eliminare `node_modules\dsh-bash-terminal-ts`, ricorda anche di rimuovere `dsh-bash-terminal-ts` dal `dsh.profile.bundles` del `package.json` del profilo.

## Terminale interattivo (strumento `terminal`)

Lo strumento `terminal` offre **sessioni interattive persistenti** sulla seam PTY (node-pty; su Windows `lib/terminal.js` si collega direttamente a node-pty perché il process inspector del `spawnTerminal` upstream supporta solo POSIX; fuori da Windows si continua a usare il `ctx.subprocess.spawnTerminal` ufficiale):

- `action: open` avvia una vera sessione di terminale (secondo il tuo terminale predefinito impostato; per wsl si può indicare `distro`) e restituisce un `sessionId`
- `action: send` scrive l'input e legge il nuovo output; `action: read` legge senza scrivere; `action: signal` invia un segnale al gruppo di processi in primo piano (SIGINT = Ctrl+C)
- `action: close` termina la sessione
- **Lo stato della sessione si preserva tra le chiamate** (cwd / variabili / alias), ideale per REPL, ssh e CLI interattive
- `send` attende che l'output si stabilizzi (300 ms di silenzio, tetto 5 s) e restituisce la **risposta completa**; oltre 1 MB di output viene emesso l'avviso `truncated`
- L'input termina con `\\n` (o \\r) per rappresentare il tasto Invio

## Sandbox (integrazione con il meccanismo ufficiale)

Lo strumento `shell` passa per la seam ufficiale della sandbox di DSH (`ctx.sandboxPolicy` + `ctx.sandbox`):

- A ogni chiamata viene risolta la politica sandbox corrente; le sessioni `danger-full-access` vengono eseguite direttamente (senza incapsulamento).
- Il backend PowerShell incapsula argv tramite `ctx.sandbox.confine` — semantica **fail-closed** identica a quella degli executor ufficiali: se viene richiesto il modo ristretto ma non c'è un backend disponibile, viene sollevata una `SandboxUnavailableError`, rifiutando l'esecuzione nuda.
- Il backend Git Bash non viene incapsulato: il runner a token ristretto ACL Windows di DSH è incompatibile con Cygwin/MSYS2 (bash abortisce all'avvio con l'errore Win32 5 di `CreateFileMapping`); quindi Git Bash gira anche in modo ristretto senza incapsulamento sandbox; il risultato riporta `enforcement: gitbash-unconfined`.
- Il backend MSYS2 non viene incapsulato nemmeno lui (stessa incompatibilità di runtime Cygwin/MSYS2); il risultato riporta `enforcement: msys2-unconfined`.
- Il backend WSL non viene incapsulato: la VM Linux indipendente di WSL è di per sé l'isolamento (il risultato riporta `enforcement: wsl-isolation`).
- Quando la sandbox rifiuta in modo ristretto, il risultato porta il marker ufficiale `[sandbox: file access denied under <mode> mode]` e il suggerimento di escalation nello stesso turno; il modello può avviare un'escalation con `sandbox_permissions` + `justification` (approvazione dell'utente tramite `ctx.approval`), esattamente come gli strumenti ufficiali bash/pwsh.
- Nota: quando il runner ACL Windows di DSH è disponibile, il modo ristretto di PowerShell viene incapsulato tramite esso; Git Bash e MSYS2 restano non incapsulati per l'incompatibilità Cygwin/MSYS2.

## ⚠️ Note sulla sicurezza

Lo strumento `shell` in modo ristretto: PowerShell viene incapsulato tramite `ctx.sandbox.confine` (fail-closed); Git Bash e MSYS2 **non vengono incapsulati** per l'incompatibilità tra Cygwin/MSYS2 e i token ristretti ACL Windows (stessi privilegi del processo dsh); WSL non viene incapsulato grazie alla sua VM Linux indipendente. È un **ulteriore punto d'ingresso multi-terminale** e non gode delle restrizioni ConstrainedLanguage dello strumento ufficiale `pwsh`. Gli strumenti di manipolazione dei file di DSH (read/write/edit) restano vincolati dalla sandbox dei file. Usalo solo in sessioni di cui ti fidi; per un PowerShell protetto dalla sandbox continua a usare lo strumento ufficiale `pwsh`.

## Limitazioni note del terminale interattivo (ConPTY)

- **PowerShell 5.1 non può avviarsi in un ConPTY** (0x8009001d) — per il PowerShell interattivo installa [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (i comandi una tantum non sono interessati).
- **La modalità interattiva di wsl.exe può innescare un errore RPC del servizio WSL sotto ConPTY** (0x8007072c, intermittente) — i comandi una tantum `wsl -e bash -lc ...` funzionano regolarmente; per le sessioni interattive conviene usare direttamente Windows Terminal / un terminale WSL, oppure riprovare.
- **node-pty non accetta segnali nominati su Windows**: `SIGINT` di `signal` viene mappato su Ctrl+C (`\x03`); gli altri segnali (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) degenerano nella terminazione della sessione.
- Le sessioni interattive Git Bash funzionano pienamente.

## Limitazioni note

- I processi in background WSL possono sopravvivere brevemente nella distribuzione dopo un timeout/interruzione (l'istanza WSL si spegne automaticamente dopo l'uscita dell'ultimo processo).
- Git Bash è un ambiente msys2, con differenze rispetto al comportamento Linux di WSL (mapping dei percorsi, disponibilità dei pacchetti).
- Il backend MSYS2 richiede MSYS2 installato in locale (predefinito `C:\msys64`); senza installazione `shell` segnala `backend unavailable`, e con `msys2Path` si può indicare un percorso personalizzato. L'ordine dei candidati resta sempre `bash.exe` primo e `msys2.exe` come ripiego — con stdio tramite pipe `msys2.exe` restituisce silenziosamente zero byte e va usato solo come ultima spiaggia.
- Questo plugin registra i suoi strumenti solo sulla piattaforma `win32`.

## Test

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # installare le dipendenze (typescript compreso)
npm run build        # compilazione tsc di src/*.ts → lib/*.js; client.tsx → lib/client.js + dist/client.js; test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Il sorgente è TypeScript (`strict` + `noUncheckedIndexedAccess`); gli artefatti di compilazione `lib/` e `dist/` vengono committati nel repository e DSH carica direttamente `lib/index.js`, pronto all'uso senza installazione.
