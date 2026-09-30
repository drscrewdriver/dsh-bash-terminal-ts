# Changelog

## 0.7.0 (2026-09-29)

- **Ligne de compatibilité DSH 0.2.0** (branche `compat/0.2.0`, dist-tag npm `dsh-0.2.0`) : les 11 plages peer `@deepseek-ai/dsh-*` passent en bloc à `>=0.2.0-rc.1 <0.2.1-0` (la ligne 0.1.7 reste gelée sur `compat/0.1.7` pour continuer de servir les anciens hôtes, sans impact). 0.2.0-rc.1 est totalement compatible avec l'API plugin de 0.1.7 ; cette ligne n'apporte aucun changement de code, c'est une adaptation purement métadonnées.
- **Mise à niveau synchronisée des devDependencies** : les 15 paquets `dsh-*` exactement épinglés à `0.1.7-rc.2` (11 homonymes des peers + scope / subprocess / sandbox-policy / http-proxy) → `0.2.0-rc.1`, afin que le build/test d'un checkout propre reste représentatif face à un hôte 0.2.0.
- **Lockfile versionné** : cette branche supprime du `.gitignore` la ligne ignorant `package-lock.json` ; le lockfile rafraîchi est commité avec la branche (la ligne 0.1.7 conserve son ignorement actuel).
- **Métadonnées de publication** : version 0.6.4 → 0.7.0 ; `publishConfig.tag` `dsh-0.1.7` → `dsh-0.2.0` ; `version` et `engines.dsh` du `dsh.plugin.json` alignés en conséquence.
- **Réagencement de la matrice de compatibilité du README** (bilingue zh/en) : ajout des lignes 0.1.7 et 0.2.0, correction du récit périmé « noms de paquets différents » (les lignes partagent désormais le nom de paquet `dsh-bash-terminal-ts` et se distinguent par dist-tag), section Installation mise à jour au double standard 0.1.7-rc.1 / 0.2.0-rc.1.
- **Validation** : `npm install` / `build` / `test` tous au vert (4 suites unit / apply / client / terminal), `npm ls` sans conflit de peer.

## 0.6.4 (2026-09-26)

- **Correction de la cause racine de l'échec de chargement (vestige du changement de nom du paquet)** : le paquet avait été renommé `dsh-bash-terminal-ts`, mais le `name` de l'entrée bundle du `cordis.patch.yml` indiquait encore le `dsh-bash-terminal` d'avant divergence. Le chargeur 0.1.7 résout le module par nom, l'échec était donc inévitable (`failed to import loader entry (dsh-bash-terminal)`) ; aucune fiber ne pouvait être créée, et ni le montage à chaud ni un redémarrage ne permettaient de récupérer. Désormais le `name` de l'entrée correspond au nom du paquet, et l'activation est normale sous DSH 0.1.7.
- **Divergence complète du nom de projet** : l'`id` / `name` du `dsh.plugin.json`, l'id d'enregistrement client, `install.ps1` (chemins de junction, nom de bundle, textes d'aide), ainsi que les chemins et descriptions du projet dans README / CONTRIBUTING / la documentation de compatibilité passent tous à `dsh-bash-terminal-ts` ; seuls `MAXeaglet/dsh-bash-terminal` (référence au dépôt amont) et l'id d'entrée outil `tool-bash-terminal` restent inchangés. La regex de nettoyage du uninstall d'`install.ps1` devient `dsh-bash-terminal(-ts)?`, les blocs hérités de l'ancien format restent nettoyables.
- **Robustesse du client** : la page de réglages affiche une ligne « indisponible » (avec pistes de diagnostic) lorsque l'hôte ne fournit pas l'entrée `configForms` de ce plugin, au lieu d'un blanc silencieux.

## 0.3.18 (non publié)

- **Synchronisation de la ligne de compatibilité DSH 0.1.5** (cette ligne maintient `ts/0.1.5`) : les changements indépendants apportés après divergence à la ligne 0.1.2 ont été vérifiés un à un puis appliqués à cette ligne.
- **Complément de manifeste standard** : ajout de `dsh.plugin.json` (`id` / `components` / `engines`) et de `screenshots.json`, tous deux ajoutés à la liste blanche `files`.
- **Resserrement des `engines`** : `node` passe de `>=20` à `>=22`, et ajout de `engines.dsh` = `>=0.1.5-alpha.1 <0.2.0-0` (auparavant, seule cette ligne n'avait pas cette déclaration).
- **Correction de l'attribution de l'identité du paquet** : `author` / `repository` / `bugs` / `homepage` passent du fork amont (MAXeaglet/dsh-bash-terminal) à ce dépôt (drscrewdriver/dsh-bash-terminal-ts).
- **Typecheck possible sur checkout propre** : les devDependencies sont complétées avec les paquets peer DSH (épinglés exactement à `0.1.5-rc.2`). Avant correction, `tsc` signalait `TS7006` (`revision` / `writable` implicitement any dans `src/client.tsx`) — les peers n'étant déclarés que dans `peerDependencies` et optionnels, `npm install` n'installait rien. Comme `dsh-shell@0.1.5-rc.1` déclare encore le peer `0.1.2-rc.1`, l'installation de l'arbre exigeait `--legacy-peer-deps`.
- **`react-dom` ajouté aux devDependencies** : auparavant, `react` était résolu depuis ce dépôt tandis que `react-dom/server` retombait sur la copie imbriquée de l'arbre d'installation DSH ; `renderToString` recevait deux instances React différentes et le test client échouait avec « Objects are not valid as a React child ». Après complément, `react` et `react-dom` sont tous deux en 18.3.1 et les tests passent.
- **Ne pas renommer, volontairement** : cette ligne conserve le nom de paquet `dsh-bash-terminal-ts` (sans suivre le `dsh-bash-terminal-ts` de la ligne 0.1.2), afin que les deux lignes puissent coexister à l'installation sans entrer en conflit d'identité de paquet.
- **Vérification (testé en local)** : `npm run build` exit 0 ; `test-dist/{unit,apply,client}.js` exit 0 chacun ; `test-dist/terminal.js` lancé isolément exit 0 (3/3 réussis). Le smoke MSYS2 d'`unit` **s'exécute réellement** et sort `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `/usr/bin/bash` : la sémantique d'environnement MSYS2, raison d'être de cette ligne, est confirmée de bout en bout.
- **Échec environnemental connu (non introduit par cette ligne)** : le 4e segment du `npm test` chaîné (`terminal.js`) échoue avec `AttachConsole failed` sur une console non interactive (aucune Console à attacher) ; il se reproduit à l'identique sur la baseline non modifiée.

## 0.3.17 (2026-09-13)

- **MSYS2 devient le 4e backend de terminal** (ordre `SHELLS` : powershell / gitbash / msys2 / wsl). `Config` gagne `msys2Path`, câblé via `resolveAllPaths` ; `SHELL_DESCRIPTIONS.msys2` et `toolDescription` sont complétés avec la description du backend.
- **Réglage MSYS2 complété (client)** : la ligne « Terminal par défaut » de l'UI Web n'offrait auparavant que powershell / gitbash / wsl — le backend MSYS2 existait mais le front-end ne permettait pas de le choisir. `src/client.tsx` ajoute l'option `msys2` et les libellés bilingues `shell.msys2` (MSYS2 est un nom propre, identique en chinois et en anglais).
- **Correctif stdio pipeline MSYS2** : `C:\msys64\msys2.exe` est un lanceur Cygwin qui alloue une console ; sous stdio pipeline il rend la main avec exit 0 et zéro octet (stdout/stderr à 0 octet, mesuré avec MSYS2 bash 5.3.15), toute commande MSYS2 restait donc silencieusement sans sortie. L'ordre des candidats devient : priorité à `C:\msys64\usr\bin\bash.exe` → `bin\bash.exe` → entrées mingw64/msys64 du PATH, `msys2.exe` rétrogradé en filet de sécurité en fin de liste.
- **Login shell MSYS2** : `buildArgv` utilise `-lc` plutôt que `-c` ; seul le login shell source `/etc/profile` et ajoute `/usr/bin` et `/mingw64/bin` au PATH (avec un `-c` nu, `bash` se résout à `C:\Windows\System32\bash.exe`, et `gcc`/`make` donnent tous deux command not found).
- **Environnement MSYS2** : `buildEnv` injecte `MSYSTEM=MINGW64` (la valeur explicitement fournie par l'utilisateur prime) afin de placer gcc et make de `/mingw64/bin` dans le PATH ; l'env des sessions interactives de l'outil `terminal` est alignée sur ce comportement.
- **Sandbox MSYS2** : comme pour Git Bash, pas d'enveloppement (le runner à jeton restreint ACL Windows est incompatible avec Cygwin/MSYS2) ; le résultat rapporte `enforcement: msys2-unconfined`.
- **L'env du terminal interactif passe par `buildEnv`** : `src/terminal.ts` assemblait auparavant son propre env, court-circuitant l'injection MSYSTEM de `buildEnv` — résultat : l'outil `shell` fonctionnait, mais le **terminal interactif** msys2 n'avait pas `/mingw64/bin` (`/etc/profile` configurait le PATH pour l'environnement MSYS par défaut). Désormais : `buildEnv(shell, ctx.shellEnv.collect(exec), process.env.WSLENV)` — l'injection MSYSTEM est obtenue et la logique WSLENV n'est plus dupliquée. Le troisième paramètre doit être passé explicitement : `spawnTerminal` remplace intégralement l'environnement du processus fils via `childEnv(spec.env)`, sinon le WSLENV présent dans l'environnement reste invisible.
- **WSL `WSLENV` : concaténation au lieu de reconstruction** : WSLENV est la liste blanche inter-monde de WSL ; l'ancien code la reconstruisait uniquement depuis `dshEnv`, perdant les entrées déjà présentes dans l'environnement (en local `WSLENV=WT_SESSION:WT_PROFILE_ID:`, exporté par Windows Terminal), lesquelles n'entraient plus dans WSL. Désormais on concatène sur les valeurs héritées : découpage par `:` puis filtrage des entrées vides (la valeur héritée se termine par `:`, une concaténation de chaînes produirait des entrées vides), exclusion de la clé `WSLENV` elle-même (elle est aussi une clé de `dshEnv`, l'ajouter donnerait `...:WSLENV`) ; le WSLENV fourni explicitement par l'appelant prime sur les valeurs héritées.
- **Terminal interactif** : `terminalArgv("msys2")` utilise `-l`. Impossible de conserver `-lc` : cet argv n'embarque pas de commande (le PTY est lui-même la session), et `bash -lc` sans opérande quitte immédiatement avec `-c: option requires an argument` (exit 2).
- **Bundle client reproductible** : `scripts/build-client.mjs` laissait auparavant esbuild remonter depuis `src/client.tsx` à la recherche du tsconfig ; un build dans le dépôt tombait sur le `tsconfig.json` racine et produisait une ligne `"use strict";` supplémentaire, ce qu'un build de worktree hors dépôt ne faisait pas — la même source donnait ainsi deux artefacts commités différents. Désormais `tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } }` est épinglé explicitement (soit les valeurs réellement effectives du tsconfig racine) ; la seule différence observable est la disparition de cette ligne `"use strict";`.
- **Protection anti-régression** : `test/unit.ts` asserte l'argv `-lc` de msys2, l'injection `MSYSTEM` avec priorité à la valeur utilisateur, le fait que `bash.exe` doit précéder `msys2.exe`, ainsi que la sémantique de concaténation de `WSLENV` (entrées héritées conservées / aucune entrée vide / pas d'ajout de `WSLENV` lui-même / valeur explicite prioritaire), plus une assertion de smoke sur un spawn réel (stdout non vide et contenant `/mingw64/bin/gcc` ; 0 octet = échec) ; `test/apply.ts` asserte l'argv/env de msys2, `msys2-unconfined` et la structure WSLENV ; `test/terminal.ts` asserte l'argv interactif et le câblage PTY env via `buildEnv`, et ouvre une **véritable session msys2 node-pty** (assertions `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `BASH=/usr/bin/bash`) ; `test/client.ts` gagne un garde-fou anti-dérive — pour chaque `SHELLS` de l'hôte, assertion que la liste du bundle client et les entrées de menu rendues coïncident (ordre compris) et que les dictionnaires chinois et anglais contiennent tous deux `shell.<id>`. Chacun de ces gardes a été contre-vérifié en sens inverse (casser l'artefact de build → échec d'assertion → repasse après restauration).

## 0.3.16 (2026-09-12)

- **Réécriture TypeScript intégrale**. Côté serveur `lib/index.js` / `lib/terminal.js` → `src/index.ts` / `src/terminal.ts` ; client `src/client.jsx` → `src/client.tsx` ; tests `test/*.mjs` → `test/*.ts` (compilés dans `test-dist/` puis exécutés). `tsc --strict` + `noUncheckedIndexedAccess` tout au vert.
- Les contrats du plugin envers les seams DSH sont ramenés à des types structurels écrits à la main (`src/dsh-types.ts`) ; les imports de valeurs des paquets peer passent tous par le pont de rétrécissement `src/dsh.ts`, la dérive de versions des peers ne s'infiltre plus dans le code réécrit.
- Chaîne de build : `npm run build` = `tsc` (serveur → `lib/`) + `tsc -p tsconfig.client.json` (vérification des types client) + esbuild (`src/client.tsx` → `lib/client.js` + `dist/client.js`) + `tsc -p tsconfig.test.json`. Les artefacts `lib/` et `dist/` continuent d'être commités avec le dépôt, et le chemin de chargement `lib/index.js` par DSH ne change pas.
- Surface d'export conservée à la lettre (`name` / `inject` / `Config` / `apply` / `SHELLS` / `DEFAULT_SHELL` / `SETTINGS_NAMESPACE` / `internals`), comportement à l'exécution identique à 0.3.15 ; ont seulement été retirés une fonction morte `pathResolve` inatteignable en fin de terminal.js et l'import inutilisé `MAX_TIMER_DELAY_MS`.

## 0.3.15 (2026-09-11)

- **Adaptation à DSH 0.1.5-rc.1**. La table des modules client (`PLATFORM_MODULES`) renomme `@deepseek-ai/dsh-client-runtime` en `@deepseek-ai/dsh-client-store` et ne résout que par **nom nu exact** (pas de sous-chemin `/client`, pas de repli sur la fabrique du paquet). Le bundle client faisait auparavant `require("@deepseek-ai/dsh-client-runtime/client")`, ratage garanti en 0.1.5 → l'UI Web échouait au démarrage avec `Failed to load plugins / require(...) missed the module table`. Désormais `@deepseek-ai/dsh-client-store` est utilisé, et les 4 require du bundle (`react`, `react/jsx-runtime`, `dsh-client-store`, `dsh-client-ui-primitives`) tombent tous dans la table de seeds de la plateforme, sans besoin de `dsh.client.external`.
- `dsh.client.inject` est mis à jour avec les vrais noms de paquets client existant en 0.1.5 (`dsh-client-locale`, `dsh-client-ui-settings`, `dsh-api-remotes`).
- Le seam serveur des settings n'exporte plus `settingsNamespace()` (depuis 0.1.5, `register(ns: string, schema, { base })` reçoit directement la chaîne de namespace) ; l'emballage correspondant a été retiré, le code reste valable pour les deux générations d'API 0.1.0/0.1.5.
- `peerDependencies` alignées sur `^0.1.5-rc.1` (ajout de `dsh-sandbox`, réellement dépendu, `cordis` remonté à `^4.0.2`) ; le test client gagne une assertion anti-régression : le bundle ne doit plus contenir `dsh-client-runtime`.
- Le patch de liste blanche des settings d'`install.ps1` gagne une sonde d'existence : 0.1.5 n'a plus de liste blanche codée en dur, le script ne réécrit plus le fichier hôte pour des remplacements sans correspondance (ce qui ne faisait qu'ajouter un BOM).
- Git Bash n'est plus enveloppé via `ctx.sandbox.confine` : le runner à jeton restreint ACL Windows de DSH est incompatible avec Cygwin/MSYS2 (bash se termine dès le démarrage avec l'erreur Win32 5 de `CreateFileMapping`) ; désormais Git Bash s'exécute également sans enveloppement en mode restreint, le résultat rapporte `enforcement: gitbash-unconfined`. Corrige #6.

## 0.3.14 (2026-08-14)

- La ligne de réglages reflète désormais exactement la EnterBehaviorRow fournie : disposition de la ligne (titre + description tertiaire à gauche, sélecteur capsule à droite), déclencheur capsule de 36 px (`--dsw-alias-bg-module-platform`, rayon 18 px, état hover) avec chevron, Menu en portal avec `align="end"`. CSS injecté de la même manière que pour les lignes first-party.
- Suppression de la phrase de description « (由你决定，AI 无法更改) ».

## 0.3.13 (2026-08-14)

- La ligne de réglages suit la grammaire des lignes de la section Générale fournie (pile en colonne, filet inférieur de 1 px via `--dsw-alias-border-l2`, padding vertical de 16 px, titre 14 px/400) — correspond à la disposition de la ligne Appearance.

## 0.3.12 (2026-08-14)

- **UI native orientée utilisateur** : la ligne « Terminal par défaut » de Paramètres → Général s'affiche désormais avec les primitives natives DSH (`Menu` + `Button` + `IconCodeOutline16`) au lieu d'un simple `<select>` HTML — elle ressemble et se comporte exactement comme un réglage first-party. Le test client rend la ligne via du vrai React (renderToString) avec des primitives simulées.

## 0.3.11 (2026-08-14)

- Outil `terminal` : WSL interactif sur la distribution par défaut utilise désormais `wsl -- bash -i` (le `-e` simple échoue sous ConPTY avec l'erreur RPC 0x8007072c du service WSL) ; un `-d <distro>` explicite conserve `-e`. Vérifié : pwd → /mnt/d/WorkSpace.
- Correctifs CI : l'assertion argv wsl utilise SystemRoot (insensible à la casse) ; les tests client/terminal résolvent react + node-pty d'un environnement à l'autre (la CI les installe sans save) ; le test wsl interactif tolère les environnements sans distribution.

## 0.3.10 (2026-08-14)

- install.ps1 migre le profil vers l'installation par bundle officiel (ajoute `dsh-bash-terminal-ts` à `dsh.profile.bundles` et supprime l'insertion manuelle héritée), en écrivant package.json sans BOM UTF-8 (le BOM du `Set-Content` de PS 5.1 cassait le JSON.parse de DSH). Profil web courant vérifié : le bundle fournit l'entrée `tool-bash-terminal` via `--dump-config`.

## 0.3.9 (2026-08-14)

- **Manifeste de bundle officiel** : le paquet déclare désormais `dsh.bundle.patch` (embarque son propre `cordis.patch.yml`) ; un profil listant `dsh-bash-terminal-ts` dans `dsh.profile.bundles` applique automatiquement le montage — vérifié via un profil temporaire + `--dump-config` (l'entrée apparaît sans aucun patch manuel du profil).

## 0.3.8 (2026-08-14)

- Couverture de tests : l'exécution en arrière-plan de `shell` enregistre un job avec des hooks `cancel` / `done` / `readOutput` fonctionnels (13 cas apply/execute au total).

## 0.3.7 (2026-08-14)

- Outil `terminal` : les lectures attendent désormais la stabilisation de la sortie (300 ms de silence, plafond 5 s) au lieu d'un délai fixe, de sorte que `send` renvoie la réponse COMPLÈTE (vérifié : sortie multi-ligne complète, p. ex. `seq 1 8`).

## 0.3.6 (2026-08-14)

- Couverture de tests : ouverture du `terminal` avec commande initiale (exécution immédiate dans un shell neuf) et forme des hooks de job (cancel / done / readOutput) vérifiées sur une vraie session node-pty.

## 0.3.5 (2026-08-14)

- Outil `terminal` : le débordement de tampon est signalé (drapeau `truncated` + notice « [terminal buffer overflowed; oldest output dropped] ») afin qu'une session chargée ne perde jamais silencieusement l'historique.

## 0.3.4 (2026-08-14)

- Outil `terminal` : les sessions WSL transportent désormais les variables d'environnement DSH_* via WSLENV, à l'instar de l'outil `shell`.

## 0.3.3 (2026-08-14)

- Outil `terminal` : la nouvelle action `list` énumère les sessions actives (sessionId / shell / pid) pour la gestion multi-sessions.

## 0.3.2 (2026-08-14)

- Plafond de sessions : au plus 8 sessions de terminal simultanées (échec rapide au-delà).
- Vérification interactive multi-backend : Git Bash (complet), limites ConPTY documentées de PowerShell 5.1 et wsl.exe (0x8009001d / 0x8007072c ; pwsh 7 et les commandes ponctuelles -lc fonctionnent).
- README (zh/en) : limites connues du terminal interactif.

## 0.3.1 (2026-08-14)

- Les sessions de terminal s'enregistrent auprès du registre générique de jobs (jobId à l'ouverture ; `job_kill` / `job_output` fonctionnent dessus).
- Délai d'inactivité : les sessions se ferment automatiquement après 10 minutes sans send/read/signal (configurable via `idleMs` à l'ouverture) afin que les PTY abandonnés ne laissent jamais fuir d'arborescences de processus.

## 0.3.0 (2026-08-14)

- **Outil de terminal interactif (`terminal`)** : sessions PTY persistantes via le seam officiel `ctx.subprocess.spawnTerminal` (node-pty). Actions : `open` / `send` / `read` / `signal` (Ctrl+C, etc.) / `close`. L'état du shell (cwd, variables, alias) persiste entre les appels ; le backend suit le réglage du terminal par défaut de l'utilisateur. Vérifié avec une vraie session node-pty interactive Git Bash (cd + pwd + echo + SIGINT + close).

## 0.2.3 (2026-08-14)

- Couverture de tests fail-closed (un backend de sandbox indisponible rejette l'appel).
- Documentation de la sandbox dans le README.
- CI GitHub Actions (suites unit / apply / client sur windows-latest).

## 0.2.2 (2026-08-14)

- **Rendu officiel des refus** : un appel confiné dont le stderr correspond aux signatures de refus du runner rapporte `sandbox.denied: true` et la sortie orientée modèle porte les marqueurs officiels exacts — `[sandbox: file access denied under <mode> mode]` plus l'indice d'escalade du même tour.

## 0.2.1 (2026-08-14)

- **Surface officielle d'escalade de sandbox** : l'outil `shell` annonce désormais `sandbox_permissions` / `justification` (le contrat exact de tool-bash / tool-pwsh) : un appel refusé peut être réessayé une fois avec le mode élargi le plus étroit possible, routé via `ctx.approval` (`approveEscalation`), avec une validation d'élargissement strict.

## 0.2.0 (2026-08-14)

- **Intégration de la sandbox (seam officiel)** : l'outil `shell` résout la politique de sandbox DSH à chaque appel (`ctx.sandboxPolicy`) et enveloppe les argv PowerShell / Git Bash via `ctx.sandbox` — la même sémantique fail-closed `SandboxUnavailableError` que les exécuteurs fournis. WSL s'exécute non confiné (son isolation par VM Linux EST la sandbox). Les informations de sandbox (`sandbox.mode` / `sandbox.enforcement`) accompagnent les résultats de premier plan.
- **Préférence du modèle** : la section du prompt système du plugin demande aux agents de préférer l'outil `shell` à `pwsh` pour les commandes de terminal ; la description de l'outil met en tête le terminal par défaut choisi par l'utilisateur.

## 0.1.0 (2026-08-14)

Première publication.

- Outil `shell` : exécuter des commandes via PowerShell / Git Bash / WSL sous Windows.
- Le terminal par défaut est choisi par l'utilisateur dans les réglages de l'UI Web (Paramètres → Général → Terminal par défaut) ; le modèle ne peut pas le contourner.
- Exécution en arrière-plan via le registre générique de jobs (`run_in_background` / `job_output` / `job_kill`).
- Le plugin client enregistre la ligne de réglages ; le plugin hôte lit le réglage de l'utilisateur à chaque appel.
- install.ps1 : installation par junction, montage cordis.patch.yml et patch automatique de la liste blanche des settings dsh-host-apiproxy (limitation DSH ; voir le README).
