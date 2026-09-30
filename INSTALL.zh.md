# 安装指南（官方 DSH CLI）

本指南只使用官方 DSH `dsh plugin` 命令。该命令会把依赖装进 profile 并同步 `dsh.profile.bundles`。不要用普通 `npm install`、在 profile 里直接 `pnpm add` 或手工编辑 profile 清单来代替 —— 除非本指南明确涵盖了这些途径（§1 的 pnpm node-pty 构建脚本审批、dist-tag 线路选择，以及 §3 的本地开发安装）。

- [安装指南](./INSTALL.zh.md)
- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.en.md)
- [中文 README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Français README](./README.fr.md)
- [Deutsch README](./README.de.md)
- [Italiano README](./README.it.md)
- [Русский README](./README.ru.md)
- [Español README](./README.es.md)
- [版本更新日志](./CHANGELOG.md)

本指南中的占位符：

- `<profile>`：要修改的 DSH profile，通常是 `web` 或 `desktop`；
- `dsh-bash-terminal-ts`：npm 包名与运行时插件 ID。

> **版本要求 —— 请选择与你的 DSH 匹配的线路。**
>
> 安装前先确认运行版本（`dsh --version`）。
>
> | DSH 版本 | 插件线路 | npm 选择器 |
> | --- | --- | --- |
> | 0.1.5 – 0.1.7 | 0.1.7 线路 | `dsh-bash-terminal-ts`（latest，如 `0.6.4`） |
> | ≥ 0.2.0-rc.1 | 0.2.0 线路 | `dsh-bash-terminal-ts@0.7.0`（dist-tag `dsh-0.2.0`） |
>
> 两条线路使用同一个包名，通过 dist-tag 共存：`latest` 指向 0.1.7 线路，`dsh-0.2.0` 指向 0.2.0 线路。因此裸包名 `dsh-bash-terminal-ts` 安装的是 **0.1.7** 线路 —— 0.2.0 线路必须通过显式版本号或 dist-tag 选择，否则插件的 peer 依赖（`>=0.2.0-rc.1`）无法匹配 0.2.0 宿主。

## 0. 前置条件与 profile 确认

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

使用你正在运行的 DSH 进程对应的 profile。`web` 很常见，但以实际 `--profile` 参数为准。

交互式 `terminal` 工具运行在 `node-pty` 之上，`node-pty` 会作为本包的依赖自动安装。pnpm 管理的 profile 需要额外一个审批步骤 —— 见 §1。

## 1. 官方安装

0.1.7 线路（裸包名）：

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts -w
```

0.2.0 线路（显式版本号）：

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts@0.7.0 -w
```

（当 profile 是 pnpm 工作区根目录（workspace root）时必须带 `-w`，`web` 就是。）

官方 CLI 会自动更新 profile 依赖、锁文件与 `dsh.profile.bundles`。本包自带 `dsh.bundle.patch`（`cordis.patch.yml`，负责插入 `tool-bash-terminal` 条目），因此无需手工编辑 profile。

`install.ps1 install`（设置界面白名单补丁）是 **旧版方案**：自 DSH 0.1.5 起，设置客户端会动态枚举设置项（`settings.describe()`），当前宿主无需白名单补丁。除非你运行的是 DSH 0.1.2–0.1.4，否则请忽略它。

### pnpm 管理的 profile：批准 node-pty 构建脚本

pnpm ≥ 10 默认阻止依赖的安装脚本，而 `node-pty` 的安装脚本会编译原生绑定。因此 `pnpm add`（或任何由 pnpm 驱动的安装）最后会报：

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

包已装上，但原生绑定从未编译 —— 交互式 `terminal` 工具将无法启动。批准一次即可：

```bash
pnpm approve-builds      # pick node-pty interactively
```

或在 profile 的 `package.json` 中声明，然后重新构建：

```json
"pnpm": { "onlyBuiltDependencies": ["node-pty"] }
```

```bash
pnpm rebuild node-pty
```

npm 管理的 profile 不受影响：npm 默认会运行依赖的安装脚本。

这是插件中唯一的原生依赖 —— 不需要审批其他构建脚本。

## 2. 升级

```bash
dsh plugin --profile <profile> update dsh-bash-terminal-ts -w
```

0.2.0 线路请显式固定新版本（`dsh plugin --profile <profile> add dsh-bash-terminal-ts@<version> -w`），因为 `update` 跟随的是 `latest` 标签（0.1.7 线路）。

宿主侧改动需重启 DSH，客户端侧改动需硬刷新 Web 页面（Ctrl+Shift+R）。如果升级提升了 `node-pty` 版本，pnpm 可能会再次拦截其构建脚本 —— 重新执行 §1 的审批（若已声明 `onlyBuiltDependencies`，重新跑一次 `pnpm rebuild node-pty` 即可）。

## 3. 本地开发安装（junction）—— 备选

开发时，可以链接一个本地检出，让源码改动即时生效。在仓库根目录执行：

```bash
# 1. Link the plugin into the profile's node_modules (junction):
#      New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "<repo path>"
# 2. Let the plugin resolve @deepseek-ai/* from the profile's dependency tree (junction),
#    so plugin and host share one module instance.
# 3. List "dsh-bash-terminal-ts" in dsh.profile.bundles.
# 4. After client-side source changes only: node scripts/build-client.mjs
# 5. Restart dsh.
```

⚠️ **不要**在插件仓库内运行 `npm install`：它会把 `@deepseek-ai/*` 的 junction 替换为私有副本，插件随之不再与宿主共享模块实例（之后会落后于宿主的 API 升级）。只能用 `npm install --package-lock-only` 刷新锁文件。

完整的分步命令见 [README 开发章节](./README.md#本地开发安装junction-直连改源码即时生效)。

## 4. 验证安装

检查依赖与安装的版本：

```bash
grep -n "dsh-bash-terminal-ts" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/package.json').version"
```

检查原生绑定是否确实已编译：

```bash
node -e "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/node_modules/node-pty')"
```

（无输出即成功；报错说明构建脚本被跳过了 —— 见 §1。）

检查官方组合配置：

```bash
dsh --profile <profile> --dump-config | grep tool-bash-terminal
```

输出必须包含 `tool-bash-terminal` 条目（由本包的 `cordis.patch.yml` 插入）。

## 5. 验证插件

重启 DSH，然后刷新 Web 页面。验证：

1. 设置 → 通用 中出现「默认终端」下拉框（PowerShell / Git Bash / MSYS2 / WSL）；
2. 模型能看到 `shell` 工具，并通过你选择的终端执行命令；
3. `terminal` 工具能打开持久的交互式会话（shell 状态在多次调用之间保留）。

## 6. 故障排查

| 症状 | 处理 |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: node-pty` | 批准构建脚本（§1）：`pnpm approve-builds`，或声明 `onlyBuiltDependencies` + `pnpm rebuild node-pty`。 |
| `terminal` 工具打开时报错 | node-pty 绑定未编译 —— 处理方式同上。 |
| 交互式 PowerShell 报 `0x8009001d` 错误 | PowerShell 5.1 无法在 ConPTY 下启动；请安装 [PowerShell 7](https://github.com/PowerShell/PowerShell/releases)（一次性命令不受影响）。 |
| `shell` 对 `msys2` 报 `backend unavailable` | 安装 MSYS2（默认 `C:\msys64`），或将 `msys2Path` 指向已有安装。 |
| 插件显示「已停用/未挂载」且无错误 | 检查 profile 组合配置（§4）；peer 范围必须与宿主线路匹配（见版本表）。 |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | dsh 运行环境的 pnpm 策略会拦截刚发布的版本；把版本加入 profile 的 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`。 |
| 升级后客户端 bundle 过期 | 硬刷新浏览器（Ctrl+Shift+R）。 |

## 7. 卸载

使用官方命令：

```bash
dsh plugin --profile <profile> remove dsh-bash-terminal-ts
```

之后重启 DSH；`shell` / `terminal` 工具随之消失，DSH 自身的 shell 工具链保持不变。
