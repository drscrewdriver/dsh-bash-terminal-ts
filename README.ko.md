# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> 커뮤니티: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

DSH(DeepSeek Harness) 플러그인: Windows에서 **PowerShell / Git Bash / MSYS2 / WSL** 네 종류의 터미널 명령을 통합 실행하는 `shell` 도구입니다.

> **이 저장소는 `MAXeaglet/dsh-bash-terminal`의 TypeScript 재작성**이며, 동작하는 MSYS2/MINGW64 지원을 갖추고 있습니다. 두 개의 호환 라인이 있습니다:
>
> | 브랜치 | DSH 구간 | 패키지 이름 | 상태 |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | 현재 브랜치. `build` / `unit` / `apply` / `client` / `terminal` 모두 로컬에서 통과 |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | TypeScript 재작성 메인라인 |
>
> **두 라인은 의도적으로 서로 다른 패키지 이름을 사용**하므로, 함께 설치해도 서로를 덮어쓰지 않습니다. 사용 중인 DSH 버전에 맞는 브랜치를 선택하세요.

| 백엔드 | 실제 실행 | 문법 / 경로 | 환경 변수 |
|------|----------|-------------|----------|
| `powershell`(기본값) | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell; `C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX; `/d/workspace`; PATH에 `/usr/bin`, `/mingw64/bin` 포함 | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>` (`C:\msys64\usr\bin\bash.exe`) | POSIX; `/c/...`; PATH에 `/usr/bin`, `/mingw64/bin`(gcc / make) 포함 | `$NAME` (`MSYSTEM=MINGW64` 자동 주입) |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux; `/mnt/d/...` | `$NAME` (WSLENV 경유) |

호출할 때마다 완전히 새로운 shell이 시작됩니다. **상태는 유지되지 않습니다**(cwd / 변수 / 별칭) — `cd`를 사용하는 대신 `workdir`을 전달하세요.

## UI 미리보기

설정 → 일반의 '기본 터미널' 행: 사용자가 PowerShell / Git Bash / MSYS2 / WSL 중에서 선택하며, `shell` 도구는 이 설정에 따라서만 실행됩니다. 모델은 이를 재정의할 수 없습니다:

![기본 터미널 설정 행](assets/shells.png)

## 설계 포인트

- **터미널은 사용자가 결정하며 AI는 변경할 수 없습니다**: Web UI 설정 페이지(설정 → 일반)에 '기본 터미널' 드롭다운(PowerShell / Git Bash / MSYS2 / WSL)이 표시됩니다. `shell` 도구는 항상 이 설정만 사용하며, 터미널 인자는 모델에 노출되지 않습니다. 설정은 DSH settings 시스템을 통해 영구 저장됩니다(settings.yaml).
- **`ctx.shell` 기능 접합부를 점유하지 않습니다**: DSH 기본 제공 샌드박스 `pwsh` 도구는 그대로 사용할 수 있으며, 이 플러그인의 `shell` 도구는 **추가적인** 멀티 터미널 진입점입니다.
- 공유되는 `ctx.subprocess` seam을 통해 프로세스를 생성합니다: 프로세스 트리 종료(Windows `taskkill /T`), SIGTERM→grace→SIGKILL, 출력 spill 파일 등은 공식 `dsh-tool-bash` / `dsh-tool-pwsh`와 동일하게 동작합니다.
- 백그라운드 작업은 범용 `jobs` registry에 등록되며, `run_in_background` / `job_output` / `job_kill`을 지원합니다.
- 프런트엔드 설정 페이지의 '기본 터미널'은 enum이며(UI가 자동으로 드롭다운으로 렌더링), 모델은 호출 시마다 이 설정에 따라서만 실행하고 스스로 터미널을 전환할 수 없습니다.

## 설치 (web profile)

### 표준 설치 (npm 배포 후, 공식 bundle 메커니즘)

플러그인은 공식 `dsh.bundle` manifest(패키지 내 `cordis.patch.yml`)를 포함하고 있어, profile에 이 패키지가 등록되면 DSH가 **마운트를 자동 적용**합니다. profile 설정을 손으로 수정할 필요가 없습니다:

```powershell
# 1. 플러그인 패키지 설치
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # profile의 bundles에 자동 추가되고 patch를 적용

# 2. DSH 설정 허용 목록 patch (DSH 제한 사항, 아래 설명 참조)
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. dsh web 재시작
```

> 임시 profile로 실측 확인: `bundles: [dsh-bash-terminal-ts]` → dump-config에 `tool-bash-terminal` entry가 자동으로 나타납니다.

### pnpm 사용자 참고: node-pty 빌드 스크립트 허용

이 플러그인은 대화형 터미널 구현을 위해 네이티브 PTY 라이브러리인 [`node-pty`](https://www.npmjs.com/package/node-pty)(마이크로소프트가 관리하며 VS Code와 동일한 라이브러리)에 의존하므로, 설치 시 컴파일 스크립트를 실행해야 합니다. npm은 기본적으로 의존성의 install 스크립트를 실행하므로 아무 작업도 필요하지 않습니다. **pnpm ≥10은 기본적으로 이를 차단**하며, `pnpm add` 마지막에 다음 오류가 보고됩니다:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

이 시점에 패키지 자체는 설치되어 있지만 네이티브 바인딩이 컴파일되지 않아 `terminal` 도구(대화형 터미널)의 시작이 실패합니다. 한 번만 허용해 주면 됩니다:

```powershell
pnpm approve-builds      # 대화형으로 node-pty 선택
# 또는 profile의 package.json에 선언한 뒤 재빌드:
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> 자체 dsh 플러그인 가운데 **네이티브 의존성을 포함한 것은 이 플러그인뿐**입니다. 나머지 0.2.0 라인 플러그인(search-index, session-steward, patch-edit-plus, browser-cdp, date-wrapper)과 live-token-stats는 모두 순수 JS 패키지이므로 approve-builds 없이도 pnpm에 바로 설치됩니다.

### 로컬 개발 설치 (junction 직접 연결, 소스 수정 즉시 반영)

```powershell
# 1. 플러그인 패키지를 profile의 node_modules에 링크 (junction, 소스 수정 즉시 반영)
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. 플러그인이 @deepseek-ai/* 의존성을 해석할 수 있도록 함 (profile의 의존성 트리로 junction — 플러그인과 호스트가 동일한 모듈 인스턴스를 공유)
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. profile이 공식 bundle 메커니즘으로 플러그인을 마운트하도록 함 (install.ps1 install이 자동 수행. dsh.profile.bundles에 "dsh-bash-terminal-ts"를 추가하는 것과 동일)
# 4. (프런트엔드 소스를 수정한 경우에만) client bundle 재패키징:
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. dsh web 재시작
```

> ⚠️ **이 프로젝트에서 `npm install`을 실행하지 마세요**: 위 2단계의 junction을 삭제하고 플러그인에 **독립적인**
> `@deepseek-ai/*` 사본을 설치해 버립니다 — 플러그인과 호스트가 더 이상 모듈 인스턴스를 공유하지 않게 되어,
> 호스트를 업그레이드한 뒤에도 플러그인이 구버전 API에 머무르게 됩니다(이 프로젝트도 한때 이 때문에 0.1.0-rc.6에 머문 적이 있습니다). lock만 갱신할 때는 `npm install --package-lock-only`를 사용하세요.

> **호환성**: DSH ≥ **0.1.5-rc.1** 필요. 0.1.5에서는 브라우저 모듈 테이블의 `@deepseek-ai/dsh-client-runtime`이
> `@deepseek-ai/dsh-client-store`로 이름이 변경되었으며 정확한 bare name으로만 매칭됩니다. 구버전 bundle은 새 호스트에서
> `Failed to load plugins` / `require(...) missed the module table` 오류가 발생합니다.
>
> 참고: 0.1.5의 Web 설정 화면은 `settings.describe()` 동적 enum 방식으로 바뀌어 **namespace 허용 목록이 더 이상 없습니다**
> (`settings-not-exposed`는 더 이상 존재하지 않음). `install.ps1`의 허용 목록 patch는 단지 역사적 잔재이므로 무시해도 됩니다.

> 이제 profile의 `cordis.patch.yml`을 수동으로 수정할 필요는 없습니다: 플러그인 패키지에 `dsh.bundle.patch`(패키지 내 `cordis.patch.yml`)가 포함되어 있어, profile의 `dsh.profile.bundles`에 `dsh-bash-terminal-ts`만 있으면 DSH가 자동으로 마운트합니다.

구성 트리 검증 (재시작 불필요):

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## 사용법

**사용자가 Web UI에서 기본 터미널을 설정합니다**: 설정(톱니바퀴) → 일반 → '기본 터미널' 드롭다운을 열어 PowerShell / Git Bash / MSYS2 / WSL 중 하나를 선택합니다. 변경 사항은 즉시 적용되며 영구 저장됩니다.

모델은 `shell` 도구를 인식한 뒤 명령 실행 시 자동으로 사용자가 선택한 터미널을 사용합니다(도구가 터미널 인자를 노출하지 않으므로 모델은 사용자의 선택을 변경할 수 없습니다):

- 기본 터미널 = Git Bash일 때: `shell(command: "git status")`는 Git Bash로 실행됩니다
- 기본 터미널 = MSYS2일 때: `shell(command: "gcc --version")`는 MSYS2로 실행됩니다 (MINGW64 환경, `/mingw64/bin`의 gcc와 make 사용 가능)
- 기본 터미널 = WSL일 때: `shell(command: "ls -la /mnt/d/workspace")`는 WSL로 실행되며, `distro: "Ubuntu"`를 전달하면 배포판을 지정할 수 있습니다
- 기본 터미널 = PowerShell일 때: `shell(command: "Get-Process node")`는 PowerShell로 실행됩니다

## 모델 사용 예시

- 일회성 명령(기본 터미널): `shell(command: "git status", description: "git 상태 확인")`
- 여러 턴에 걸쳐 상태 유지(대화형): `terminal(action: "open")` → `sessionId`를 기록 → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- 실행 중인 프로그램 중단: `terminal(action: "signal", sessionId, signal: "SIGINT")`
- 활성 세션 확인: `terminal(action: "list")`
- 샌드박스 거부 후 권한 상승: `shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## 설정

**Web UI 설정**(권장): 설정 → 일반 → '기본 터미널'.

플러그인 row의 `config`(기본값을 덮어쓰며, 설정의 composition 기준이 됨):

| 키 | 기본값 | 설명 |
|----|------|------|
| `defaultShell` | `powershell` | 설정이 덮어쓰지 않을 때 사용하는 백엔드 |
| `timeoutMs` | 120000 | 기본 타임아웃 |
| `maxTimeoutMs` | 600000 | 호출자 timeoutMs의 상한 |
| `pwshPath` | 자동 감지 | pwsh.exe 경로 고정 |
| `gitBashPath` | 자동 감지 | git bash.exe 경로 고정 |
| `msys2Path` | 자동 감지 (`C:\msys64\usr\bin\bash.exe` 우선, `msys2.exe` 폴백) | MSYS2 bash.exe 경로 고정 |
| `wslPath` | 자동 감지 | wsl.exe 경로 고정 |

## 배포 (npm)

npm 계정에는 2FA 게시 검증이 활성화되어 있어 일회용 인증 코드가 필요합니다:

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <인증코드>   # 인증 코드는 본인의 인증기에서 확인
```

배포 전에 `npm pack --dry-run`으로 내용물을 확인하고, `npm run build`를 실행해 재빌드합니다(tsc 서버 사이드 컴파일 + client bundle + 테스트 컴파일).

## 제거

다음을 직접 실행하는 것을 권장합니다:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

이 명령은 junction을 삭제하고, 설정 허용 목록을 복원하며, 구버전이 남긴 `cordis.patch.yml` 마운트 블록을 정리하고, `dsh.profile.bundles`에서 `dsh-bash-terminal-ts`를 제거합니다. 이후 dsh web을 재시작하면 됩니다.

수동으로 제거할 때는 `node_modules\dsh-bash-terminal-ts`를 삭제하는 것 외에, profile `package.json`의 `dsh.profile.bundles`에서 `dsh-bash-terminal-ts`를 제거하는 것도 잊지 마세요.

## 대화형 터미널 (terminal 도구)

`terminal` 도구는 PTY 접합부(node-pty; Windows에서는 업스트림 `spawnTerminal`의 process inspector가 POSIX만 지원하므로 `lib/terminal.js`가 node-pty에 직접 연결되고, 비 Windows에서는 여전히 공식 `ctx.subprocess.spawnTerminal`을 사용함) 위에서 **지속형 대화형 세션**을 제공합니다:

- `action: open`은 실제 터미널 세션을 시작하고 `sessionId`를 반환합니다(설정된 기본 터미널 기준; wsl은 `distro` 지정 가능)
- `action: send`는 입력을 쓰고 새 출력을 읽습니다; `action: read`는 쓰지 않고 읽기만 합니다; `action: signal`은 포그라운드 프로세스 그룹에 시그널을 보냅니다(SIGINT = Ctrl+C)
- `action: close`는 세션을 종료합니다
- **세션 상태는 호출 간에 유지됩니다**(cwd / 변수 / 별칭). REPL, ssh, 대화형 CLI에 적합합니다
- `send`는 출력이 안정되기를 기다린 뒤(300ms 무음, 최대 5s) **전체 응답**을 반환합니다. 출력이 1MB를 초과하면 `truncated` 안내를 표시합니다
- 입력은 `\\n`(또는 \r)으로 끝내면 Enter로 처리됩니다

## 샌드박스 (공식 메커니즘 연동)

`shell` 도구는 DSH 공식 샌드박스 접합부(`ctx.sandboxPolicy` + `ctx.sandbox`)를 사용합니다:

- 호출 시마다 현재 샌드박스 정책을 해석합니다. `danger-full-access` 세션은 (래핑 없이) 그대로 실행합니다.
- PowerShell 백엔드는 `ctx.sandbox.confine`으로 argv를 래핑합니다 — 공식 executor와 동일한 **fail-closed** 시맨틱: 제한 모드가 요청되었는데 사용 가능한 백엔드가 없으면 `SandboxUnavailableError`를 던지며, 래핑 없이 실행되는 것을 거부합니다.
- Git Bash 백엔드는 래핑하지 않습니다: DSH의 Windows ACL 제한 토큰 runner는 Cygwin/MSYS2와 호환되지 않아(bash가 시작하자마자 `CreateFileMapping` Win32 error 5로 종료됨) 제한 모드에서도 Git Bash는 샌드박스 래핑을 거치지 않습니다. 결과는 `enforcement: gitbash-unconfined`로 보고됩니다.
- MSYS2 백엔드도 마찬가지로 래핑하지 않습니다(동일한 Cygwin/MSYS2 런타임 비호환). 결과는 `enforcement: msys2-unconfined`로 보고됩니다.
- WSL 백엔드는 래핑하지 않습니다: WSL의 독립 Linux 가상 머신 자체가 곧 격리입니다(결과는 `enforcement: wsl-isolation`으로 보고됩니다).
- 제한 모드에서 샌드박스에 의해 거부되면 결과에 공식 마커 `[sandbox: file access denied under <mode> mode]`와 동일 턴 권한 상승 안내가 함께 담깁니다. 모델은 `sandbox_permissions` + `justification`으로 한 번 권한 상승을 시도할 수 있으며(`ctx.approval`을 통한 사용자 승인), 공식 bash/pwsh 도구와 완전히 동일합니다.
- 주의: DSH의 Windows ACL runner를 사용할 수 있는 경우 PowerShell의 제한 모드는 이 runner로 래핑됩니다. Git Bash와 MSYS2는 Cygwin/MSYS2 비호환 때문에 래핑 없이 유지됩니다.

## ⚠️ 보안 참고

`shell` 도구의 제한 모드 동작: PowerShell은 `ctx.sandbox.confine`으로 래핑됩니다(fail-closed). Git Bash와 MSYS2는 Cygwin/MSYS2가 Windows ACL 제한 토큰과 호환되지 않아 **래핑되지 않습니다**(dsh 프로세스와 동일한 권한). WSL은 독립 Linux VM이므로 래핑되지 않습니다. 이 도구는 **추가적인 멀티 터미널 진입점**이며, 공식 `pwsh` 도구의 ConstrainedLanguage 제한은 적용되지 않습니다. DSH의 파일 조작 도구(read/write/edit)는 여전히 파일 샌드박스의 제약을 받습니다. 신뢰할 수 있는 세션에서만 사용하고, 샌드박스 보호가 필요한 PowerShell에는 공식 `pwsh` 도구를 계속 사용하세요.

## 대화형 터미널의 알려진 제한 (ConPTY)

- **PowerShell 5.1은 ConPTY에서 시작할 수 없습니다**(0x8009001d) — 대화형 PowerShell에는 [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) 설치가 필요합니다(일회성 명령은 영향을 받지 않습니다).
- **wsl.exe 대화형 모드는 ConPTY 환경에서 WSL 서비스 RPC 오류를 일으킬 수 있습니다**(0x8007072c, 간헐적) — 일회성 `wsl -e bash -lc ...` 명령은 정상입니다. 대화형 세션은 Windows Terminal / WSL 터미널을 직접 사용하거나 재시도하는 것이 좋습니다.
- **Windows에서 node-pty는 이름 있는 시그널을 받지 않습니다**: `signal`의 `SIGINT`는 Ctrl+C(`\x03`)로 매핑되며, 그 외의 시그널(`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`)은 세션 종료로 격하됩니다.
- Git Bash 대화형 세션은 완전히 정상 동작합니다.

## 알려진 제한

- WSL 백그라운드 프로세스는 타임아웃/중단 후 배포판 내에 잠시 남아 있을 수 있습니다(WSL 인스턴스는 마지막 프로세스가 종료되면 자동으로 닫힙니다).
- Git Bash는 msys2 환경이므로 WSL의 Linux 동작과 차이가 있습니다(경로 매핑, 패키지 가용성).
- MSYS2 백엔드는 로컬에 MSYS2가 설치되어 있어야 합니다(기본 `C:\msys64`). 설치되어 있지 않으면 `shell`이 `backend unavailable`을 보고하며, `msys2Path`로 사용자 지정 위치를 지정할 수 있습니다. 후보 탐색 순서는 언제나 `bash.exe` 우선, `msys2.exe` 폴백입니다 — `msys2.exe`는 파이프 stdio 환경에서 무음으로 0바이트를 반환하므로 최후의 수단으로만 사용하세요.
- 이 플러그인은 `win32` 플랫폼에서만 도구를 등록합니다.

## 테스트

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # 의존성 설치 (typescript 포함)
npm run build        # tsc 컴파일: src/*.ts → lib/*.js, client.tsx → lib/client.js + dist/client.js, test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

소스는 TypeScript(`strict` + `noUncheckedIndexedAccess`)이며, 빌드 산출물인 `lib/`, `dist/`는 저장소에 함께 커밋되어 있어 DSH가 `lib/index.js`로 바로 로드합니다. 별도 설치 없이 바로 사용할 수 있습니다.
