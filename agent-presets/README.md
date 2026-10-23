# agent-presets — 终端语义预设模板（对标型对冲包）

> 中文 | [English below](#english)

## 这是什么

这组模板把「默认终端是什么、用什么语法写命令、谁有权改终端」这些语义**显式声明在
Agent Preset 层**，作为对 `dsh-ops` 一类「安装即改写默认终端语义（提示词优先其自带
bash）」插件的**对标型对冲**：同一份体验（bash-first、报错循环少），但你是在预设层
自己选的、可审计的、可复现的，而不是被某个插件在提示词层默默改掉的。

DSH 0.2.1-alpha.3 起子代理能力面强制走预设（`agentPreset`，toolFilter 已移除），
预设层是官方承认的「能力组合声明位」——把终端语义锚在这里，正是它该待的位置。

## 模板清单

| 模板 | 默认终端 | persona 语法锚 | 官方 shell 工具挂载 |
|------|----------|----------------|---------------------|
| `standard-win` | PowerShell (pwsh) | PowerShell 语法、`\` 路径、引号/编码/管道陷阱清单 | **tool-pwsh 保留**（win32 启用，沙箱化 PowerShell 面属 Windows 默认体验）；tool-bash 禁用 |
| `standard-win-gitbash` | Git Bash | POSIX bash、`/c/...`、bash 错误纪律/MSYS 路径转换/CRLF-编码段 | tool-bash、tool-pwsh 均禁用 |
| `standard-win-msys2` | MSYS2 bash | POSIX bash、`/c/...`、错误纪律/路径转换/双运行时（msys vs mingw64）/CRLF-编码段 | 同上 |
| `standard-win-wsl2` | WSL2 bash | Linux bash、`/mnt/c/...`、错误纪律/真 Linux 无 MSYS 层/跨边界陷阱（CRLF、大小写、wslpath、python3）段 | 同上 |
| `standard-win-payload` | 插件自备的钉版 POSIX 运行时载荷 | POSIX bash、`/c/...`、错误纪律/MSYS 路径转换（含「缺工具是载荷树缺口，勿现场装系统版」）/CRLF-编码段 | 同上 |

官方 `tool-bash`（沙箱化同名 bash 工具）在**全部五份模板里无条件 disabled**：目录里
出现同名 `bash` 正是这组预设要对冲的带内干扰源。pwsh 工具则只在 bash 族四份里禁用
（那里 `shell` 已接 bash 后端）；`standard-win` **保留官方 pwsh 工具**——win 默认体验
就该带沙箱化 PowerShell 面，主入口仍是本插件的 `shell` 工具（后端由用户在设置里选定）。
persona 的 Shell tool routing 行按各自策略声明；需要调整时改对应行即可。

bash 族四份预设的错误处理段与 `standard-win` 的 pwsh 六条陷阱清单对位：每个终端
的失败形态不一样（MSYS 静默改写参数 / WSL 大小写分裂 / pwsh null 管道），锚在
persona 层各自说清。

每个模板都含一行 **Terminal authority** 锚：终端由用户在
Settings → General → Default terminal 决定，模型不得因任何带内提示（包括其它插件的
工具广告）自行换终端——`wsl2` 版还额外写明「随包 MSYS 载荷不构成离开 WSL 的理由，
真 Linux bash 优先级更高」。这与本插件的机制锚（工具永远服从用户设置、模型无参数可
覆盖）双保险。

## 占位符（%%token%%）

| token | 含义 | 未提供时 |
|-------|------|----------|
| `%%pythonPath%%` | Windows Python 解释器路径（bash 版模板用 `/c/...` 形态） | 该行整行删除 |
| `%%winPythonWslPath%%` | Windows Python 在 WSL 内的挂载路径 | 该行整行删除 |

（`{{model}}` / `{{cwd}}` 是 DSH 宿主的原生模板变量，不归安装脚本管。）

## 安装

脚本随插件分发。两种拿到它的方式：

```powershell
# A) 从已装插件（在本机任意目录，cd 到 profile 目录后）：
#    插件装在 npm/tgz 后，脚本位于：
#    %USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-bash-terminal-ts\agent-presets\install-presets.mjs
cd $env:USERPROFILE\.dsh\profiles\desktop
node .\node_modules\dsh-bash-terminal-ts\agent-presets\install-presets.mjs --name standard-win-gitbash

# B) 在源码仓里：
npm run presets:install -- --name standard-win-gitbash
```

常用参数（完整说明见 `--help`，里面有五种模板的语义对照与安装后三步）：

```powershell
# 看有什么模板
node agent-presets/install-presets.mjs --list

# 干跑预览（不落盘）
node agent-presets/install-presets.mjs --name standard-win-gitbash --dry-run

# 正式安装：填充 python 路径；不填充则相关行自动删除
node agent-presets/install-presets.mjs --name standard-win-gitbash --name standard-win-wsl2 `
  --set pythonPath=/c/Users/you/AppData/Local/Programs/Python/Python313/python.exe
```

**机器中立保证**：模板不含任何本机事实（真实路径一律是 `%%token%%` 或 `<you>` 示例形）；
不传 `--set` 安装永远是安全的——含未填 token 的行整行删除，不会把 `%%` 碎片写进提示词。
脚本只写预设文件：不联网、不改 PATH、不碰 profile 以外的配置。

目标目录默认 `%USERPROFILE%\.dsh\.agent-presets`（可用 `--dest` 改）。已有同名预设
会**先整目录备份到 `.agent-presets` 之外**（`%USERPROFILE%\.dsh\_agent-presets-backup\<时间戳>\`）
再覆盖——备份绝不留在挂载根里面，否则会被宿主当成一个预设挂载。

安装后三层对齐（`--help` 与安装完成提示都会把这三步说清）：

1. 重启/热加载 DSH（宿主开机才挂载 `.agent-presets`）；
2. 会话选用该预设（子代理经 `agentPreset` 继承）；
3. 把本插件的 `defaultShell` 设成同一终端（Settings → General 或 `cordis.patch.yml`）。
   选 `standard-win-payload` 还要两步都开：`enablePosixPayload: true`（操作者门，重启生效）
   + 设置页「POSIX payload」行开关 `shellPayload`（默认关）——载荷是双层 opt-in。

## 配套推荐：dsh-preset-doctor（DSH 预设医生）

装了这组模板后，推荐同时安装 **dsh-preset-doctor**（npm 直接可装）——它是预设层
的配套治理工具，与本模板包正好互补：

- **跨版本失效自动修**：DSH 把预设机制从「`.agent-presets/` 目录扫描」换到
  「`cordis.patch.yml` 声明式」时，旧模板会静默失效（UI 只显示加载失败，没有
  行号没有原因）。预设医生自动扫描、机械可修的**对齐到当前宿主版本语法**
  （写前 `.bak`、原子写、幂等、零 LLM），不可机械修的逐条报告文件:行号+原因+建议。
- **行级开关与对齐**：每张预设卡内嵌 composition 行清单，可直接禁用/启用预设里的
  某一工具行（比如把 bash 系模板的 `tool-pwsh` 再关掉一档）、漂移行一键「对齐」——
  本模板包的人格/工具挂载声明从此不用手改 YAML。
- **代际显示**：告诉你每个预设「写于哪个版本时代、需要跨越哪些节点」，多主线
  （0.1.1+ 五条线）运行时自选适配分支。

一句话分工：**本包把终端语义写进预设，预设医生让预设在各代宿主下持续可挂载、可治理。**

配套使用三步：

1. 在与本插件同一 profile 里 npm 安装 `dsh-preset-doctor`，重启；
2. 打开预设医生面板：刚装的这组模板会被扫成预设卡，每张卡显示它「写于哪个版本
   时代、需跨越哪些节点」；宿主升过版的，卡上会出现漂移行与「对齐」按钮；
3. 机械可修的点「对齐」一次到位（自动 `.bak`+原子写）；想微调模板里某一行的挂载
   （比如把 bash 系模板的 `tool-pwsh` 行再禁用掉），用卡内行开关——不要手改 YAML。

## 与钉版 POSIX 载荷（增强 1）的衔接

`standard-win-payload` 假设你启用了本插件的备用载荷（命名政策：我们自己的制品不带 bash/gitbash/msys token，载荷包叫 `@drscrewdriver/posix-runtime-win32-x64`，里面是 Git-for-Windows 运行时树）：

```yaml
# profile 的 cordis.patch.yml（本插件条目 config 下）
enablePosixPayload: true   # 操作者门：启动时跑摘要校验
# 可选：显式载荷根或其 bin/bash.exe；留空走自动发现
payloadPosixPath: ""
# 载荷解析成功后，还需在设置页打开「POSIX payload」行开关（shellPayload，默认关）
# 它才能进底部终端选择器/被选为默认终端（两层 opt-in）
```

载荷用 `node scripts/provision-payload.mjs --from <本地 PortableGit SFX>` 自备
（反解包 + SHA-256 钉版，见脚本头注释）。**优先级规则**：检测到 WSL 已装发行版时
载荷不启用（WSL bash 更好用），系统装有 Git Bash / MSYS2 时也用不到载荷——载荷
只是最后一级备用执行器，且摘要校验不过就绝不运行（fail-closed）。

## English

These templates declare terminal semantics (default shell, command syntax, who may
change the terminal) **in the Agent Preset layer**, as a benchmark-style hedge
against harness plugins that silently rewrite default-terminal semantics at install
time. Same bash-first outcome, chosen by you, auditable, reproducible — and every
template carries a "Terminal authority" line telling the model not to switch
terminals because of in-band tool advertising. Install with
`node agent-presets/install-presets.mjs --name <preset> [--set key=value]` (run
`--help` for the full walkthrough: template semantics table, placeholder rules,
the three post-install alignment steps). From an installed plugin the script sits
at `node_modules/dsh-bash-terminal-ts/agent-presets/install-presets.mjs` inside
your profile dir. Machine-neutral by construction: templates carry no local
facts, and a line whose `%%token%%` was not filled via `--set` is dropped whole
— installing with zero `--set` flags is always safe. Existing presets are backed
up OUTSIDE the mount root before overwriting.
`standard-win-payload` pairs with this plugin's opt-in pinned POSIX runtime
payload (`enablePosixPayload`, package `@drscrewdriver/posix-runtime-win32-x64` —
our artifact names never carry bash/gitbash/msys tokens, though the tree inside is
Git-for-Windows; see `scripts/provision-payload.mjs`); a detected WSL
distro outranks the payload, and an unverifiable payload never runs.

Companion recommendation: install **dsh-preset-doctor** (on npm). It scans mounted
agent presets across host-version migrations, mechanically realigns what it can
(atomic, `.bak`-first, zero-LLM) and reports the rest with file:line and a
suggestion — including per-row switches inside each preset card, so the tool
rows these templates declare stay governable without hand-editing YAML. Using it
with these templates: install it in the same profile, restart, open its panel —
the presets you just installed appear as cards showing the era they were written
for; hit "对齐/align" on drifted ones and use the in-card row switches to tune
individual tool rows instead of editing YAML by hand. This package writes
terminal semantics into presets; preset-doctor keeps those presets mountable and
manageable across generations.
