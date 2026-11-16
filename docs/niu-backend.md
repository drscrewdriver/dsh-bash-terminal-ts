# Niubash（niu）第六后端 · 集成记录

> 交付版本：`dsh-bash-terminal-ts@0.9.0` · 分支 `feat/niu-shell-backend` · 2026-11-16
> 本文件记录集成依据、实测证据与已知边界，供后续排障与跨版本适配对照。

## 1. 为什么要加 niu

Git Bash 与 MSYS2 都跑在 MSYS2 的 POSIX 模拟层上，这带来两个结构性代价：

1. **无法被 DSH 的 Windows ACL 受限令牌 runner 包裹**。`src/index.ts` 顶部注释记录：bash 在受限令牌下启动即 `CreateFileMapping … Win32 error 5` 中止，因此二者被设计为 unconfined。也就是说这个插件此前**没有任何一个既跑 POSIX 语法、又守沙箱的后端**。
2. **bash 版本停在 5.2**。Git for Windows 捆绑的是 5.2 线，5.3 的语法不可用。

niu 是 Rust 原生二进制、无 MSYS/Cygwin 模拟 DLL、引擎对齐 GNU Bash 5.3.20 语义，因此是第一个可能同时满足「POSIX 语法」与「受限沙箱」的候选。**但沙箱结论尚未在农场格证实**，见 §5。

## 2. 后端接线面（与 payload 同构的一等后端）

| 接线点 | 文件 | 内容 |
|---|---|---|
| 类型 | `src/shell-id.ts` | `ShellId` 增加 `"niu"` |
| 后端列表 | `src/index.ts` | `SHELLS` 六项 |
| 优先级 | `src/shells.ts` | `["powershell","gitbash","msys2","wsl","niu","payload"]`（niu 在 payload 之前，payload 仍末位兜底） |
| 显示名 | `src/shells.ts` | `LABELS.niu = "Niubash"` |
| 路径槽 | `src/dsh-types.ts` | `ResolvedPaths.niu?: string` |
| 路径探测 | `src/index.ts` | `candidateNiuPaths()` |
| 模型侧 argv | `src/index.ts` | `[niu, "-lc", command]` |
| 交互 argv | `src/terminal.ts` / `src/shells.ts` | `[niu, "-i"]`（读 `~/.niubashrc`） |
| 开关 | `src/index.ts` | `shellNiu`（默认 `true`，检测到即可用） |
| 路径覆写 | `src/index.ts` | `niuPath`（默认 `""` = 自动探测） |
| 开关写回 | `src/webterminals/host.ts` / `mount.ts` | `SWITCH_FIELD.niu = "shellNiu"` |
| 客户端下拉 | `src/client.tsx` | `SHELLS` 六项 |
| 宿主菜单候选 | `cordis.patch.yml` | `- niu.exe` |
| 本地化 | `src/locales.ts` + `locale/*.json` | 九语 `shell.niu` |

### 路径探测顺序

```
%LOCALAPPDATA%\Programs\Niubash\niu.exe     ← 安装器默认落点
%LOCALAPPDATA%\Microsoft\WinGet\Links\niu.exe
%ProgramFiles%\Niubash\niu.exe
PATH 各段 \niu.exe
```

**大小写陷阱**：安装器写入注册表 User Path 的是大写 `Niubash`。首候选必须匹配该大小写——在大小写敏感文件系统上是硬要求（Windows 自身不敏感，但候选表要能解释自己）。

### 菜单候选命名铁律

候选表只能写 `niu.exe`，**绝不能**写 `winuxcmd\bin\bash.exe`。

`discoverShells` 按可执行文件名去重并保留最早一条；`bash.exe` 这个键在 Windows 上已经被 `C:\Windows\System32\bash.exe`（WSL 转发器）占着。一旦把 niu 的 bash 硬链接放进候选表，就会抢走该键并把 WSL 挤出菜单。

## 3. 已修复的阻断级缺陷（0.9.0）

### 3.1 `ShellId` 双份定义漂移

`src/dsh-types.ts` 与 `src/shell-id.ts` 曾各持一份联合类型，前者漏了 `niu`，而 `index.ts` 恰好从前者 import。

后果链：

```
SHELL_DESCRIPTIONS: Record<ShellId, string>   ← 只在 dsh-types 的五值联合下检查
  → 缺 niu 键，编译期不报错
  → toolDescription(true, "niu") 里 lead === undefined
  → 提示词出现双空格空洞（"...is niu; commands run there.   Each call..."）
```

**修法**：`dsh-types.ts` 改为 `export type { ShellId } from "./shell-id.js"`，单一真源。

**防复发**：`test/unit.ts` 的键集断言由手写五元组改为**从运行时 `SHELLS` 派生**：

```ts
assert.deepStrictEqual(Object.keys(SHELL_DESCRIPTIONS).sort(), [...SHELLS].sort());
```

今后任何后端漏写 lead 句都会先让测试变红，而不是静默进提示词。

### 3.2 `SHELL_DESCRIPTIONS` 缺 niu 键

随 3.1 一并修复，同时补 `niu` 专属 lead 句（`niu -lc`、WinuxCmd、bash 5.3、无 MSYS 层、`~/.niubashrc`）。

### 3.3 顺带修掉 main 的 lint 红灯

合入 `origin/main` 后，`test/terminal.ts:222` 的 ANSI 剥离正则触发 `no-control-regex`。该问题自 main 的 `8e2f773` 起就存在——**main 自己的 lint 本来就是红的**。

改为 `String.fromCharCode(27)` 拼 `RegExp`，语义不变。

## 4. 实测证据（本机 Windows，2026-11-16）

### 4.1 niu 运行时

```
$ niu --version
Niubash 1.5.0 — bash-compatible shell for Windows, Linux, macOS, and Android
  rubash   git 29bbf52481c3
  winuxcmd WinuxCmd 1.2.1
```

### 4.2 三形态冒烟

| 形态 | 命令 | 结果 |
|---|---|---|
| 登录 + 命令 | `niu -lc 'echo hi; uname; git --version; ls'` | exit 0，四段输出齐 |
| 非登录 + 命令 | `niu -c 'echo $BASH_VERSION'` | `5.3.20(1)-release` |
| 交互 | `niu -i` | 提示符正常响应 |
| PTY（node-pty） | `niu -i` + `echo PTY_NIU_OK=$BASH_VERSION` | PASS |

`uname` 报 `MSYS_NT-10.0-26300`——**这是为脚本兼容的自称，引擎是原生 Rust**，不能据此推断存在 MSYS 运行时。

`git` 为 `2.56.0.windows.4.niugit`：git-for-windows C 源码用 MSVC 构建，无 launcher 跳转。

### 4.3 路径解析

```
resolved paths: {
  pwsh:    ...WindowsApps\Microsoft.PowerShell_8wekyb3d8bbwe\pwsh.exe
  gitbash: C:\Program Files\Git\bin\bash.exe
  msys2:   C:\msys64\usr\bin\bash.exe
  wsl:     C:\Windows\System32\wsl.exe
  niu:     C:\Users\<you>\AppData\Local\Programs\Niubash\niu.exe   ← 命中
}
buildArgv("niu", "echo hi") → [<niu.exe>, "-lc", "echo hi"]
```

## 5. 已知边界与未决项

### 5.1 沙箱包裹决策（未裁决）

`findings` F2 的假设是「niu 可能能在 confined 模式跑」。本机对照实验**无区分度**（danger-full-access 会话里两种 shell 都 exit 0，未触及 ACL 受限令牌面），结论**既未被证实也未被证伪**。

当前实现：niu 分支**不加 `ctx.sandbox` 包裹**，与 gitbash/msys2/wsl 同为 unconfined。待农场格真 confined 实测后再裁决。

### 5.2 `--ec`（base64 命令传输）未落地

niu 支持 `niu --ec <base64>`，可规避 Windows 引号重写、`$` 展开、反斜杠塌缩、CRLF 转换。但 `-l` 与 `--ec` 能否叠加未验证，且 base64 会降低失败可读性。先以 `-lc` 跑通，加固留待后续。

### 5.3 无 digest 门禁

与 `payload` 的严格姿态不一致：payload 要求 SHA-256 命中内置台账或 operator 信任文件，niu 只是运行时探测的外部可执行文件。可复现性依赖用户机器上装的是哪个版本。当前策略是**记录**（`niu --version` 打一行日志）而非**拦截**。

## 6. Git Bash 5.2 vs Niubash 5.3 · 差分实测

本机对照（36 项探针），结论：**语法层面只差一条**，其余差异在工具实现来源与环境标识。

### 6.1 唯一的语法级差异

```
${ cmd; }   无 fork 命令替换
  Git Bash 5.2.37 → /usr/bin/bash: line 1: ${ echo A; }: bad substitution
  Niubash  5.3.20 → x=A
```

### 6.2 工具实现差异（不影响写脚本，影响探测式脚本）

| 项 | Git Bash | Niubash |
|---|---|---|
| `uname -s` | `MINGW64_NT-10.0` | `MSYS_NT-10.0`（兼容自称） |
| `sed --version` | `GNU sed 4.9` | `WinuxCmd 1.2.1` |
| `command -v sed` | `/usr/bin/sed` | `sed`（裸名） |
| `git --version` | `2.53.0.windows.1` | `2.56.0.windows.4.niugit` |
| `/dev/tty` | `No such device or address` | 可用（映射到 console） |
| 工具来源 | `/usr/bin` + `/mingw64/bin`（GNU 8.32） | `winuxcmd\usr\bin`（182 个 exe） |

**`sed` / `cat` / `cp` / `rm` 在 niu 里是 shell emulation**（`type sed` → `is a shell emulation of …\sed.exe`），而 `grep` / `awk` / `find` / `ls` / `mv` 是真 exe。实测行为几乎一致（`-i` 备份、`y///`、hold space、分支、`-A`、`-n` 全过），但 `--version` 暴露身份。

### 6.3 完全一致的部分（29/36）

POSIX 核心全套（`[ ]` / `$()` / for / case / while read / 函数 / `set -eu` / trap）、bash 扩展全套（数组 / 关联数组 / `[[ ]]` / 进程替换 / 花括号 / herestring）、路径双形态、`name=value` 不翻译、`/dev/null`、`/dev/stdin`、`sed -i`、后台作业 `&` / `wait $!`。

### 6.4 两边都有的坑（非 niu 独有）

`nohup <builtin>` 会 127：`nohup true` / `nohup :` 两边都报 `failed to run command`，因为 builtin 不是可执行文件。外部命令两边都正常。

## 7. 验证门禁

```
npm run build   → exit 0
  ARTIFACT GATES PASS: client 508KB, no node leaks, xterm bundled,
  css inlined, ws external, 9 locale files, 46 dictionary keys none dead
npm test        → exit 0（七件全绿，含真 node-pty 交互会话）
npm run lint    → exit 0
```

## 8. 预设面

`agent-presets/standard-win-niu/` 提供「标准模式 (Windows-Niubash)」模板：

- `preset.yml`：显示名与描述
- `agent.cordis.yml`：persona 锚定 niu 语法族别（bash 5.3 / WinuxCmd / 无 MSYS 层 / `~/.niubashrc` / `/dev/null` 唯一设备翻译）

安装：`node agent-presets/install-presets.mjs --name standard-win-niu`

**注意**：预设只写提示词，**不绑定 `defaultShell`**。要让会话真的跑在 niu 上，仍需在 Settings → General → Default terminal 选择 Niubash（或把 `defaultShell: niu` 写进 profile 配置）。这与 `standard-win-payload` 的「opt-in 两次」是同一套哲学。

## 9. 发版记录

- 版本：`0.8.8` → `0.9.0`（新增后端属 minor）
- 双清单同步：`package.json` 与 `dsh.plugin.json` 版本号一致，description 双语均含 Niubash
- CHANGELOG：`0.9.0 (2026-11-16)` 节
