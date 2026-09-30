# Changelog

## 0.7.0 (2026-09-29)

- **Linea di compatibilità DSH 0.2.0** (branch `compat/0.2.0`, dist-tag npm `dsh-0.2.0`): gli 11 range peer `@deepseek-ai/dsh-*` passano in blocco a `>=0.2.0-rc.1 <0.2.1-0` (la linea 0.1.7 resta congelata su `compat/0.1.7` a servizio dei vecchi host, senza impatti). 0.2.0-rc.1 è pienamente compatibile con l'API plugin di 0.1.7; questa linea non cambia alcun codice, è una pura adeguamento dei metadati.
- **Aggiornamento sincronizzato delle devDependencies**: i 15 pacchetti `dsh-*` esattamente pinnati a `0.1.7-rc.2` (11 omonimi dei peer + scope / subprocess / sandbox-policy / http-proxy) → `0.2.0-rc.1`, così che build/test da un checkout pulito restino rappresentativi verso un host 0.2.0.
- **Lockfile in repository**: questo branch elimina la riga che ignorava `package-lock.json` nel `.gitignore`; il lockfile rinfrescato dopo l'aggiornamento dell'albero delle dipendenze viene committato con il branch (la linea 0.1.7 mantiene l'attuale comportamento di ignorarlo).
- **Metadati di pubblicazione**: versione 0.6.4 → 0.7.0; `publishConfig.tag` `dsh-0.1.7` → `dsh-0.2.0`; `version` e `engines.dsh` del `dsh.plugin.json` allineati di conseguenza.
- **Riordino della matrice di compatibilità del README** (bilingue zh/en): aggiunte le righe 0.1.7 e 0.2.0, corretta la narrazione superata dei «nomi di pacchetto diversi» (le linee ora condividono il nome di pacchetto `dsh-bash-terminal-ts`, distinguendosi per dist-tag), sezione Installazione aggiornata al doppio criterio 0.1.7-rc.1 / 0.2.0-rc.1.
- **Verifica**: `npm install` / `build` / `test` tutti verdi (4 suite unit / apply / client / terminal), `npm ls` senza conflitti tra peer.

## 0.6.4 (2026-09-26)

- **Corretta la causa radice del fallimento di caricamento (relitto della rinomina del pacchetto)**: il pacchetto era stato rinominato `dsh-bash-terminal-ts`, ma il `name` della voce bundle nel `cordis.patch.yml` riportava ancora il `dsh-bash-terminal` precedente alla biforcazione. Il loader 0.1.7 risolve i moduli per nome, quindi il fallimento era inevitabile (`failed to import loader entry (dsh-bash-terminal)`); non si riusciva nemmeno a creare una fiber, e né il mount a caldo né un riavvio permettevano di ripristinare. Ora il `name` della voce coincide con il nome del pacchetto e l'attivazione è regolare sotto DSH 0.1.7.
- **Biforcazione completa del nome del progetto**: `id` / `name` del `dsh.plugin.json`, id di registrazione client, `install.ps1` (percorsi junction, nome bundle, testi di aiuto), percorsi e descrizioni del progetto in README / CONTRIBUTING / documentazione di compatibilità passano tutti a `dsh-bash-terminal-ts`; restano invariati solo `MAXeaglet/dsh-bash-terminal` (riferimento al repository upstream) e l'id della voce strumento `tool-bash-terminal`. La regex di pulizia dell'uninstall di `install.ps1` diventa `dsh-bash-terminal(-ts)?`, così i blocchi lasciati dal vecchio formato restano rimuovibili.
- **Robustezza del client**: la pagina delle impostazioni mostra una riga «non disponibile» (con piste di diagnosi) quando l'host non fornisce la voce `configForms` di questo plugin, invece di restare mutamente vuota.

## 0.3.18 (non pubblicata)

- **Sincronizzazione della linea di compatibilità DSH 0.1.5** (questa linea mantiene `ts/0.1.5`): le modifiche indipendenti apportate dopo la biforcazione alla linea 0.1.2 sono state verificate una a una e riportate su questa linea.
- **Manifest standard completato**: aggiunti `dsh.plugin.json` (`id` / `components` / `engines`) e `screenshots.json`, entrambi inseriti nella allowlist `files`.
- **Chiusura dei `engines`**: `node` alzato da `>=20` a `>=22` e aggiunto `engines.dsh` = `>=0.1.5-alpha.1 <0.2.0-0` (in precedenza era proprio questa linea a non avere la dichiarazione).
- **Corretta l'attribuzione dell'identità del pacchetto**: `author` / `repository` / `bugs` / `homepage` passano dal fork upstream (MAXeaglet/dsh-bash-terminal) a questo repository (drscrewdriver/dsh-bash-terminal-ts).
- **Typecheck possibile su checkout pulito**: devDependencies completate con i pacchetti peer DSH (pinnati esattamente a `0.1.5-rc.2`). Prima della correzione `tsc` segnalava `TS7006` (`revision` / `writable` implicitamente any in `src/client.tsx`) — i peer erano dichiarati solo in `peerDependencies` e opzionali, quindi `npm install` non installava nulla. Poiché `dsh-shell@0.1.5-rc.1` dichiara ancora il peer `0.1.2-rc.1`, l'installazione dell'albero richiedeva `--legacy-peer-deps`.
- **`react-dom` aggiunto come devDependency**: in precedenza `react` veniva risolto da questo repository mentre `react-dom/server` ricadeva sulla copia annidata nell'albero di installazione di DSH; `renderToString` riceveva due istanze React diverse e il test client falliva con “Objects are not valid as a React child”. Dopo l'aggiunta `react` e `react-dom` sono entrambi 18.3.1 e i test passano.
- **Scelta consapevole di non rinominare**: questa linea mantiene il nome di pacchetto `dsh-bash-terminal-ts` (non segue il `dsh-bash-terminal-ts` della linea 0.1.2), così le due linee possono coesistere in installazione senza conflitti di identità di pacchetto.
- **Verifica (provata in locale)**: `npm run build` exit 0; `test-dist/{unit,apply,client}.js` exit 0 ciascuno; `test-dist/terminal.js` avviato singolarmente exit 0 (3/3 superati). Lo smoke MSYS2 di `unit` **viene eseguito davvero** e produce in output `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `/usr/bin/bash`: la semantica d'ambiente MSYS2, ragion d'essere di questa linea, è confermata end-to-end.
- **Fallimento ambientale noto (non introdotto da questa linea)**: il 4° segmento della `npm test` concatenata (`terminal.js`) riporta `AttachConsole failed` su console non interattiva (nessuna Console a cui agganciarsi); si riproduce identicamente sulla baseline non modificata.

## 0.3.17 (2026-09-13)

- **MSYS2 diventa il 4° backend di terminale** (ordine di `SHELLS`: powershell / gitbash / msys2 / wsl). `Config` aggiunge `msys2Path`, cablato tramite `resolveAllPaths`; `SHELL_DESCRIPTIONS.msys2` e `toolDescription` completati con la descrizione del backend.
- **Impostazione MSYS2 completata (client)**: la riga «Terminale predefinito» della UI Web offriva in precedenza solo powershell / gitbash / wsl — il backend MSYS2 esisteva ma il frontend non permetteva di sceglierlo. `src/client.tsx` aggiunge l'opzione `msys2` e i testi bilingue di `shell.msys2` (MSYS2 è un nome proprio, identico in cinese e in inglese).
- **Correzione stdio pipeline MSYS2**: `C:\msys64\msys2.exe` è un launcher Cygwin che alloca una console; con stdio tramite pipe restituisce exit 0 e zero byte (stdout/stderr a 0 byte, misurato con MSYS2 bash 5.3.15), quindi ogni comando MSYS2 restava muto senza output. L'ordine dei candidati diventa: prima `C:\msys64\usr\bin\bash.exe` → `bin\bash.exe` → voci mingw64/msys64 nel PATH, con `msys2.exe` declassato a rete di sicurezza a fine lista.
- **Login shell MSYS2**: `buildArgv` usa `-lc` invece di `-c`; solo la login shell fa source di `/etc/profile` aggiungendo `/usr/bin` e `/mingw64/bin` al PATH (con `-c` nudo `bash` si risolve in `C:\Windows\System32\bash.exe`, e `gcc`/`make` danno entrambi command not found).
- **Ambiente MSYS2**: `buildEnv` inietta `MSYSTEM=MINGW64` (il valore esplicitamente passato dall'utente ha priorità) per far entrare gcc e make di `/mingw64/bin` nel PATH; l'env delle sessioni interattive dello strumento `terminal` è allineata allo stesso comportamento.
- **Sandbox MSYS2**: come Git Bash, senza incapsulamento (il runner a token ristretti ACL Windows è incompatibile con Cygwin/MSYS2); il risultato riporta `enforcement: msys2-unconfined`.
- **L'env del terminale interattivo passa per `buildEnv`**: `src/terminal.ts` in precedenza componeva un env proprio, bypassando l'iniezione MSYSTEM di `buildEnv` — risultato: lo strumento `shell` funzionava ma il **terminale interattivo** msys2 non vedeva `/mingw64/bin` (`/etc/profile` configurava il PATH per l'ambiente MSYS predefinito). Ora: `buildEnv(shell, ctx.shellEnv.collect(exec), process.env.WSLENV)` — si ottiene l'iniezione MSYSTEM e non si duplica più la logica WSLENV. Il terzo parametro va passato esplicitamente: `spawnTerminal` sostituisce integralmente l'ambiente del processo figlio con `childEnv(spec.env)`, il WSLENV dell'ambiente resterebbe altrimenti invisibile.
- **WSL `WSLENV`: concatenazione invece di ricostruzione**: WSLENV è la allowlist trans-frontiera di WSL; il vecchio codice la ricostruiva solo da `dshEnv`, perdendo le voci già presenti nell'ambiente (in locale `WSLENV=WT_SESSION:WT_PROFILE_ID:`, esportato da Windows Terminal), che non entravano più in WSL. Ora si concatena sui valori ereditati: suddivisione per `:` con filtro delle voci vuote (il valore ereditato finisce con `:`, la mera concatenazione di stringhe produrrebbe voci vuote), esclusione della chiave `WSLENV` stessa (è anche una chiave di `dshEnv`, aggiungerla produrrebbe `...:WSLENV`); il WSLENV fornito esplicitamente dal chiamante ha priorità sui valori ereditati.
- **Terminale interattivo**: `terminalArgv("msys2")` usa `-l`. Non si può mantenere `-lc`: quell'argv non porta un comando (il PTY è esso stesso la sessione), e `bash -lc` senza operandi esce subito con `-c: option requires an argument` (exit 2).
- **Bundle client riproducibile**: `scripts/build-client.mjs` lasciava in precedenza che esbuild cercasse il tsconfig risalendo da `src/client.tsx`; una build nel repository beccava il `tsconfig.json` radice e produceva una riga `"use strict";` in più, cosa che una build da worktree fuori dal repository non faceva — lo stesso sorgente generava due artefatti committati diversi. Ora `tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } }` è fissato esplicitamente (cioè i valori realmente effettivi del tsconfig radice); l'unica differenza osservabile è la scomparsa di quella riga `"use strict";`.
- **Protezione anti-regressione**: `test/unit.ts` asserisce l'argv `-lc` di msys2, l'iniezione di `MSYSTEM` con priorità al valore utente, che `bash.exe` debba precedere `msys2.exe`, e la semantica di concatenazione di `WSLENV` (voci ereditate conservate / nessuna voce vuota / nessuna aggiunta di `WSLENV` stesso / valore esplicito prioritario), più un'asserzione smoke su spawn reale (stdout non vuoto e contenente `/mingw64/bin/gcc`; 0 byte = fallimento); `test/apply.ts` asserisce argv/env di msys2, `msys2-unconfined` e la struttura WSLENV; `test/terminal.ts` asserisce l'argv interattivo e il cablaggio PTY env via `buildEnv`, e apre una **vera sessione msys2 con node-pty** (asserzioni `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `BASH=/usr/bin/bash`); `test/client.ts` aggiunge una guardia anti-deriva — per ogni `SHELLS` dell'host asserisce che l'elenco del bundle client e le voci di menu renderizzate coincidano (ordine compreso) e che sia il dizionario cinese sia quello inglese contengano `shell.<id>`. Ognuna di queste guardie è stata controverificata in senso inverso (rottura dell'artefatto di build → asserzione fallita → verde dopo il ripristino).

## 0.3.16 (2026-09-12)

- **Riscrittura TypeScript integrale**. Lato server `lib/index.js` / `lib/terminal.js` → `src/index.ts` / `src/terminal.ts`; client `src/client.jsx` → `src/client.tsx`; test `test/*.mjs` → `test/*.ts` (compilati in `test-dist/` ed eseguiti lì). `tsc --strict` + `noUncheckedIndexedAccess` tutti verdi.
- I contratti del plugin verso le seam DSH sono ricondotti a tipi strutturali scritti a mano (`src/dsh-types.ts`); gli import di valore dei pacchetti peer passano tutti per il ponte di restringimento `src/dsh.ts`, la deriva delle versioni dei peer non si infiltra più nel codice riscritto.
- Catena di build: `npm run build` = `tsc` (server → `lib/`) + `tsc -p tsconfig.client.json` (typecheck client) + esbuild (`src/client.tsx` → `lib/client.js` + `dist/client.js`) + `tsc -p tsconfig.test.json`. Gli artefatti `lib/` e `dist/` continuano a essere committati e il percorso di caricamento `lib/index.js` da parte di DSH resta invariato.
- Superficie di export mantenuta alla lettera (`name` / `inject` / `Config` / `apply` / `SHELLS` / `DEFAULT_SHELL` / `SETTINGS_NAMESPACE` / `internals`), comportamento a runtime identico a 0.3.15; rimossi solo una funzione morta `pathResolve` irraggiungibile in fondo a terminal.js e l'import inutilizzato `MAX_TIMER_DELAY_MS`.

## 0.3.15 (2026-09-11)

- **Adattamento a DSH 0.1.5-rc.1**. La tabella dei moduli client (`PLATFORM_MODULES`) rinomina `@deepseek-ai/dsh-client-runtime` in `@deepseek-ai/dsh-client-store` e becca solo per **nome nudo esatto** (nessun sottopercorso `/client`, nessun ripiego sulla factory del pacchetto). Il bundle client prima faceva `require("@deepseek-ai/dsh-client-runtime/client")`, sotto 0.1.5 un mancamento garantito → la GUI Web falliva all'avvio con `Failed to load plugins / require(...) missed the module table`. Ora si usa `@deepseek-ai/dsh-client-store` e i 4 require del bundle (`react`, `react/jsx-runtime`, `dsh-client-store`, `dsh-client-ui-primitives`) cadono tutti nella tabella di seed della piattaforma, senza bisogno di `dsh.client.external`.
- `dsh.client.inject` aggiornato ai veri nomi dei pacchetti client esistenti in 0.1.5 (`dsh-client-locale`, `dsh-client-ui-settings`, `dsh-api-remotes`).
- La seam server delle settings non esporta più `settingsNamespace()` (dal 0.1.5 `register(ns: string, schema, { base })` riceve direttamente la stringa di namespace); il wrapper è stato rimosso di conseguenza e il codice vale per entrambe le generazioni di API 0.1.0/0.1.5.
- `peerDependencies` allineate a `^0.1.5-rc.1` (aggiunto `dsh-sandbox`, realmente dipendente; `cordis` alzato a `^4.0.2`); il test client aggiunge un'asserzione anti-regressione: il bundle non deve più contenere `dsh-client-runtime`.
- La patch della allowlist delle settings in `install.ps1` aggiunge una sonda di esistenza: il 0.1.5 non ha più una allowlist hardcoded, lo script non riscrive più il file host per sostituzioni senza corrispondenze (che non facevano che aggiungere un BOM).
- Git Bash non viene più incapsulato tramite `ctx.sandbox.confine`: il runner a token ristretti ACL Windows di DSH è incompatibile con Cygwin/MSYS2 (bash abortisce all'avvio con l'errore Win32 5 di `CreateFileMapping`); ora Git Bash gira anche in modo ristretto senza incapsulamento, e il risultato riporta `enforcement: gitbash-unconfined`. Corregge #6.

## 0.3.14 (2026-08-14)

- La riga delle impostazioni rispecchia ora esattamente la EnterBehaviorRow fornita: layout della riga (titolo + descrizione ternaria a sinistra, selettore a capsula a destra), trigger a capsula da 36px (`--dsw-alias-bg-module-platform`, raggio 18px, stato hover) con chevron, Menu in portal con `align="end"`. CSS iniettato allo stesso modo delle righe first-party.
- Rimossa la frase descrittiva «(由你决定，AI 无法更改)».

## 0.3.13 (2026-08-14)

- La riga delle impostazioni segue la grammatica delle righe della sezione Generali fornita (impilamento a colonna, filetto inferiore di 1px via `--dsw-alias-border-l2`, padding verticale di 16px, titolo 14px/400) — corrisponde al layout della riga Appearance.

## 0.3.12 (2026-08-14)

- **UI nativa orientata all'utente**: la riga «Terminale predefinito» di Impostazioni → Generali ora viene renderizzata con le primitive native di DSH (`Menu` + `Button` + `IconCodeOutline16`) invece di un semplice `<select>` HTML — appare e si comporta esattamente come un'impostazione first-party. Il test client renderizza la riga attraverso React reale (renderToString) con primitive simulate.

## 0.3.11 (2026-08-14)

- Strumento `terminal`: il WSL interattivo sulla distribuzione predefinita ora usa `wsl -- bash -i` (il `-e` semplice fallisce sotto ConPTY con l'errore RPC 0x8007072c del servizio WSL); un `-d <distro>` esplicito mantiene `-e`. Verificato: pwd → /mnt/d/WorkSpace.
- Correzioni CI: l'asserzione argv wsl usa SystemRoot (insensibile a maiuscole/minuscole); i test client/terminal risolvono react + node-pty tra ambienti (la CI li installa no-save); il test wsl interattivo tollera ambienti senza distribuzione.

## 0.3.10 (2026-08-14)

- install.ps1 migra il profilo all'installazione tramite bundle ufficiale (aggiunge `dsh-bash-terminal-ts` a `dsh.profile.bundles` e rimuove il vecchio inserimento manuale), scrivendo package.json senza BOM UTF-8 (il BOM di `Set-Content` di PS 5.1 rompeva il JSON.parse di DSH). Profilo web corrente verificato: il bundle fornisce la voce `tool-bash-terminal` via `--dump-config`.

## 0.3.9 (2026-08-14)

- **Manifest di bundle ufficiale**: il pacchetto ora dichiara `dsh.bundle.patch` (include il suo `cordis.patch.yml`); un profilo che elenca `dsh-bash-terminal-ts` in `dsh.profile.bundles` applica automaticamente il mount — verificato tramite profilo temporaneo + `--dump-config` (la voce compare senza alcuna patch manuale del profilo).

## 0.3.8 (2026-08-14)

- Copertura di test: l'esecuzione in background di `shell` registra un job con hook `cancel` / `done` / `readOutput` funzionanti (13 casi apply/execute in totale).

## 0.3.7 (2026-08-14)

- Strumento `terminal`: le letture ora attendono che l'output si stabilizzi (300 ms di silenzio, tetto 5 s) invece di un ritardo fisso, così `send` restituisce la risposta COMPLETA (verificato: output multilinea completo, es. `seq 1 8`).

## 0.3.6 (2026-08-14)

- Copertura di test: apertura del `terminal` con comando iniziale (esecuzione immediata in una shell fresca) e forma degli hook del job (cancel / done / readOutput) verificate su una vera sessione node-pty.

## 0.3.5 (2026-08-14)

- Strumento `terminal`: l'overflow del buffer viene segnalato (flag `truncated` + avviso “[terminal buffer overflowed; oldest output dropped]”) così che una sessione molto attiva non perda mai silenziosamente la cronologia.

## 0.3.4 (2026-08-14)

- Strumento `terminal`: le sessioni WSL ora trasportano le variabili d'ambiente DSH_* via WSLENV, come lo strumento `shell`.

## 0.3.3 (2026-08-14)

- Strumento `terminal`: la nuova azione `list` enumera le sessioni attive (sessionId / shell / pid) per la gestione multi-sessione.

## 0.3.2 (2026-08-14)

- Limite di sessioni: al massimo 8 sessioni di terminale concorrenti (oltre: fallimento rapido).
- Verifica interattiva multi-backend: Git Bash (completa), limiti ConPTY documentati di PowerShell 5.1 e wsl.exe (0x8009001d / 0x8007072c; pwsh 7 e i comandi una tantum -lc funzionano).
- README (zh/en): limiti noti del terminale interattivo.

## 0.3.1 (2026-08-14)

- Le sessioni di terminale si registrano nel registro generico dei job (jobId all'apertura; `job_kill` / `job_output` funzionano su di esse).
- Timeout di inattività: le sessioni si chiudono automaticamente dopo 10 minuti senza send/read/signal (configurabile via `idleMs` all'apertura) così che i PTY abbandonati non lascino mai in fuga alberi di processi.

## 0.3.0 (2026-08-14)

- **Strumento terminale interattivo (`terminal`)**: sessioni PTY persistenti tramite la seam ufficiale `ctx.subprocess.spawnTerminal` (node-pty). Azioni: `open` / `send` / `read` / `signal` (Ctrl+C ecc.) / `close`. Lo stato della shell (cwd, variabili, alias) si preserva tra le chiamate; il backend segue l'impostazione del terminale predefinito dell'utente. Verificato con una vera sessione node-pty interattiva Git Bash (cd + pwd + echo + SIGINT + close).

## 0.2.3 (2026-08-14)

- Copertura di test fail-closed (un backend sandbox non disponibile rifiuta la chiamata).
- Documentazione della sandbox nel README.
- CI GitHub Actions (suite unit / apply / client su windows-latest).

## 0.2.2 (2026-08-14)

- **Rendering ufficiale dei rifiuti**: una chiamata incapsulata il cui stderr corrisponde alle firme di rifiuto del runner riporta `sandbox.denied: true` e l'output rivolto al modello porta i marker ufficiali esatti — `[sandbox: file access denied under <mode> mode]` più il suggerimento di escalation nello stesso turno.

## 0.2.1 (2026-08-14)

- **Superficie ufficiale di escalation sandbox**: lo strumento `shell` ora pubblicizza `sandbox_permissions` / `justification` (l'esatto contratto di tool-bash / tool-pwsh): una chiamata rifiutata può essere ritentata una volta con la modalità più ampia più stretta possibile, instradata tramite `ctx.approval` (`approveEscalation`), con validazione di allargamento rigorosa.

## 0.2.0 (2026-08-14)

- **Integrazione della sandbox (seam ufficiale)**: lo strumento `shell` risolve la politica sandbox DSH a ogni chiamata (`ctx.sandboxPolicy`) e incapsula gli argv PowerShell / Git Bash tramite `ctx.sandbox` — la stessa semantica fail-closed `SandboxUnavailableError` degli executor forniti. WSL gira senza incapsulamento (il suo isolamento in VM Linux È la sandbox). I fatti sandbox (`sandbox.mode` / `sandbox.enforcement`) viaggiano sui risultati in primo piano.
- **Preferenza del modello**: la sezione del system prompt del plugin istruisce gli agenti a preferire lo strumento `shell` a `pwsh` per i comandi di terminale; la descrizione dello strumento mette in testa il terminale predefinito scelto dall'utente.

## 0.1.0 (2026-08-14)

Rilascio iniziale.

- Strumento `shell`: eseguire comandi tramite PowerShell / Git Bash / WSL su Windows.
- Il terminale predefinito viene scelto dall'utente nelle impostazioni della UI Web (Impostazioni → Generali → Terminale predefinito); il modello non può sovrascriverlo.
- Esecuzione in background tramite il registro generico dei job (`run_in_background` / `job_output` / `job_kill`).
- Il plugin client registra la riga delle impostazioni; il plugin host legge l'impostazione dell'utente a ogni chiamata.
- install.ps1: installazione junction, mount cordis.patch.yml e patch automatica della allowlist delle impostazioni dsh-host-apiproxy (limitazione DSH; vedi README).
