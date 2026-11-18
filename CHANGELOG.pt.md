# Changelog

## 0.7.0 (2026-09-29)

- **Linha de compatibilidade DSH 0.2.0** (branch `compat/0.2.0`, dist-tag npm `dsh-0.2.0`): os 11 ranges peer `@deepseek-ai/dsh-*` passam em bloco para `>=0.2.0-rc.1 <0.2.1-0` (a linha 0.1.7 fica congelada em `compat/0.1.7` seguindo para servir os hosts antigos, sem ser afetada). O 0.2.0-rc.1 é totalmente compatível com a API de plugins da 0.1.7; esta linha não muda nada de código, é uma adaptação puramente de metadados.
- **Atualização sincronizada de devDependencies**: os 15 pacotes `dsh-*` fixados com precisão em `0.1.7-rc.2` (11 homônimos dos peer + scope / subprocess / sandbox-policy / http-proxy) → `0.2.0-rc.1`, de modo que o build/test de um checkout limpo continue representativo frente a um host 0.2.0.
- **Lockfile no repositório**: este branch remove do `.gitignore` a linha que ignorava `package-lock.json`; o lockfile atualizado após a atualização da árvore de dependências é enviado junto (a linha 0.1.7 mantém o ignore atual).
- **Metadados de publicação**: versão 0.6.4 → 0.7.0; `publishConfig.tag` `dsh-0.1.7` → `dsh-0.2.0`; `version` e `engines.dsh` do `dsh.plugin.json` atualizados em conformidade.
- **Reordenação da matriz de compatibilidade do README** (bilíngue zh/en): adicionadas as linhas 0.1.7 e 0.2.0, corrigida a narrativa desatualizada de «nomes de pacote distintos» (as linhas agora compartilham o nome de pacote `dsh-bash-terminal-ts` e são distinguíveis por dist-tag); a seção de instalação é atualizada para o duplo critério 0.1.7-rc.1 / 0.2.0-rc.1.
- **Verificação**: `npm install` / `build` / `test` todos no verde (4 suítes unit / apply / client / terminal), `npm ls` sem conflitos de peer.

## 0.6.4 (2026-09-26)

- **Causa raiz da falha de carga corrigida (resíduo da troca de nome do pacote)**: o pacote já havia sido renomeado para `dsh-bash-terminal-ts`, mas o `name` da entrada bundle do `cordis.patch.yml` ainda apontava para o `dsh-bash-terminal` pré-bifurcação. O carregador da 0.1.7 resolve módulos por nome, então a falha era inevitável (`failed to import loader entry (dsh-bash-terminal)`); nem uma fiber era criada, e nem a montagem a quente nem um reinício recuperavam. Agora o `name` da entrada coincide com o nome do pacote e a ativação funciona normalmente sob DSH 0.1.7.
- **Bifurcação completa do nome do projeto**: o `id` / `name` do `dsh.plugin.json`, o id de registro do cliente, `install.ps1` (caminhos junction, nome do bundle, textos de ajuda), bem como os caminhos e descrições do projeto em README / CONTRIBUTING / documento de compatibilidade passam todos para `dsh-bash-terminal-ts`; ficam inalterados apenas `MAXeaglet/dsh-bash-terminal` (referência ao repositório upstream) e o id da entrada de ferramenta `tool-bash-terminal`. A regex de limpeza do uninstall do `install.ps1` passa a `dsh-bash-terminal(-ts)?`, de modo que os blocos legados do formato antigo continuem removíveis.
- **Robustez do cliente**: a página de ajustes mostra uma linha «indisponível» (com dicas de diagnóstico) quando o host não fornece a entrada `configForms` deste plugin, em vez de ficar em branco em silêncio.

## 0.3.18 (não publicado)

- **Sincronização da linha de compatibilidade DSH 0.1.5** (esta linha mantém `ts/0.1.5`): as mudanças independentes aplicadas à linha 0.1.2 após a bifurcação foram verificadas uma a uma e transferidas para esta linha.
- **Manifesto padrão concluído**: adicionados `dsh.plugin.json` (`id` / `components` / `engines`) e `screenshots.json`, ambos incluídos na allowlist `files`.
- **Fechamento de `engines`**: `node` sobe de `>=20` para `>=22` e é adicionado `engines.dsh` = `>=0.1.5-alpha.1 <0.2.0-0` (antes era justamente esta linha que carecia dessa declaração).
- **Correção da atribuição de identidade do pacote**: `author` / `repository` / `bugs` / `homepage` passam do fork upstream (MAXeaglet/dsh-bash-terminal) para este repositório (drscrewdriver/dsh-bash-terminal-ts).
- **Typecheck possível em checkout limpo**: as devDependencies são completadas com os pacotes peer do DSH (fixados com exatidão em `0.1.5-rc.2`). Antes da correção, o `tsc` reportava `TS7006` (`revision` / `writable` any implícito em `src/client.tsx`) — os peer só estavam declarados em `peerDependencies` e como opcionais, então o `npm install` não instalava nada. Como o `dsh-shell@0.1.5-rc.1` ainda declara o peer `0.1.2-rc.1`, instalar a árvore exigia `--legacy-peer-deps`.
- **`react-dom` adicionado como devDependency**: antes o `react` era resolvido a partir deste repositório enquanto o `react-dom/server` caía na cópia aninhada da árvore de instalação do DSH; o `renderToString` recebia duas instâncias React diferentes e o test do cliente falhava com “Objects are not valid as a React child”. Após o complemento, `react` e `react-dom` são ambos 18.3.1 e os testes passam.
- **Decisão consciente de não renomear**: esta linha mantém o nome de pacote `dsh-bash-terminal-ts` (não segue o `dsh-bash-terminal-ts` da linha 0.1.2), de modo que as duas linhas possam coexistir na instalação sem colidir pela identidade do pacote.
- **Verificação (testado em local)**: `npm run build` exit 0; `test-dist/{unit,apply,client}.js` exit 0 cada; `test-dist/terminal.js` executado à parte exit 0 (3/3 superados). O smoke MSYS2 do `unit` **roda de verdade** e extrai `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `/usr/bin/bash`: a semântica de ambiente MSYS2, razão de ser desta linha, fica confirmada de ponta a ponta.
- **Falha ambiental conhecida (não introduzida por esta linha)**: o 4.º segmento do `npm test` encadeado (`terminal.js`) reporta `AttachConsole failed` em console não interativa (sem Console ao qual se prender); na baseline sem modificações reproduz-se igual.

## 0.3.17 (2026-09-13)

- **MSYS2 se torna o 4.º backend de terminal** (ordem de `SHELLS`: powershell / gitbash / msys2 / wsl). `Config` adiciona `msys2Path`, cabeado via `resolveAllPaths`; `SHELL_DESCRIPTIONS.msys2` e `toolDescription` completados com a descrição do backend.
- **Ajuste de MSYS2 concluído (cliente)**: a linha «Terminal padrão» da UI web antes oferecia apenas powershell / gitbash / wsl — o backend MSYS2 existia, mas o frontend não permitia escolhê-lo. `src/client.tsx` adiciona a opção `msys2` e os textos bilíngues de `shell.msys2` (MSYS2 é nome próprio, idêntico em chinês e inglês).
- **Correção do stdio por pipe no MSYS2**: `C:\msys64\msys2.exe` é um lançador Cygwin que aloca console; com stdio por pipe ele retorna exit 0 e zero bytes (stdout/stderr em 0 bytes, medido com MSYS2 bash 5.3.15), então qualquer comando MSYS2 ficava mudo, sem saída. A ordem de candidatos passa a ser: primeiro `C:\msys64\usr\bin\bash.exe` → `bin\bash.exe` → entradas mingw64/msys64 do PATH, com `msys2.exe` rebaixado a rede de segurança no fim da lista.
- **Login shell do MSYS2**: o `buildArgv` usa `-lc` em vez de `-c`; somente o login shell faz source do `/etc/profile`, adicionando `/usr/bin` e `/mingw64/bin` ao PATH (com um `-c` pelado, `bash` resolve para `C:\Windows\System32\bash.exe`, e `gcc`/`make` dão ambos command not found).
- **Ambiente MSYS2**: o `buildEnv` injeta `MSYSTEM=MINGW64` (o valor explicitamente passado pelo usuário tem prioridade) para que o gcc e o make de `/mingw64/bin` entrem no PATH; o env das sessões interativas da ferramenta `terminal` fica alinhado a esse comportamento.
- **Sandbox do MSYS2**: como o Git Bash, sem envasamento (o runner de token restrito com ACL do Windows é incompatível com Cygwin/MSYS2); o resultado informa `enforcement: msys2-unconfined`.
- **O env do terminal interativo passa pelo `buildEnv`**: o `src/terminal.ts` antes montava seu próprio env, contornando a injeção de MSYSTEM do `buildEnv` — resultado: a ferramenta `shell` funcionava, mas o **terminal interativo** msys2 não tinha `/mingw64/bin` (`/etc/profile` configurava o PATH para o ambiente MSYS padrão). Agora: `buildEnv(shell, ctx.shellEnv.collect(exec), process.env.WSLENV)` — obtém a injeção de MSYSTEM e não duplica mais a lógica de WSLENV. O terceiro parâmetro precisa ser passado explicitamente: o `spawnTerminal` substitui por completo o ambiente do processo filho via `childEnv(spec.env)`, de modo que o WSLENV do ambiente continuaria invisível.
- **WSL `WSLENV`: acumular em vez de reconstruir**: o WSLENV é a allowlist transfronteiriça do WSL; o código antigo a reconstruía apenas a partir do `dshEnv`, perdendo as entradas já presentes no ambiente (em local `WSLENV=WT_SESSION:WT_PROFILE_ID:`, exportado pelo Windows Terminal), que deixariam de entrar no WSL. Agora se acumula sobre os valores herdados: dividir por `:` e filtrar as entradas vazias (o valor herdado termina em `:`, a mera concatenação de strings produziria entradas vazias), excluir a própria chave `WSLENV` (também é uma chave do `dshEnv`, adicioná-la produziria `...:WSLENV`); o WSLENV que o chamador passa explicitamente tem prioridade sobre os herdado.
- **Terminal interativo**: o `terminalArgv("msys2")` usa `-l`. Não dá para manter `-lc`: aquele argv não leva comando (o PTY é em si a sessão), e um `bash -lc` sem operandos sai imediatamente com `-c: option requires an argument` (exit 2).
- **Bundle do cliente reproduzível**: o `scripts/build-client.mjs` antes deixava o esbuild procurar o tsconfig subindo desde `src/client.tsx`; um build dentro do repositório achava o `tsconfig.json` raiz e emitia uma linha `"use strict";` a mais, o que um build de worktree fora do repositório não fazia — o mesmo código-fonte produzia dois artefatos commitados diferentes. Agora fixa explicitamente `tsconfigRaw: { compilerOptions: { target: "ES2022", useDefineForClassFields: true } }` (ou seja, os valores de fato vigentes do tsconfig raiz); a única diferença observável é o desaparecimento daquela linha `"use strict";`.
- **Proteção contra regressões**: o `test/unit.ts` confere o argv `-lc` do msys2, a injeção de `MSYSTEM` com prioridade do valor do usuário, que `bash.exe` deva vir antes de `msys2.exe` e a semântica de acumulação do `WSLENV` (as entradas herdadas são preservadas / não há entradas vazias / `WSLENV` em si não é adicionado / o valor explícito vence), mais uma checagem smoke de spawn real (stdout não vazio e com `/mingw64/bin/gcc`; 0 bytes = falha); o `test/apply.ts` confere o argv/env do msys2, o `msys2-unconfined` e a estrutura do WSLENV; o `test/terminal.ts` confere o argv interativo e o cabeamento do PTY env via `buildEnv`, e abre uma **sessão msys2 real com node-pty** (checagens de `MSYSTEM=MINGW64`, `/mingw64/bin/gcc`, `BASH=/usr/bin/bash`); o `test/client.ts` ganha um guardião anti-deriva — para cada `SHELLS` do host confere se a lista do bundle do cliente e as entradas de menu renderizadas coincidem (ordem incluída) e se tanto o dicionário chinês quanto o inglês têm `shell.<id>`. Cada um desses guardiões foi contrastado no sentido inverso (quebrar o artefato de build → a checagem falha → no verde após restaurar).
## 0.3.16 (2026-09-12)

- **Reescrita TypeScript integral**. Lado servidor `lib/index.js` / `lib/terminal.js` → `src/index.ts` / `src/terminal.ts`; cliente `src/client.jsx` → `src/client.tsx`; testes `test/*.mjs` → `test/*.ts` (compilados para `test-dist/` e executados de lá). `tsc --strict` + `noUncheckedIndexedAccess` tudo no verde.
- Os contratos do plugin para as costuras do DSH são reduzidos a tipos estruturais escritos à mão (`src/dsh-types.ts`); os imports de valor dos pacotes peer passam todos pela ponte de estreitamento `src/dsh.ts`, a deriva de versões dos peer não vaza mais no código reescrito.
- Cadeia de build: `npm run build` = `tsc` (servidor → `lib/`) + `tsc -p tsconfig.client.json` (checagem de tipos do cliente) + esbuild (`src/client.tsx` → `lib/client.js` + `dist/client.js`) + `tsc -p tsconfig.test.json`. Os artefatos `lib/` e `dist/` continuam enviados ao repositório, e o caminho de carga `lib/index.js` por parte do DSH não muda.
- Superfície de exportação preservada à risca (`name` / `inject` / `Config` / `apply` / `SHELLS` / `DEFAULT_SHELL` / `SETTINGS_NAMESPACE` / `internals`), comportamento em execução idêntico ao da 0.3.15; apenas foram removidas uma função morta `pathResolve` inalcançável no fim de terminal.js e o import sem uso `MAX_TIMER_DELAY_MS`.

## 0.3.15 (2026-09-11)

- **Adaptação ao DSH 0.1.5-rc.1**. A tabela de módulos do cliente (`PLATFORM_MODULES`) renomeia `@deepseek-ai/dsh-client-runtime` para `@deepseek-ai/dsh-client-store` e só captura por **nome pelado exato** (sem subrota `/client`, sem reserva à fábrica do pacote). O bundle do cliente antes fazia `require("@deepseek-ai/dsh-client-runtime/client")`, sob 0.1.5 uma falha garantida → a GUI web caía no boot com `Failed to load plugins / require(...) missed the module table`. Agora usa `@deepseek-ai/dsh-client-store`, e os 4 require do bundle (`react`, `react/jsx-runtime`, `dsh-client-store`, `dsh-client-ui-primitives`) caem todos dentro da tabela-semente da plataforma, sem necessidade de `dsh.client.external`.
- O `dsh.client.inject` é atualizado com os nomes reais dos pacotes de cliente existentes na 0.1.5 (`dsh-client-locale`, `dsh-client-ui-settings`, `dsh-api-remotes`).
- A costura de settings do servidor não exporta mais `settingsNamespace()` (desde 0.1.5, `register(ns: string, schema, { base })` recebe direto a string de namespace); o invólucro foi retirado em conformidade e o código vale para as duas gerações de API, 0.1.0/0.1.5.
- `peerDependencies` alinhadas com `^0.1.5-rc.1` (`dsh-sandbox` adicionado, realmente dependido; `cordis` sobe para `^4.0.2`); o test do cliente ganha uma asserção anti-regressão: o bundle não deve voltar a conter `dsh-client-runtime`.
- O patch da allowlist de settings do `install.ps1` ganha uma sonda de existência: o 0.1.5 não tem mais allowlist codificada à mão, o script não reescreve mais o arquivo do host por substituições sem casamento (o único efeito era adicionar-lhe um BOM).
- O Git Bash deixa de ser envasado via `ctx.sandbox.confine`: o runner de token restrito com ACL do Windows do DSH é incompatível com Cygwin/MSYS2 (o bash aborta no boot com o erro Win32 5 de `CreateFileMapping`); agora o Git Bash também corre sem envasamento em modo restrito, e o resultado informa `enforcement: gitbash-unconfined`. Corrige #6.

## 0.3.14 (2026-08-14)

- A linha de ajustes reflete agora exatamente a EnterBehaviorRow incluída: disposição da linha (título + descrição terciária à esquerda, seletor de cápsula à direita), disparador de cápsula de 36px (`--dsw-alias-bg-module-platform`, radius 18px, estado hover) com chevron, Menu em portal com `align="end"`. CSS injetado da mesma forma que as linhas de primeira parte.
- A frase descritiva «(由你决定，AI 无法更改)» foi removida.

## 0.3.13 (2026-08-14)

- A linha de ajustes segue a gramática das linhas da seção Geral incluída (empilhamento em coluna, filete inferior de 1px via `--dsw-alias-border-l2`, padding vertical de 16px, título de 14px/400) — coincide com a disposição da linha Appearance.

## 0.3.12 (2026-08-14)

- **UI nativa orientada ao usuário**: a linha «Terminal padrão» de Configurações → Geral agora é renderizada com primitivas nativas do DSH (`Menu` + `Button` + `IconCodeOutline16`) em lugar de um simples `<select>` HTML — tem exatamente a mesma aparência e comportamento de um ajuste de primeira parte. O test do cliente renderiza a linha via React real (renderToString) com primitivas simuladas.

## 0.3.11 (2026-08-14)

- Ferramenta `terminal`: o WSL interativo sobre a distribuição padrão agora usa `wsl -- bash -i` (o `-e` pelado falha sob ConPTY com o erro RPC 0x8007072c do serviço WSL); um `-d <distro>` explícito mantém `-e`. Verificado: pwd → /mnt/d/WorkSpace.
- Correções de CI: a asserção do argv do wsl usa SystemRoot (sem diferenciar maiúsculas); os testes client/terminal resolvem react + node-pty entre ambientes (a CI os instala no-save); o test interativo de wsl tolera ambientes sem distribuição.

## 0.3.10 (2026-08-14)

- O install.ps1 migra o perfil para a instalação por bundle oficial (adiciona `dsh-bash-terminal-ts` ao `dsh.profile.bundles` e remove a inserção manual legada), escrevendo o package.json sem BOM UTF-8 (o BOM do `Set-Content` do PS 5.1 quebrava o JSON.parse do DSH). Perfil web atual verificado: o bundle fornece a entrada `tool-bash-terminal` via `--dump-config`.

## 0.3.9 (2026-08-14)

- **Manifesto de bundle oficial**: o pacote agora declara `dsh.bundle.patch` (traz seu próprio `cordis.patch.yml`); um perfil que liste `dsh-bash-terminal-ts` em `dsh.profile.bundles` aplica a montagem automaticamente — verificado com um perfil temporário + `--dump-config` (a entrada aparece sem nenhum patch manual do perfil).

## 0.3.8 (2026-08-14)

- Cobertura de testes: a execução em segundo plano do `shell` registra um job com hooks `cancel` / `done` / `readOutput` funcionais (13 casos apply/execute no total).

## 0.3.7 (2026-08-14)

- Ferramenta `terminal`: as leituras agora esperam a saída assentar (300 ms de silêncio, teto de 5 s) em vez de um retardo fixo, de modo que o `send` devolve a resposta COMPLETA (verificado: saída multilinha completa, p. ex. `seq 1 8`).

## 0.3.6 (2026-08-14)

- Cobertura de testes: a abertura do `terminal` com comando inicial (execução imediata em um shell novo) e a forma dos hooks do job (cancel / done / readOutput) verificadas contra uma sessão real de node-pty.

## 0.3.5 (2026-08-14)

- Ferramenta `terminal`: o estouro do buffer é reportado (flag `truncated` + aviso “[terminal buffer overflowed; oldest output dropped]”) para que uma sessão muito ativa nunca perca o histórico em silêncio.

## 0.3.4 (2026-08-14)

- Ferramenta `terminal`: as sessões WSL agora levam as variáveis de ambiente DSH_* via WSLENV, em sintonia com a ferramenta `shell`.

## 0.3.3 (2026-08-14)

- Ferramenta `terminal`: a nova ação `list` enumera as sessões ativas (sessionId / shell / pid) para a gestão multissessão.

## 0.3.2 (2026-08-14)

- Teto de sessões: no máximo 8 sessões de terminal simultâneas (além disso: falha rápida).
- Verificação interativa multi-backend: Git Bash (completo), limites ConPTY documentados do PowerShell 5.1 e do wsl.exe (0x8009001d / 0x8007072c; pwsh 7 e os comandos de tiro único -lc funcionam).
- README (zh/en): limitações conhecidas do terminal interativo.

## 0.3.1 (2026-08-14)

- As sessões de terminal são registradas no registro genérico de jobs (jobId na abertura; `job_kill` / `job_output` funcionam sobre elas).
- Tempo de espera por ociosidade: as sessões se fecham sozinhas após 10 minutos sem send/read/signal (configurável via `idleMs` na abertura) para que PTYs abandonados nunca deixem árvores de processos escapando.

## 0.3.0 (2026-08-14)

- **Ferramenta de terminal interativo (`terminal`)**: sessões PTY persistentes sobre a costura oficial `ctx.subprocess.spawnTerminal` (node-pty). Ações: `open` / `send` / `read` / `signal` (Ctrl+C etc.) / `close`. O estado do shell (cwd, variáveis, aliases) persiste entre chamadas; o backend segue o ajuste do terminal padrão do usuário. Verificado com uma sessão interativa real de Git Bash via node-pty (cd + pwd + echo + SIGINT + close).

## 0.2.3 (2026-08-14)

- Cobertura de testes fail-closed (um backend de sandbox indisponível recusa a chamada).
- Documentação da sandbox no README.
- CI com GitHub Actions (suítes unit / apply / client em windows-latest).

## 0.2.2 (2026-08-14)

- **Renderização oficial das recusas**: uma chamada envasada cujo stderr casa com as assinaturas de recusa do runner informa `sandbox.denied: true`, e a saída orientada ao modelo leva os marcadores oficiais exatos — `[sandbox: file access denied under <mode> mode]` mais a dica de escalada do mesmo turno.

## 0.2.1 (2026-08-14)

- **Superfície oficial de escalada da sandbox**: a ferramenta `shell` agora anuncia `sandbox_permissions` / `justification` (o contrato exato de tool-bash / tool-pwsh): uma chamada recusada pode ser tentada de novo uma vez com o modo mais amplo mais estreito possível, roteada via `ctx.approval` (`approveEscalation`), com validação estrita de alargamento.

## 0.2.0 (2026-08-14)

- **Integração da sandbox (costura oficial)**: a ferramenta `shell` resolve a política de sandbox do DSH em cada chamada (`ctx.sandboxPolicy`) e envasa o argv de PowerShell / Git Bash através de `ctx.sandbox` — a mesma semântica fail-closed `SandboxUnavailableError` dos executores incluídos. O WSL corre sem envasar (o isolamento por VM Linux dele É a sandbox). Os dados da sandbox (`sandbox.mode` / `sandbox.enforcement`) viajam nos resultados de primeiro plano.
- **Preferência do modelo**: a seção do system prompt do plugin indica aos agentes que prefiram a ferramenta `shell` ao `pwsh` para comandos de terminal; a descrição da ferramenta encabeça com o terminal padrão escolhido pelo usuário.

## 0.1.0 (2026-08-14)

Lançamento inicial.

- Ferramenta `shell`: executar comandos através de PowerShell / Git Bash / WSL no Windows.
- O terminal padrão é escolhido pelo usuário nos ajustes da UI web (Configurações → Geral → Terminal padrão); o modelo não pode sobrescrevê-lo.
- Execução em segundo plano pelo registro genérico de jobs (`run_in_background` / `job_output` / `job_kill`).
- O plugin cliente registra a linha de ajustes; o plugin host lê o ajuste do usuário em cada chamada.
- install.ps1: instalação junction, montagem cordis.patch.yml e patch automático da allowlist de settings dsh-host-apiproxy (limitação do DSH; ver README).
