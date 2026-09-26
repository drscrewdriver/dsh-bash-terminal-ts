# 终端适配模式模板

把 `dsh-bash-terminal-ts` 里那套「一个 `shell` 工具、多种本地终端」的做法抽出来，供你直接复用。

- [`terminal-adapter.ts`](./terminal-adapter.ts) — 四种模式已填好的适配器模块，零依赖（只用 `node:fs` / `node:path`），整份复制或只挑一种都行。
- 本文件 — 每种模式的要点、踩过的坑，以及怎么加第五种。

> **本目录已做过分发前清理**：不含作者本机路径、主机名、凭据。示例路径统一写成 `D:\workspace\your-plugin` 这类占位形式。
> 拷进你自己仓库前，请照做一遍。

## 四种模式

| 模式 | 实际执行 | 语法 / 路径 | 环境变量 | 可沙箱封闭 |
|------|----------|-------------|----------|------------|
| `powershell`（默认） | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell；`C:\...` | `$env:NAME` | ✅ |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX；`/d/...`；PATH 含 `/usr/bin`、`/mingw64/bin` | `$NAME` | ❌ |
| `msys2` | MSYS2 `bash -lc <cmd>`（`C:\msys64\usr\bin\bash.exe`） | POSIX；`/c/...`；PATH 含 `/usr/bin`、`/mingw64/bin`（gcc / make） | `$NAME`（自动注入 `MSYSTEM=MINGW64`） | ❌ |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux；`/mnt/d/...` | `$NAME`（经 `WSLENV`） | ❌（隔离即沙箱） |

## 每种模式的要点

### 1. Windows 标准模式（PowerShell）

- **探测顺序**：`%ProgramFiles%\PowerShell\7\pwsh.exe` → PATH 里各目录的 `pwsh.exe` → `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。PowerShell 7 优先，5.1 只作兜底。
- **必须带 `-NonInteractive`**：否则命令里任何一处隐含提示都会把采集挂死。工具收到的是一条完整脚本，不是 REPL 会话。
- **唯一可被沙箱封闭的模式**。走你平台的沙箱门面包装 spawn argv；封闭模式拿不到可用后端时要 **fail-closed 抛错**，不要降级成不封闭。

### 2. Git Bash

- **`-lc` 不是 `-c`**：`-l` 会 source `/etc/profile`，`/usr/bin`、`/mingw64/bin` 才进 PATH。用裸 `-c`，`git`、`ssh`、`tr`、`sed` 全是 command not found。
- **必须排除 System32 的 `bash.exe`** —— 这是这套适配里最容易踩的坑。装了 WSL 的机器上 `C:\Windows\System32\bash.exe` 也存在，但它是 **WSL 转发器**，不是 Git Bash。一旦选中，Git Bash 模式的命令会被静默送进 Linux VM，`/d/...` 路径和 Git for Windows 的工具链全都不存在，而报错信息完全指不到根因。
- **不可沙箱封闭**：DSH 的 Windows ACL restricted-token runner 起不了 Cygwin/MSYS2 进程，bash 启动阶段就 `CreateFileMapping ... Win32 error 5` 中止。硬套沙箱 = 每条命令都失败。
- 安装位置：`%ProgramFiles%\Git\bin\bash.exe`、`%ProgramFiles%\Git\usr\bin\bash.exe`、`%LOCALAPPDATA%\Programs\Git\bin\bash.exe`（按用户安装）。

### 3. MSYS2

- **`-lc` 同 Git Bash**，理由一致。
- **`MSYSTEM=MINGW64` 要自动补上**：`/etc/profile` 靠它把 `/mingw64/bin`（gcc / make）挂进 PATH。不设的话 MSYS2 落在裸 MSYS 环境，工具链整个看不见。调用方显式传了值就尊重调用方。
- **`msys2.exe` 不能当后端**：它是分配控制台的 Cygwin 启动器，用管道 stdio spawn 出来会**退出码 0、stdout/stderr 都是零字节**——每条命令都"成功且无输出"。模板里把它留在候选表最后只作兜底，正常 `bash.exe` 永远优先。
- **不可沙箱封闭**，原因同 Git Bash（同一套 Cygwin/MSYS2 运行时）。

### 4. WSL

- **`-e bash -lc <cmd>`**：`-e` 直接执行、不经额外的 shell 包装，引号能原样穿过边界。指定发行版时插 `-d <distro>`。
- **`WSLENV` 是白名单，只能叠加、不能重建**：只有列在 `WSLENV` 里的变量才进得了 WSL。宿主本来可能已经有值（Windows Terminal 会导出 `WT_SESSION:WT_PROFILE_ID:`），重建会把这些静默丢掉，用户的终端会话变量就断了。
- **叠加时要按 `:` 切分再拼**，不能字符串直接拼——宿主值结尾带一个 `:`，直接拼会多出一个空条目。同时要把 `WSLENV` 这个 key 自己排除，否则会再加一条无意义条目。
- **`wsl.exe` 不用探测**：它是 Windows 组件，固定位置 `%SystemRoot%\System32\wsl.exe`，视为恒存在。
- **它的隔离本身就是沙箱**，再包一层是多余的；如实上报 `wsl-isolation`。

## 加第五种模式

以加一个 `cmd.exe` 为例：

1. 在 `SHELLS` 里加 id，`ShellId` 会自动带上它（`as const` 联合）。
2. 在 `ADAPTERS` 里补一条：`label`、`summary`、`toolDescription`、`candidates()`、`configKey`、`confinable`。
3. 在 `buildArgv` 里加一个 `case`。**保留 `default` 分支的 `never` 穷尽检查**——漏了分支会在编译期报错，而不是运行时掉进某个诡异的默认行为。
4. 在 `buildEnv` 里加该模式需要的环境修正（有就加，没有就跳过）。
5. 在 `confinementFor` / `shouldConfine` 里表个态：能不能封闭，不能的话上报哪个 `*-unconfined` 标签。
6. 配置 schema 里补对应的 `*Path` 覆盖项（可为空串 = 自动探测）。
7. 设置面板下拉里加一项，**顺序与 `SHELLS` 保持一致**。
8. 补测试：探测顺序、argv 组装、env 修正各至少一条。

## 接进 DSH

模板本身不依赖 DSH，接线时用到这几个接缝：

| 接缝 | 用途 |
|------|------|
| `ctx.subprocess.spawn` / `spawnTerminal` | 派生进程；进程树终止、SIGTERM→grace→SIGKILL、输出 spill |
| `ctx.jobs` | 后台任务句柄（`run_in_background` / `job_output` / `job_kill`） |
| `ctx.sandboxPolicy.resolve` | 每次调用解析当次沙箱策略 |
| `ctx.sandbox.confine` | 仅 PowerShell 走这里；失败要 fail-closed |
| `ctx.shellEnv.collect` | 采集要下发的环境变量 |
| `ctx.settings` + `settings.general.item` 槽 | 「默认终端」设置行 |

**设计上的一个刻意选择**：这套实现**不占用 `ctx.shell` 能力接缝**。平台自带的沙箱化 `pwsh` 工具保持原样可用，本工具是一个**额外的**、由用户选择的终端入口，两者并存。

**另一条硬规矩**：终端由**用户**在 Web UI 里选，模型不能改。工具不把终端参数暴露给模型——否则「用户设定」形同虚设。

## 许可

与仓库一致：MIT。
