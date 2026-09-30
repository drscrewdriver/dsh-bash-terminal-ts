# 설치 가이드(공식 DSH CLI)

이 가이드는 공식 DSH `dsh plugin` 명령만 사용합니다. 이 명령은 의존성을 profile에 설치하고 `dsh.profile.bundles`를 동기화합니다. 일반 `npm install`, profile에서 직접 실행하는 `pnpm add`, profile 매니페스트 수동 편집으로 대체하지 마세요. 단, 이 가이드가 해당 방식을 명시적으로 다루는 경우(§1의 pnpm node-pty 승인, dist-tag 라인 선택, §3의 로컬 개발 설치)는 예외입니다.

- [한국어 설치 안내](./INSTALL.ko.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Français README](./README.fr.md)
- [Deutsch README](./README.de.md)
- [Italiano README](./README.it.md)
- [Русский README](./README.ru.md)
- [Español README](./README.es.md)
- [Changelog](./CHANGELOG.md)

이 가이드에서 사용하는 자리표시자:

- `<profile>`: 수정할 DSH profile. 보통 `web` 또는 `desktop`;
- `dsh-bash-terminal-ts`: npm 패키지 이름이자 런타임 플러그인 ID.

> **버전 요구 사항 — 사용 중인 DSH에 맞는 라인을 선택하세요.**
>
> 먼저 실행 중인 버전을 확인하세요(`dsh --version`).
>
> | DSH 버전 | 플러그인 라인 | npm 선택자 |
> | --- | --- | --- |
> | 0.1.5 – 0.1.7 | 0.1.7 라인 | `dsh-bash-terminal-ts` (latest, 예: `0.6.4`) |
> | ≥ 0.2.0-rc.1 | 0.2.0 라인 | `dsh-bash-terminal-ts@0.7.0` (dist-tag `dsh-0.2.0`) |
>
> 두 라인은 동일한 패키지 이름으로 배포되며 dist-tag로 공존합니다. `latest`는 0.1.7 라인을, `dsh-0.2.0`은 0.2.0 라인을 가리킵니다. 따라서 `dsh-bash-terminal-ts`만 입력하면 **0.1.7** 라인이 설치됩니다. 0.2.0 라인은 반드시 명시적 버전 또는 dist-tag로 선택해야 하며, 그렇지 않으면 플러그인의 peers(`>=0.2.0-rc.1`)가 0.2.0 호스트와 일치하지 않습니다.

## 0. 사전 준비와 profile 확인

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

실행 중인 DSH 프로세스가 사용하는 profile을 사용하세요. `web`이 일반적이지만, 실제 `--profile` 인자가 우선합니다.

대화형 `terminal` 도구는 `node-pty`에서 동작하며, `node-pty`는 이 패키지의 의존성으로 자동 설치됩니다. pnpm으로 관리되는 profile은 승인 절차가 하나 더 필요합니다. §1을 참고하세요.

## 1. 공식 설치

0.1.7 라인(패키지 이름만 사용):

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts -w
```

0.2.0 라인(명시적 버전):

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts@0.7.0 -w
```

(`web`처럼 profile이 pnpm workspace root인 경우 `-w` 플래그가 필요합니다.)

공식 CLI는 profile 의존성, 잠금 파일, `dsh.profile.bundles`를 자동으로 갱신합니다. 이 패키지는 자체 `dsh.bundle.patch`(`cordis.patch.yml`, `tool-bash-terminal` 항목 삽입)를 포함하고 있으므로 profile을 수동으로 편집할 필요가 없습니다.

`install.ps1 install`(설정 UI 허용 목록 패치)은 **레거시**입니다. DSH 0.1.5부터 설정 클라이언트가 설정을 동적으로 나열하므로(`settings.describe()`) 현재 호스트에서는 허용 목록 패치가 필요하지 않습니다. DSH 0.1.2–0.1.4를 사용하는 경우가 아니라면 무시하세요.

### pnpm 관리 profile: node-pty 빌드 스크립트 승인

pnpm ≥ 10은 기본적으로 의존성 설치 스크립트를 차단하며, `node-pty`는 설치 스크립트에서 네이티브 바인딩을 컴파일합니다. 따라서 `pnpm add`(또는 pnpm이 주도하는 모든 설치)는 다음 오류와 함께 끝납니다:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

패키지는 설치되지만 네이티브 바인딩이 빌드되지 않은 상태이므로, 대화형 `terminal` 도구가 시작에 실패합니다. 한 번만 승인하세요:

```bash
pnpm approve-builds      # pick node-pty interactively
```

또는 profile의 `package.json`에 선언한 뒤 재빌드하세요:

```json
"pnpm": { "onlyBuiltDependencies": ["node-pty"] }
```

```bash
pnpm rebuild node-pty
```

npm으로 관리되는 profile은 영향을 받지 않습니다. npm은 기본적으로 의존성 설치 스크립트를 실행합니다.

이것이 플러그인에서 유일한 네이티브 의존성이므로, 다른 빌드 스크립트 승인은 필요하지 않습니다.

## 2. 업그레이드

```bash
dsh plugin --profile <profile> update dsh-bash-terminal-ts -w
```

0.2.0 라인은 `update`가 `latest` 태그(0.1.7 라인)를 따르므로 새 버전을 명시적으로 지정하세요(`dsh plugin --profile <profile> add dsh-bash-terminal-ts@<version> -w`).

호스트 변경 사항은 DSH를 재시작하고, 클라이언트 변경 사항은 웹 페이지를 하드 새로고침(Ctrl+Shift+R)하여 적용하세요. 업그레이드로 `node-pty` 버전이 올라가면 pnpm이 빌드 스크립트를 다시 차단할 수 있습니다. 이 경우 §1의 승인을 다시 실행하세요(`onlyBuiltDependencies`가 이미 선언되어 있다면 `pnpm rebuild node-pty`를 다시 실행하는 것으로 충분합니다).

## 3. 로컬 개발 설치(junction) — 대안

개발 시에는 로컬 체크아웃을 링크하여 소스 변경이 즉시 반영되도록 할 수 있습니다. 저장소 루트에서:

```bash
# 1. Link the plugin into the profile's node_modules (junction):
#      New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "<repo path>"
# 2. Let the plugin resolve @deepseek-ai/* from the profile's dependency tree (junction),
#    so plugin and host share one module instance.
# 3. List "dsh-bash-terminal-ts" in dsh.profile.bundles.
# 4. After client-side source changes only: node scripts/build-client.mjs
# 5. Restart dsh.
```

⚠️ 플러그인 저장소 안에서는 `npm install`을 실행하지 **마세요**. `@deepseek-ai/*` junction이 비공개 복사본으로 대체되어 플러그인이 호스트와 모듈 인스턴스를 공유하지 않게 됩니다(이후 호스트 API 업그레이드에 뒤처집니다). 잠금 파일 갱신은 `npm install --package-lock-only`로만 하세요.

전체 단계별 명령은 [README 개발 섹션](./README.md#本地开发安装junction-直连改源码即时生效)에 있습니다.

## 4. 설치 검증

의존성과 설치된 버전 확인:

```bash
grep -n "dsh-bash-terminal-ts" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/package.json').version"
```

네이티브 바인딩이 실제로 빌드되었는지 확인:

```bash
node -e "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/node_modules/node-pty')"
```

(출력이 없으면 성공입니다. 오류가 나오면 빌드 스크립트가 건너뛰어진 것이므로 §1을 참고하세요.)

공식 구성 확인:

```bash
dsh --profile <profile> --dump-config | grep tool-bash-terminal
```

`tool-bash-terminal` 항목(패키지의 `cordis.patch.yml`이 삽입)이 포함되어야 합니다.

## 5. 플러그인 검증

DSH를 재시작한 뒤 웹 페이지를 새로고침하세요. 다음을 확인:

1. 설정 → 일반에 "기본 터미널" 드롭다운이 표시됨(PowerShell / Git Bash / MSYS2 / WSL);
2. 모델이 `shell` 도구를 인식하고 선택한 터미널을 통해 명령을 실행함;
3. `terminal` 도구가 지속되는 대화형 세션을 엶(셸 상태가 호출 간에 유지됨).

## 6. 트러블슈팅

| 증상 | 조치 |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: node-pty` | 빌드 스크립트를 승인(§1): `pnpm approve-builds` 또는 `onlyBuiltDependencies` + `pnpm rebuild node-pty`. |
| `terminal` 도구를 열 때 오류 | node-pty 바인딩이 빌드되지 않음 — 위와 동일한 조치. |
| 대화형 PowerShell이 `0x8009001d`로 실패 | PowerShell 5.1은 ConPTY에서 시작할 수 없음. [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) 설치(단발성 명령은 영향 없음). |
| `shell`이 `msys2`에 대해 `backend unavailable` 보고 | MSYS2 설치(기본값 `C:\msys64`) 또는 기존 설치 경로를 `msys2Path`로 지정. |
| 플러그인이 오류 없이「비활성화/미마운트」로 표시됨 | profile 구성 확인(§4). peers 범위가 호스트 라인과 일치해야 함(§ 버전 표). |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | dsh 런타임의 pnpm 정책이 방금 게시된 버전을 차단함. profile의 `pnpm-workspace.yaml`에 있는 `minimumReleaseAgeExclude`에 해당 버전을 추가. |
| 업그레이드 후 오래된 client bundle 표시 | 브라우저 하드 새로고침(Ctrl+Shift+R). |

## 7. 제거

공식 명령 사용:

```bash
dsh plugin --profile <profile> remove dsh-bash-terminal-ts
```

이후 DSH를 재시작하세요. `shell` / `terminal` 도구는 사라지며 DSH 자체의 셸 도구는 영향을 받지 않습니다.
