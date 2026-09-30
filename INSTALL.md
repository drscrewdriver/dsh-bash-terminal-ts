# Installation Guide (Official DSH CLI)

This guide uses only the official DSH `dsh plugin` command. The command installs the dependency into a profile and synchronizes `dsh.profile.bundles`. Do not replace it with plain `npm install`, direct `pnpm add` in the profile, or manual edits to the profile manifest — except where this guide explicitly covers those routes (the pnpm node-pty approval in §1, the dist-tag line selection, and the local-development install in §3).

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
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
- [Changelog](./CHANGELOG.md)

The placeholders in this guide are:

- `<profile>`: the DSH profile to modify, usually `web` or `desktop`;
- `dsh-bash-terminal-ts`: the npm package and runtime plugin ID.

> **Version requirement — pick the line that matches your DSH.**
>
> Check the running version first (`dsh --version`).
>
> | DSH version | Plugin line | npm selector |
> | --- | --- | --- |
> | 0.1.5 – 0.1.7 | 0.1.7 line | `dsh-bash-terminal-ts` (latest, e.g. `0.6.4`) |
> | ≥ 0.2.0-rc.1 | 0.2.0 line | `dsh-bash-terminal-ts@0.7.0` (dist-tag `dsh-0.2.0`) |
>
> Both lines ship under the same package name and coexist through dist-tags: `latest` points at the 0.1.7 line, `dsh-0.2.0` at the 0.2.0 line. A bare `dsh-bash-terminal-ts` therefore installs the **0.1.7** line — the 0.2.0 line must be selected by explicit version or dist-tag, otherwise the plugin's peers (`>=0.2.0-rc.1`) will not match a 0.2.0 host.

## 0. Prerequisites and profile discovery

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

Use the profile named by your running DSH process. `web` is common, but the active `--profile` argument is authoritative.

The interactive `terminal` tool runs on `node-pty`, which is installed automatically as a dependency of this package. pnpm-managed profiles need one extra approval step — see §1.

## 1. Official installation

0.1.7 line (bare package name):

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts -w
```

0.2.0 line (explicit version):

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts@0.7.0 -w
```

(The `-w` flag is required when the profile is a pnpm workspace root, as `web` is.)

The official CLI updates the profile dependency, lockfile, and `dsh.profile.bundles` automatically. The package ships its own `dsh.bundle.patch` (`cordis.patch.yml`, inserting the `tool-bash-terminal` entry), so no manual profile edits are needed.

`install.ps1 install` (the settings-UI allowlist patch) is **legacy**: since DSH 0.1.5 the settings client enumerates settings dynamically (`settings.describe()`), so no allowlist patch is required on current hosts. Ignore it unless you run DSH 0.1.2–0.1.4.

### pnpm-managed profiles: approve the node-pty build script

pnpm ≥ 10 blocks dependency install scripts by default, and `node-pty` compiles a native binding in its install script. `pnpm add` (or any pnpm-driven install) therefore ends with:

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

The package is installed, but the native binding was never built — the interactive `terminal` tool will fail to start. Approve it once:

```bash
pnpm approve-builds      # pick node-pty interactively
```

or declare it in the profile's `package.json`, then rebuild:

```json
"pnpm": { "onlyBuiltDependencies": ["node-pty"] }
```

```bash
pnpm rebuild node-pty
```

npm-managed profiles are unaffected: npm runs dependency install scripts by default.

This is the only native dependency in the plugin — no other build-script approvals are needed.

## 2. Upgrade

```bash
dsh plugin --profile <profile> update dsh-bash-terminal-ts -w
```

For the 0.2.0 line, pin the new version explicitly (`dsh plugin --profile <profile> add dsh-bash-terminal-ts@<version> -w`), since `update` follows the `latest` tag (0.1.7 line).

Restart DSH for host changes and hard-refresh the Web page (Ctrl+Shift+R) for client changes. If the upgrade bumps the `node-pty` version, pnpm may re-block its build script — re-run the approval from §1 (a fresh `pnpm rebuild node-pty` is enough when `onlyBuiltDependencies` is already declared).

## 3. Local development install (junction) — alternative

For development, link a local checkout so source changes apply instantly. From the repo root:

```bash
# 1. Link the plugin into the profile's node_modules (junction):
#      New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "<repo path>"
# 2. Let the plugin resolve @deepseek-ai/* from the profile's dependency tree (junction),
#    so plugin and host share one module instance.
# 3. List "dsh-bash-terminal-ts" in dsh.profile.bundles.
# 4. After client-side source changes only: node scripts/build-client.mjs
# 5. Restart dsh.
```

⚠️ Do **not** run `npm install` inside the plugin repo: it replaces the `@deepseek-ai/*` junction with a private copy, and the plugin stops sharing module instances with the host (it then lags behind host API upgrades). Refresh the lockfile only with `npm install --package-lock-only`.

The full step-by-step commands are in the [README development section](./README.md#本地开发安装junction-直连改源码即时生效).

## 4. Verify installation

Check the dependency and installed version:

```bash
grep -n "dsh-bash-terminal-ts" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/package.json').version"
```

Check that the native binding is actually built:

```bash
node -e "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/node_modules/node-pty')"
```

(No output means success; an error means the build script was skipped — see §1.)

Check the official composition:

```bash
dsh --profile <profile> --dump-config | grep tool-bash-terminal
```

It must contain the `tool-bash-terminal` entry (inserted by the package's `cordis.patch.yml`).

## 5. Verify the plugin

Restart DSH, then refresh the Web page. Verify:

1. Settings → General shows the "default terminal" dropdown (PowerShell / Git Bash / MSYS2 / WSL);
2. The model sees the `shell` tool and executes commands through the terminal you selected;
3. The `terminal` tool opens a persistent interactive session (shell state survives across calls).

## 6. Troubleshooting

| Symptom | Action |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: node-pty` | Approve the build script (§1): `pnpm approve-builds`, or `onlyBuiltDependencies` + `pnpm rebuild node-pty`. |
| `terminal` tool errors on open | The node-pty binding is not built — same fix as above. |
| Interactive PowerShell fails with `0x8009001d` | PowerShell 5.1 cannot start under ConPTY; install [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) (one-shot commands are unaffected). |
| `shell` reports `backend unavailable` for `msys2` | Install MSYS2 (default `C:\msys64`) or point `msys2Path` at an existing install. |
| Plugin shows as "disabled/unmounted" with no error | Check the profile composition (§4); the peer range must match the host line (§ version table). |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | The dsh runtime's pnpm policy blocks freshly published versions; add the version to `minimumReleaseAgeExclude` in the profile's `pnpm-workspace.yaml`. |
| Stale client bundle after upgrade | Hard-refresh the browser (Ctrl+Shift+R). |

## 7. Remove

Use the official command:

```bash
dsh plugin --profile <profile> remove dsh-bash-terminal-ts
```

Restart DSH afterwards; the `shell` / `terminal` tools disappear and DSH's own shell tooling remains untouched.
