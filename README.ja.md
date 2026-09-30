# dsh-bash-terminal-ts

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Italiano](README.it.md) | [Русский](README.ru.md) | [Español](README.es.md)

> コミュニティ: [LINUX DO](https://linux.do) · [GitHub](https://github.com/drscrewdriver/dsh-bash-terminal-ts)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)

![test](https://github.com/drscrewdriver/dsh-bash-terminal-ts/actions/workflows/test.yml/badge.svg)

DSH（DeepSeek Harness）プラグイン：**PowerShell / Git Bash / MSYS2 / WSL** の 4 種類のターミナルコマンドを Windows 上で統一的に実行する `shell` ツールです。

> **本リポジトリは `MAXeaglet/dsh-bash-terminal` の TypeScript リライトです**。動作する MSYS2/MINGW64 サポートを備えています。互換ラインは 2 本あります：
>
> | ブランチ | DSH バージョン帯 | パッケージ名 | 状態 |
> |------|--------|------|------|
> | `ts/0.1.5` | 0.1.5-alpha.1 – 0.1.5-rc.x | `dsh-bash-terminal-ts` | 本ブランチ。`build` / `unit` / `apply` / `client` / `terminal` がローカルで全グリーン |
> | `main` | 0.1.2-alpha.1 – 0.1.2-rc.x | `dsh-bash-terminal-ts` | TypeScript リライトのメインライン |
>
> 両ラインは**意図的に異なるパッケージ名を使用しています**。そのため共存インストールが可能で、互いに上書きすることはありません。お使いの DSH バージョンに合ったブランチを選んでください。

| バックエンド | 実行内容 | 構文 / パス | 環境変数 |
|------|----------|-------------|----------|
| `powershell`（デフォルト） | `pwsh -NoLogo -NoProfile -NonInteractive -Command <cmd>` | PowerShell；`C:\...` | `$env:NAME` |
| `gitbash` | Git for Windows `bash -lc <cmd>` | POSIX；`/d/workspace`；PATH に `/usr/bin`、`/mingw64/bin` を含む | `$NAME` |
| `msys2` | MSYS2 `bash -lc <cmd>`（`C:\msys64\usr\bin\bash.exe`） | POSIX；`/c/...`；PATH に `/usr/bin`、`/mingw64/bin` を含む（gcc / make） | `$NAME`（`MSYSTEM=MINGW64` を自動注入） |
| `wsl` | `wsl [-d <distro>] -e bash -lc <cmd>` | Linux；`/mnt/d/...` | `$NAME`（WSLENV 経由） |

呼び出しごとに毎回新しいシェルを起動します：**状態は保持されません**（cwd / 変数 / エイリアス）—— `cd` を使う代わりに `workdir` を渡してください。

## 画面プレビュー

設定 → 全般 の「デフォルトターミナル」行：ユーザーが PowerShell / Git Bash / MSYS2 / WSL から選択し、`shell` ツールはこの設定に従ってのみ実行します。モデルが上書きすることはできません：

![デフォルトターミナル設定行](assets/shells.png)

## 設計のポイント

- **ターミナルはユーザーが決定し、AI は変更できない**：Web UI の設定ページ（設定 → 全般）に「デフォルトターミナル」のドロップダウンが表示されます（PowerShell / Git Bash / MSYS2 / WSL）。`shell` ツールは常にこの設定のみを使用し、ターミナル引数はモデルに公開しません。設定は DSH settings システムを通じて永続化されます（settings.yaml）。
- **`ctx.shell` 機能シームを占有しない**：DSH 同梱のサンドボックス化された `pwsh` ツールはそのまま利用可能です。本プラグインの `shell` ツールは**追加の**マルチターミナル入口です。
- 共有の `ctx.subprocess` seam からプロセスを生成：プロセスツリーの終了（Windows `taskkill /T`）、SIGTERM→grace→SIGKILL、出力 spill ファイルは、公式 `dsh-tool-bash` / `dsh-tool-pwsh` と同一の挙動です。
- バックグラウンドタスクは汎用の `jobs` registry に登録され、`run_in_background` / `job_output` / `job_kill` に対応します。
- フロントエンド設定ページの「デフォルトターミナル」は列挙型で（UI が自動的にドロップダウンとして描画）、モデルは呼び出しごとにこの設定に従って実行するのみで、自分でターミナルを切り替えることはできません。

## インストール（web profile）

### 標準インストール（npm 公開後、公式 bundle 仕組み）

プラグインは公式の `dsh.bundle` manifest（パッケージ内の `cordis.patch.yml`）を同梱しており、profile に本パッケージが列挙されると DSH が**自動的にマウントを適用**します。profile 設定を手動で書き換える必要はありません：

```powershell
# 1. プラグインパッケージをインストール
npm install -g dsh-bash-terminal-ts
dsh plugin --profile web add dsh-bash-terminal-ts   # profile の bundles に自動追加され、patch が適用される

# 2. DSH 設定のホワイトリストを patch（DSH の制限。下記の説明を参照）
powershell -ExecutionPolicy Bypass -File install.ps1 install

# 3. dsh web を再起動
```

> 一時 profile で実測済み：`bundles: [dsh-bash-terminal-ts]` → dump-config に `tool-bash-terminal` entry が自動的に現れます。

### pnpm ユーザー向け注意：node-pty のビルドスクリプトを許可する

本プラグインはネイティブ PTY ライブラリ [`node-pty`](https://www.npmjs.com/package/node-pty)（Microsoft がメンテナンス、VS Code と同じもの）に依存して対話ターミナルを実装しており、インストール時にそのコンパイルスクリプトを実行する必要があります。npm はデフォルトで依存パッケージの install スクリプトを実行するため、操作は不要です。**pnpm ≥10 はデフォルトでブロック**し、`pnpm add` の最後に次のように表示されます：

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

この時点でパッケージ自体はインストールされていますが、ネイティブバインディングがコンパイルされていないため、`terminal` ツール（対話ターミナル）の起動に失敗します。一度許可すれば解決します：

```powershell
pnpm approve-builds      # 対話形式で node-pty を選択
# または profile の package.json に宣言してから再ビルド：
#   "pnpm": { "onlyBuiltDependencies": ["node-pty"] }
pnpm rebuild node-pty
```

> 自作 dsh プラグインの中でネイティブ依存を持つのは**本プラグインのみ**です。その他の 0.2.0 系プラグイン（search-index、session-steward、patch-edit-plus、browser-cdp、date-wrapper）と live-token-stats はすべて純粋な JS パッケージで、approve-builds は不要のまま pnpm でそのままインストールできます。

### ローカル開発インストール（junction 直結、ソース変更は即時反映）

```powershell
# 1. プラグインパッケージを profile の node_modules にリンク（junction。ソース変更は即時反映される）
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "D:\workspace\projects\dsh-bash-terminal-ts" | Out-Null

# 2. プラグインが @deepseek-ai/* 依存を解決できるようにする（profile の依存ツリーへの junction。プラグインとホストが同一のモジュールインスタンスを共有する）
New-Item -ItemType Junction -Path "D:\workspace\projects\dsh-bash-terminal-ts\node_modules\@deepseek-ai" -Target "$profile\..\node_modules\@deepseek-ai" | Out-Null

# 3. profile が公式 bundle 経由でプラグインをマウントできるようにする（install.ps1 install が自動的に実行。dsh.profile.bundles に "dsh-bash-terminal-ts" を追加するのと等価）
# 4. （フロントエンドのソースを変更した場合のみ）client bundle を再パッケージ：
#    cd D:\workspace\projects\dsh-bash-terminal-ts && node scripts/build-client.mjs
# 5. dsh web を再起動
```

> ⚠️ **本プロジェクト内で `npm install` を実行しないでください**：上記手順 2 の junction が削除され、代わりにプラグイン向けに**独立した**
> `@deepseek-ai/*` のコピーがインストールされます —— その結果、プラグインとホストはモジュールインスタンスを共有できなくなり、ホストをアップグレードするとプラグインは古い API に取り残されます
> （本プロジェクトはかつてこの原因で 0.1.0-rc.6 に取り残されました）。lock ファイルだけを更新したい場合は `npm install --package-lock-only` を使用してください。

> **互換性**：DSH ≥ **0.1.5-rc.1** が必要です。0.1.5 ではブラウザモジュールテーブル内の `@deepseek-ai/dsh-client-runtime`
> が `@deepseek-ai/dsh-client-store` に改名され、厳密な裸名でのみ一致するようになりました。古い bundle は新しいホスト上で
> `Failed to load plugins` / `require(...) missed the module table` を報告します。
>
> また、0.1.5 の Web 設定画面は `settings.describe()` による動的列挙に変更され、**namespace ホワイトリストは廃止されました**
> （`settings-not-exposed` は存在しなくなりました）。`install.ps1` 内のホワイトリスト patch は歴史的経緯による残存物で、無視して構いません。

> 現在では profile の `cordis.patch.yml` を手動で書き換える必要はありません：プラグインパッケージ自体が `dsh.bundle.patch`（パッケージ内の `cordis.patch.yml`）を同梱しており、profile の `dsh.profile.bundles` に `dsh-bash-terminal-ts` があるだけで、DSH が自動的にマウントします。

マウント構成の検証（再起動不要）：

```powershell
node "$env:APPDATA\nvm\<node-version>\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile web --dump-config | Select-String dsh-bash-terminal-ts
```

## 使い方

**ユーザーが Web UI でデフォルトターミナルを設定します**：設定（歯車アイコン）→ 全般 →「デフォルトターミナル」のドロップダウンを開き、PowerShell / Git Bash / MSYS2 / WSL のいずれかを選択します。変更は即時に反映され、永続化されます。

モデルは `shell` ツールを認識した後、コマンド実行時に自動的にあなたが選択したターミナルを使用します（ツールはターミナル引数を公開しないため、モデルがあなたの選択を変更することはできません）：

- デフォルトターミナル = Git Bash の場合：`shell(command: "git status")` は Git Bash で実行される
- デフォルトターミナル = MSYS2 の場合：`shell(command: "gcc --version")` は MSYS2 で実行される（MINGW64 環境。`/mingw64/bin` の gcc、make が利用可能）
- デフォルトターミナル = WSL の場合：`shell(command: "ls -la /mnt/d/workspace")` は WSL で実行される。`distro: "Ubuntu"` を渡せばディストリビューションを指定可能
- デフォルトターミナル = PowerShell の場合：`shell(command: "Get-Process node")` は PowerShell で実行される

## モデル使用例

- ワンショットコマンド（デフォルトターミナル）：`shell(command: "git status", description: "git の状態を確認")`
- ラウンドをまたいで状態を保持（対話式）：`terminal(action: "open")` → `sessionId` を控える → `terminal(action: "send", sessionId, input: "cd /d/project\n")` → `terminal(action: "send", sessionId, input: "npm run dev\n")` → `terminal(action: "close", sessionId)`
- 実行中のプログラムを中断：`terminal(action: "signal", sessionId, signal: "SIGINT")`
- アクティブなセッションを一覧表示：`terminal(action: "list")`
- サンドボックスに拒否された後のエスカレーション：`shell(command: ..., sandbox_permissions: "workspace-write", justification: "...")`

## 設定

**Web UI での設定**（推奨）：設定 → 全般 →「デフォルトターミナル」。

プラグイン row の `config`（デフォルトを上書きし、設定の composition ベースとして機能）：

| キー | デフォルト | 説明 |
|----|------|------|
| `defaultShell` | `powershell` | 設定で上書きされない場合のバックエンド |
| `timeoutMs` | 120000 | デフォルトのタイムアウト |
| `maxTimeoutMs` | 600000 | 呼び出し側 timeoutMs の上限 |
| `pwshPath` | 自動検出 | pwsh.exe のパスを固定 |
| `gitBashPath` | 自動検出 | git bash.exe のパスを固定 |
| `msys2Path` | 自動検出（`C:\msys64\usr\bin\bash.exe` を優先、`msys2.exe` がフォールバック） | MSYS2 bash.exe のパスを固定 |
| `wslPath` | 自動検出 | wsl.exe のパスを固定 |

## 公開（npm）

npm アカウントで 2FA による公開検証が有効になっており、ワンタイム認証コードが必要です：

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm publish --otp <認証コード>   # 認証コードはお使いの認証アプリで生成
```

公開前に `npm pack --dry-run` で内容を確認し、`npm run build` を実行して再ビルドしてください（tsc によるサーバー側コンパイル + client bundle + テストコンパイル）。

## アンインストール

推奨は以下を直接実行する方法です：

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 uninstall
```

このコマンドは junction の削除、設定ホワイトリストの復元、旧バージョンで残された `cordis.patch.yml` マウントブロックのクリーンアップを行い、`dsh.profile.bundles` から `dsh-bash-terminal-ts` を取り除きます。その後、dsh web を再起動すれば完了です。

手動でアンインストールする場合は、`node_modules\dsh-bash-terminal-ts` の削除に加え、profile の `package.json` 内 `dsh.profile.bundles` から `dsh-bash-terminal-ts` を取り除くことも忘れないでください。

## 対話型ターミナル（terminal ツール）

`terminal` ツールは、PTY シーム（node-pty。Windows では上流の `spawnTerminal` の process inspector が POSIX のみ対応のため `lib/terminal.js` が node-pty に直接接続し、Windows 以外では引き続き公式の `ctx.subprocess.spawnTerminal` を使用）の上に**永続的な対話セッション**を提供します：

- `action: open` は実際のターミナルセッションを起動します（設定済みのデフォルトターミナルを使用。wsl では `distro` を渡せます）。`sessionId` を返します
- `action: send` は入力を書き込み、新規出力を読み取ります。`action: read` は読み取り専用。`action: signal` はフォアグラウンドのプロセスグループにシグナルを送信します（SIGINT = Ctrl+C）
- `action: close` はセッションを終了します
- **セッション状態は呼び出し間で保持されます**（cwd / 変数 / エイリアス）。REPL、ssh、対話型 CLI に適しています
- `send` は出力が安定するのを待って（300ms の無音期間、上限 5s）**完全な応答**を返します。出力が 1MB を超えると `truncated` の注意を報告します
- 入力は `\\n`（または \r）で終えると Enter を意味します

## サンドボックス（公式機構との連携）

`shell` ツールは DSH の公式サンドボックスシーム（`ctx.sandboxPolicy` + `ctx.sandbox`）を経由します：

- 呼び出しごとに現在のサンドボックスポリシーを解決します。`danger-full-access` セッションはそのまま実行されます（ラップなし）。
- PowerShell バックエンドは `ctx.sandbox.confine` で argv をラップします —— 公式 executor と同じ **fail-closed** セマンティクスです。制限モードが要求されたのに利用可能なバックエンドがない場合は `SandboxUnavailableError` をスローし、素のままの実行を拒否します。
- Git Bash バックエンドはラップしません：DSH の Windows ACL 制限トークン runner は Cygwin/MSYS2 と非互換のためです（bash は起動直後に `CreateFileMapping` の Win32 error 5 で終了します）。そのため Git Bash も制限モードではサンドボックスラップを経由せず、結果は `enforcement: gitbash-unconfined` と報告します。
- MSYS2 バックエンドも同様にラップしません（同一の Cygwin/MSYS2 ランタイム非互換）。結果は `enforcement: msys2-unconfined` と報告します。
- WSL バックエンドはラップしません：WSL の独立した Linux 仮想マシン自体が分離となっています（結果は `enforcement: wsl-isolation` と報告）。
- 制限モードでサンドボックスに拒否された場合、結果には公式マーカー `[sandbox: file access denied under <mode> mode]` と同一ターン内のエスカレーション案内が含まれます。モデルは `sandbox_permissions` + `justification` を根拠に 1 回のエスカレーションを申し立てできます（`ctx.approval` 経由でユーザーが承認）。公式 bash/pwsh ツールと完全に同一の挙動です。
- 注意：DSH の Windows ACL runner が利用可能な場合、PowerShell の制限モードはそれ経由でラップされます。Git Bash と MSYS2 は Cygwin/MSYS2 非互換のため、ラップなしのままです。

## ⚠️ セキュリティに関する注意

`shell` ツールの制限モードでの挙動：PowerShell は `ctx.sandbox.confine` 経由でラップされ（fail-closed）、Git Bash と MSYS2 は Cygwin/MSYS2 が Windows ACL 制限トークンと非互換のため**ラップされず**（dsh プロセスと同一権限）、WSL は独立した Linux VM のためラップされません。本ツールは**追加のマルチターミナル入口**であり、公式 `pwsh` ツールの ConstrainedLanguage 制限は適用されません。DSH のファイル操作ツール（read/write/edit）は引き続きファイルサンドボックスの制約を受けます。信頼できるセッションでのみ使用してください。サンドボックス保護された PowerShell が必要な場合は、公式 `pwsh` ツールを引き続きご利用ください。

## 対話ターミナルの既知の制限（ConPTY）

- **PowerShell 5.1 は ConPTY で起動できません**（0x8009001d）—— 対話型 PowerShell には [PowerShell 7](https://github.com/PowerShell/PowerShell/releases) のインストールが必要です（ワンショットコマンドは影響を受けません）。
- **wsl.exe の対話モードは ConPTY 下で WSL サービスの RPC エラーを引き起こすことがあります**（0x8007072c、不定期に発生）—— ワンショットの `wsl -e bash -lc ...` コマンドは正常です。対話セッションには Windows Terminal / WSL ターミナルを直接使うか、再試行することを推奨します。
- **Windows 上の node-pty は名前付きシグナルを受け付けません**：`signal` の `SIGINT` は Ctrl+C（`\x03`）にマッピングされ、その他のシグナル（`SIGTERM` / `SIGKILL` / `SIGTSTP` / `SIGHUP`）はセッションの終了に退化します。
- Git Bash の対話セッションは完全に正常に動作します。

## 既知の制限

- WSL のバックグラウンドプロセスは、タイムアウト/中断後にディストリビューション内に短時間残存する場合があります（WSL インスタンスは最後のプロセスが終了すると自動的にシャットダウンします）。
- Git Bash は msys2 環境であり、WSL の Linux 挙動とは差異があります（パスマッピング、パッケージの可用性）。
- MSYS2 バックエンドにはローカルへの MSYS2 インストールが必要です（デフォルト `C:\msys64`）。未インストールの場合、`shell` は `backend unavailable` を報告します。`msys2Path` でカスタムの場所を指定できます。候補の順序は常に `bash.exe` を優先し、`msys2.exe` がフォールバックです —— `msys2.exe` はパイプ stdio 下ではサイレントにゼロバイトを返すため、あくまで最終手段です。
- 本プラグインは `win32` プラットフォームでのみツールを登録します。

## テスト

```powershell
cd D:\workspace\projects\dsh-bash-terminal-ts
npm install          # 依存関係のインストール（typescript を含む）
npm run build        # tsc コンパイル src/*.ts → lib/*.js；client.tsx → lib/client.js + dist/client.js；test/*.ts → test-dist/
npm test             # node test-dist/unit.js → apply.js → client.js → terminal.js
```

ソースコードは TypeScript（`strict` + `noUncheckedIndexedAccess`）で、コンパイル成果物の `lib/`、`dist/` はリポジトリにコミット済みです。DSH は `lib/index.js` を直接ロードするため、インストールなしでそのまま利用できます。
