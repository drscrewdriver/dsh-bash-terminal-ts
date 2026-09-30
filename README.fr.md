# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> Communauté : [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

Plugin DSH (DeepSeek Harness) : un outil `shell` qui exécute de manière unifiée les commandes des quatre terminaux **PowerShell / Git Bash / MSYS2 / WSL** sous Windows.

> **Ce dépôt est une réécriture TypeScript de `MAXeaglet/dsh-bash-terminal`**, avec un support MSYS2/MINGW64 fonctionnel. Deux lignes de compatibilité :
>
> | Branche | Segment DSH | Nom du paquet | Statut |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | cette branche ; `build` / `unit` / `apply` / `client` / `terminal` tous au vert en local |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | branche principale de la réécriture TypeScript |
>
> Les deux lignes **utilisent délibérément des noms de paquets différents**, elles peuvent donc être installées côte à côte sans s’écraser mutuellement. Choisissez la branche correspondant à votre version de DSH.

| Backend | Exécution réelle | Syntaxe / chemins | Variables d’environnement |
|------|----------|-------------|----------|
| `powershell` (par défaut) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell ; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX ; `/d/workspace` ; PATH incluant `/usr/bin` et `/mingw64/bin` | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX ; `/c/...` ; PATH incluant `/usr/bin` et `/mingw64/bin` (gcc / make) | `$NAME` (injection automatique de `MSYSTEM=MINGW64`) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux ; `/mnt/d/...` | `$NAME` (via WSLENV) |

Chaque appel démarre un shell entièrement neuf : **aucun état n’est conservé** (cwd / variables / alias) — passez un `workdir` plutôt que d’utiliser `cd`.

## Aperçu de l’interface

La ligne « Terminal par défaut » dans Paramètres → Général : l’utilisateur choisit entre PowerShell / Git Bash / MSYS2 / WSL, et l’outil `shell` s’exécute strictement selon ce réglage — le modèle ne peut pas le passer outre :

![Ligne de réglage du terminal par défaut](assets/shells.png)

## Points clés de conception

- **Le terminal est décidé par l’utilisateur, l’IA ne peut pas le modifier** : la page de réglages de la Web UI (Paramètres → Général) affiche une liste déroulante « Terminal par défaut » (PowerShell / Git Bash / MSYS2 / WSL) ; l’outil `shell` n’utilise toujours que ce réglage et n’expose aucun paramètre de terminal au modèle. Le réglage est persisté via le système de settings de DSH (settings.yaml).
- **N’occupe pas le point d’extension de capacité `ctx.shell`** : l’outil `pwsh` sandboxé fourni avec DSH reste disponible tel quel ; l’outil `shell` de ce plugin est une entrée multi-terminal **supplémentaire**.
- Les processus sont dérivés via le point d’extension partagé `ctx.subprocess` : terminaison de l’arbre de processus (Windows `taskkill /T`), SIGTERM→grâce→SIGKILL, fichiers de spill de sortie — même comportement que les `dsh-tool-bash` / `dsh-tool-pwsh` officiels.
- Les tâches d’arrière-plan sont enregistrées dans le registre générique `jobs`, avec prise en charge de `run_in_background` / `job_output` / `job_kill`.
- Le « Terminal par défaut » de la page de réglages front-end est une énumération (rendue automatiquement en liste déroulante par l’UI) ; à chaque appel, le modèle s’exécute strictement selon ce réglage et ne peut pas changer de terminal de sa propre initiative.

## Installation (profil web)

### Installation standard (après publication npm, mécanisme de bundle officiel)

Le plugin embarque le manifest officiel `dsh.bundle` (fichier `cordis.patch.yml` dans le paquet) : dès qu’un profile liste ce paquet, DSH **applique le montage automatiquement**, sans qu’il soit besoin de modifier à la main la configuration du profile :

```powershell
# 1. 安装插件包
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # 自动加进 profile 的 bundles 并应用 patch

# 2. patch DSH 设置白名单（DSH 限制，见下方说明）
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. 重启 dsh web
```

> Vérifié en pratique avec un profile temporaire : `bundles: [dsh-bash-terminal-ts]` → l’entrée `tool-bash-terminal` apparaît automatiquement dans le dump-config.

### Utilisateurs pnpm : approuver le script de build de node-pty

Ce plugin repose sur la bibliothèque PTY native [`node-pty`](https://www.npmjs.com/package/node-pty) (maintenue par Microsoft, la même que celle de VS Code) pour le terminal interactif ; son script de compilation doit s’exécuter pendant l’installation. npm exécute par défaut les scripts install des dépendances — rien à faire ; **pnpm ≥10 les bloque par défaut** et `pnpm add` se termine par :

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

Le paquet est alors bien installé, mais la liaison native n’a pas été compilée : l’outil `terminal` (terminal interactif) échouera au démarrage. Une seule approbation suffit :

```powershell
pnpm approve-builds      # 交互式勾选 node-pty
# 或在 profile 的 package.json 声明后重建：
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> Parmi les plugins dsh du même auteur, **celui-ci est le seul** à embarquer une dépendance native ; les autres plugins de la lignée 0.2.0 (search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper) ainsi que live-token-stats sont des paquets JS purs : pnpm les installe directement, sans approve-builds.

### Installation en développement local (junction en direct, modifications du code source effectives immédiatement)

```powershell
# 1. 链接插件包到 profile 的 node_modules（junction，改源码即时生效）
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. 让插件能解析 @deepseek-ai/* 依赖（junction 到 profile 的依赖树，插件与宿主共用同一份模块实例）
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. 让 profile 通过官方 bundle 挂载插件（install.ps1 install 会自动做；等价于在 dsh.profile.bundles 加 "dsh-bash-terminal-ts"）
# 4. （仅修改前端源码后）重新打包 client bundle:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. 重启 dsh web
```

> ⚠️ **N’exécutez pas `npm install` dans ce projet** : il supprimerait la junction de l’étape 2 ci-dessus et installerait à la place une copie **indépendante** de `@deepseek-ai/*` pour le plugin — le plugin et l’hôte cesseraient alors de partager les instances de modules et, après une montée de version de l’hôte, le plugin resterait bloqué sur une ancienne API (ce projet est ainsi resté sur 0.1.0-rc.6). Pour ne rafraîchir que le lock, utilisez `npm install --package-lock-only`.

> **Compatibilité** : exige DSH ≥ **0.1.5-rc.1**. La 0.1.5 a renommé `@deepseek-ai/dsh-client-runtime` en `@deepseek-ai/dsh-client-store` dans la table des modules navigateur et ne résout plus que par nom nu exact ; sur le nouvel hôte, les anciens bundles signaleront `Failed to load plugins` / `require(...) missed the module table`.
>
> Par ailleurs : la surface de réglages Web de la 0.1.5 passe à une énumération dynamique via `settings.describe()` et **il n’existe plus de liste blanche de namespaces** (`settings-not-exposed` n’existe plus) ; le patch de liste blanche présent dans `install.ps1` n’est qu’un vestige historique, que l’on peut ignorer.

> Désormais, il n’est plus nécessaire de modifier manuellement le `cordis.patch.yml` du profile : le paquet du plugin embarque son propre `dsh.bundle.patch` (fichier `cordis.patch.yml` dans le paquet) ; dès que le `dsh.profile.bundles` du profile contient `dsh-bash-terminal-ts`, DSH effectue le montage automatiquement.

Vérification de l’arbre de composition (sans redémarrage) :

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## Utilisation

**L’utilisateur définit le terminal par défaut dans la Web UI** : ouvrez les réglages (engrenage) → Général → liste déroulante « Terminal par défaut », et choisissez l’un des terminaux PowerShell / Git Bash / MSYS2 / WSL. Le changement prend effet immédiatement et est persisté.

Lorsque le modèle voit l’outil `shell`, l’exécution des commandes utilise automatiquement le terminal que vous avez choisi (l’outil n’expose aucun paramètre de terminal : le modèle ne peut pas changer votre choix) :

- Terminal par défaut = Git Bash : `shell(command: "git status")` passe par Git Bash
- Terminal par défaut = MSYS2 : `shell(command: "gcc --version")` passe par MSYS2 (environnement MINGW64, gcc et make de `/mingw64/bin` disponibles)
- Terminal par défaut = WSL : `shell(command: "ls -la /mnt/d/workspace")` passe par WSL ; `distro: "Ubuntu"` permet de préciser la distribution
- Terminal par défaut = PowerShell : `shell(command: "Get-Process node")` passe par PowerShell

## Exemples d’utilisation par le modèle

- Commande ponctuelle (terminal par défaut) : `shell(command: "git status", description: "查看 git 状态")`
- Conserver l’état entre les tours (interactif) : `terminal(action: "open")` → notez le `sessionId` → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- Interrompre un programme en cours d’exécution : `terminal(action: "signal", sessionId, signal: "SIGINT")`
- Consulter les sessions actives : `terminal(action: "list")`
- Escalade après un refus du bac à sable : `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## Configuration

**Réglages via la Web UI** (recommandé) : Paramètres → Général → « Terminal par défaut ».

Le `config` de la row du plugin (surcharge les valeurs par défaut et sert de base de composition pour les réglages) :

| Clé | Défaut | Description |
|----|------|------|
| `defaultShell` | `powershell` | backend utilisé tant que le réglage ne surcharge pas |
| `timeoutMs` | 120000 | délai d’attente par défaut |
| `maxTimeoutMs` | 600000 | plafond du `timeoutMs` transmis par l’appelant |
| `pwshPath` | détection automatique | chemin figé de pwsh.exe |
| `gitBashPath` | détection automatique | chemin figé de git bash.exe |
| `msys2Path` | détection automatique (`C:\msys64\usr\bin\bash.exe` en priorité, `msys2.exe` en repli) | chemin figé de MSYS2 bash.exe |
| `wslPath` | détection automatique | chemin figé de wsl.exe |

## Publication (npm)

Le compte npm a la vérification de publication 2FA activée ; un code à usage unique est nécessaire :

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <验证码>   # 验证码来自你的认证器
```

Avant de publier, vérifiez le contenu avec `npm pack --dry-run` et lancez `npm run build` pour reconstruire (compilation tsc côté serveur + client bundle + compilation des tests).

## Désinstallation

Il est recommandé de lancer directement :

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

Il supprime les junction, restaure la liste blanche des réglages, nettoie les blocs de montage `cordis.patch.yml` hérités des anciennes versions et retire `dsh-bash-terminal-ts` du `dsh.profile.bundles`. Redémarrez ensuite dsh web, et c’est tout.

En cas de désinstallation manuelle, outre la suppression de `node_modules\dsh-bash-terminal-ts`, pensez également à retirer `dsh-bash-terminal-ts` du `dsh.profile.bundles` du `package.json` du profile.

## Terminal interactif (outil `terminal`)

L’outil `terminal` offre des **sessions interactives persistantes** au-dessus du point d’extension PTY (node-pty ; sous Windows, l’inspecteur de processus du `spawnTerminal` amont ne prenant en charge que POSIX, `lib/terminal.js` dialogue directement avec node-pty, tandis que hors Windows on emprunte toujours le `ctx.subprocess.spawnTerminal` officiel) :

- `action: open` démarre une véritable session de terminal (selon le terminal par défaut que vous avez réglé ; pour wsl, vous pouvez passer `distro`) et renvoie un `sessionId`
- `action: send` écrit l’entrée et lit les nouvelles sorties ; `action: read` lit sans écrire ; `action: signal` envoie un signal au groupe de processus de premier plan (SIGINT = Ctrl+C)
- `action: close` met fin à la session
- **L’état de la session est conservé d’un appel à l’autre** (cwd / variables / alias), idéal pour REPL, ssh et CLI interactifs
- `send` attend que la sortie se stabilise (300ms de silence, plafond 5s) avant de renvoyer la **réponse complète** ; au-delà de 1MB de sortie, un avis `truncated` est signalé
- Une entrée se termine par `\\n` (ou \\r) pour matérialiser la touche Entrée

## Bac à sable (intégration au mécanisme officiel)

L’outil `shell` emprunte le point d’extension sandbox officiel de DSH (`ctx.sandboxPolicy` + `ctx.sandbox`) :

- À chaque appel, la politique de bac à sable courante est résolue ; les sessions `danger-full-access` s’exécutent directement (sans encapsulation).
- Le backend PowerShell encapsule l’argv via `ctx.sandbox.confine` — même sémantique **fail-closed** que l’executor officiel : si le mode confiné est demandé alors qu’aucun backend n’est disponible, une `SandboxUnavailableError` est levée, refusant toute exécution nue.
- Le backend Git Bash n’est pas encapsulé : le runner à jeton restreint Windows ACL de DSH est incompatible avec Cygwin/MSYS2 (bash s’interrompt dès le démarrage avec `CreateFileMapping` Win32 error 5) ; Git Bash ne passe donc pas non plus par l’encapsulation sandbox en mode confiné, et le résultat rapporte `enforcement: gitbash-unconfined`.
- Le backend MSYS2 n’est pas encapsulé non plus (même incompatibilité du runtime Cygwin/MSYS2) ; le résultat rapporte `enforcement: msys2-unconfined`.
- Le backend WSL n’est pas encapsulé : la VM Linux indépendante de WSL constitue en soi l’isolation (le résultat rapporte `enforcement: wsl-isolation`).
- En cas de refus par le bac à sable en mode confiné, le résultat porte le marqueur officiel `[sandbox: file access denied under <mode> mode]` ainsi qu’une invite d’escalade dans le même tour ; le modèle peut déclencher une escalade au moyen de `sandbox_permissions` + `justification` (soumise à l’approbation de l’utilisateur via `ctx.approval`), exactement comme les outils officiels bash/pwsh.
- Remarque : lorsque le runner Windows ACL de DSH est disponible, le mode confiné de PowerShell passe par son intermédiaire ; Git Bash et MSYS2 restent non encapsulés en raison de l’incompatibilité Cygwin/MSYS2.

## ⚠️ Consignes de sécurité

L’outil `shell` en mode confiné : PowerShell est encapsulé via `ctx.sandbox.confine` (fail-closed) ; Git Bash et MSYS2 ne sont **pas encapsulés**, en raison de l’incompatibilité entre Cygwin/MSYS2 et le jeton restreint Windows ACL (mêmes privilèges que le processus dsh) ; WSL n’est pas encapsulé grâce à sa VM Linux indépendante. Cet outil est une **entrée multi-terminal supplémentaire** et ne bénéficie pas des restrictions ConstrainedLanguage de l’outil `pwsh` officiel. Les outils de manipulation de fichiers de DSH (read/write/edit) restent soumis au bac à sable de fichiers. À n’utiliser que dans des sessions de confiance ; lorsque vous avez besoin d’un PowerShell protégé par le bac à sable, continuez d’utiliser l’outil `pwsh` officiel.

## Limitations connues du terminal interactif (ConPTY)

- **PowerShell 5.1 ne peut pas démarrer dans un ConPTY** (0x8009001d) — pour un PowerShell interactif, installez [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (les commandes ponctuelles ne sont pas affectées).
- **Le mode interactif de wsl.exe peut déclencher une erreur RPC du service WSL sous ConPTY** (0x8007072c, intermittent) — les commandes ponctuelles `wsl -e bash -lc ...` fonctionnent normalement ; pour les sessions interactives, privilégiez un vrai terminal (Windows Terminal / terminal WSL) ou réessayez.
- **Sous Windows, node-pty n’accepte pas les signaux nommés** : pour `signal`, `SIGINT` est mappé sur Ctrl+C (`\x03`) ; les autres signaux (`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`) se dégradent en arrêt de la session.
- Les sessions interactives Git Bash fonctionnent parfaitement.

## Limitations connues

- Les processus d’arrière-plan WSL peuvent subsister brièvement dans la distribution après un dépassement de délai ou une interruption (l’instance WSL s’éteint automatiquement une fois le dernier processus terminé).
- Git Bash est un environnement msys2, dont le comportement diffère de celui du Linux de WSL (mappage des chemins, disponibilité des paquets).
- Le backend MSYS2 requiert une installation locale de MSYS2 (`C:\msys64` par défaut) ; à défaut, `shell` signale `backend unavailable`, et `msys2Path` permet de désigner un emplacement personnalisé. L’ordre des candidats reste toujours `bash.exe` d’abord, `msys2.exe` en repli — avec un stdio en pipe, `msys2.exe` renvoie silencieusement zéro octet et ne sert donc qu’en tout dernier recours.
- Ce plugin n’enregistre ses outils que sur la plateforme `win32`.

## Tests

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # 安装依赖（含 typescript）
npm run build        # tsc 编译 src/*.ts → lib/*.js；client.tsx → lib/client.js + dist/client.js；test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

Le code source est en TypeScript (`strict` + `noUncheckedIndexedAccess`) ; les artefacts compilés `lib/` et `dist/` sont commités dans le dépôt et DSH charge directement `lib/index.js` — le plugin est utilisable sans aucune étape d’installation.
