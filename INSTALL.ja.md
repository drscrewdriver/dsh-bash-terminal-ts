# インストールガイド（公式 DSH CLI）

このガイドは公式の DSH `dsh plugin` コマンドのみを使用します。このコマンドは依存関係を profile にインストールし、`dsh.profile.bundles` を同期します。本ガイドで明示的にその手順を扱っている箇所（§1 の pnpm における node-pty の承認、dist-tag によるライン選択、§3 のローカル開発インストール）を除き、普通の `npm install`、profile での直接 `pnpm add`、profile マニフェストの手動編集で代用しないでください。

- [日本語インストールガイド](./INSTALL.ja.md)
- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
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

このガイドのプレースホルダー：

- `<profile>`：変更する DSH profile。通常は `web` または `desktop`；
- `dsh-bash-terminal-ts`：npm パッケージ名とランタイムプラグイン ID。

> **バージョン要件 — お使いの DSH に合ったラインを選択してください。**
>
> まず実行中のバージョンを確認してください（`dsh --version`）。
>
> | DSH バージョン | プラグインライン | npm セレクター |
> | --- | --- | --- |
> | 0.1.5 – 0.1.7 | 0.1.7 ライン | `dsh-bash-terminal-ts`（latest、例： `0.6.4`） |
> | ≥ 0.2.0-rc.1 | 0.2.0 ライン | `dsh-bash-terminal-ts@0.7.0`（dist-tag `dsh-0.2.0`） |
>
> 両ラインは同じパッケージ名で公開されており、dist-tag によって共存します：`latest` は 0.1.7 ラインを、`dsh-0.2.0` は 0.2.0 ラインを指します。そのため、`dsh-bash-terminal-ts` とだけ指定すると **0.1.7** ラインがインストールされます。0.2.0 ラインは明示的なバージョンまたは dist-tag で選択する必要があります。そうしない場合、プラグインの peer 依存（`>=0.2.0-rc.1`）が 0.2.0 のホストと一致しません。

## 0. 前提条件と profile の確認

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

実行中の DSH プロセスが使用している profile を使用してください。`web` が一般的ですが、実際に指定されている `--profile` 引数が正となります。

インタラクティブな `terminal` ツールは `node-pty` 上で動作します。`node-pty` はこのパッケージの依存関係として自動的にインストールされます。pnpm で管理されている profile では、承認ステップが 1 つ追加で必要です。§1 を参照してください。

## 1. 公式インストール

0.1.7 ライン（パッケージ名のみ指定）：

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts -w
```

0.2.0 ライン（明示的なバージョン指定）：

```bash
dsh plugin --profile <profile> add dsh-bash-terminal-ts@0.7.0 -w
```

（profile が pnpm workspace root の場合は `-w` フラグが必要です。`web` はそうです。）

公式 CLI は profile の依存関係、ロックファイル、`dsh.profile.bundles` を自動的に更新します。このパッケージには独自の `dsh.bundle.patch`（`cordis.patch.yml`、`tool-bash-terminal` エントリーを挿入）が同梱されているため、profile を手動で編集する必要はありません。

`install.ps1 install`（設定 UI の許可リストパッチ）は **レガシー** です。DSH 0.1.5 以降、設定クライアントは設定を動的に列挙するため（`settings.describe()`）、現在のホストでは許可リストパッチは不要です。DSH 0.1.2–0.1.4 を使用している場合を除き、無視して構いません。

### pnpm 管理の profile：node-pty ビルドスクリプトの承認

pnpm ≥ 10 では、デフォルトで依存パッケージの install スクリプトがブロックされます。`node-pty` は install スクリプト内でネイティブバインディングをコンパイルします。そのため、`pnpm add`（または pnpm が駆動するその他のインストール）は次のエラーで終わります：

```text
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: node-pty@1.1.0
```

パッケージ自体はインストールされていますが、ネイティブバインディングは一度もビルドされていません。インタラクティブな `terminal` ツールは起動に失敗します。一度だけ承認してください：

```bash
pnpm approve-builds      # pick node-pty interactively
```

または、profile の `package.json` に宣言してから再ビルドします：

```json
"pnpm": { "onlyBuiltDependencies": ["node-pty"] }
```

```bash
pnpm rebuild node-pty
```

npm で管理されている profile は影響を受けません。npm はデフォルトで依存パッケージの install スクリプトを実行します。

これはプラグインで唯一のネイティブ依存です。他にビルドスクリプトの承認は不要です。

## 2. アップグレード

```bash
dsh plugin --profile <profile> update dsh-bash-terminal-ts -w
```

0.2.0 ラインの場合は、新しいバージョンを明示的に指定してください（`dsh plugin --profile <profile> add dsh-bash-terminal-ts@<version> -w`）。`update` は `latest` タグ（0.1.7 ライン）に従うためです。

ホスト側の変更は DSH の再起動で、クライアント側の変更は Web ページのハードリフレッシュ（Ctrl+Shift+R）で反映されます。アップグレードで `node-pty` のバージョンが上がった場合、pnpm がビルドスクリプトを再度ブロックすることがあります。その場合は §1 の承認を再実行してください（`onlyBuiltDependencies` が既に宣言されていれば、`pnpm rebuild node-pty` の再実行だけで十分です）。

## 3. ローカル開発インストール（ジャンクション）— 代替手段

開発では、ローカルのチェックアウトをリンクすると、ソースの変更が即座に反映されます。リポジトリのルートから：

```bash
# 1. Link the plugin into the profile's node_modules (junction):
#      New-Item -ItemType Junction -Path "$profile\node_modules\dsh-bash-terminal-ts" -Target "<repo path>"
# 2. Let the plugin resolve @deepseek-ai/* from the profile's dependency tree (junction),
#    so plugin and host share one module instance.
# 3. List "dsh-bash-terminal-ts" in dsh.profile.bundles.
# 4. After client-side source changes only: node scripts/build-client.mjs
# 5. Restart dsh.
```

⚠️ プラグインのリポジトリ内で `npm install` を実行**しないでください**：`@deepseek-ai/*` のジャンクションがプライベートコピーに置き換えられ、プラグインはホストとモジュールインスタンスを共有しなくなります（その結果、ホストの API アップグレードへの追従が遅れます）。ロックファイルの更新は `npm install --package-lock-only` のみで行ってください。

完全な手順コマンドは [README の開発セクション](./README.md#本地开发安装junction-直连改源码即时生效) を参照してください。

## 4. インストールの検証

依存関係とインストール済みバージョンを確認：

```bash
grep -n "dsh-bash-terminal-ts" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/package.json').version"
```

ネイティブバインディングが実際にビルドされているか確認：

```bash
node -e "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/dsh-bash-terminal-ts/node_modules/node-pty')"
```

（出力がなければ成功です。エラーになる場合はビルドスクリプトがスキップされています。§1 を参照してください。）

公式の構成を確認：

```bash
dsh --profile <profile> --dump-config | grep tool-bash-terminal
```

`tool-bash-terminal` エントリーが含まれている必要があります（パッケージの `cordis.patch.yml` によって挿入されます）。

## 5. プラグインの検証

DSH を再起動し、Web ページをリフレッシュしてください。以下を確認します：

1. 設定 → 全般 に「デフォルトターミナル」のドロップダウン（PowerShell / Git Bash / MSYS2 / WSL）が表示される；
2. モデルが `shell` ツールを認識し、選択したターミナルを通じてコマンドを実行する；
3. `terminal` ツールが永続的なインタラクティブセッションを開く（シェルの状態が呼び出し間で保持される）。

## 6. トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: node-pty` | ビルドスクリプトを承認（§1）：`pnpm approve-builds`、または `onlyBuiltDependencies` + `pnpm rebuild node-pty`。 |
| `terminal` ツールの起動時にエラー | node-pty バインディングがビルドされていません。上記と同じ対処を行ってください。 |
| インタラクティブ PowerShell が `0x8009001d` で失敗 | PowerShell 5.1 は ConPTY 下では起動できません。[PowerShell 7](https://github.com/PowerShell/PowerShell/releases) をインストールしてください（ワンショットコマンドは影響を受けません）。 |
| `shell` が `msys2` に対して `backend unavailable` を報告 | MSYS2 をインストール（デフォルトは `C:\msys64`）するか、既存のインストール先を `msys2Path` に指定してください。 |
| プラグインが「無効/未マウント」と表示され、エラーは出ない | profile 構成を確認（§4）。peer 範囲がホストのラインと一致している必要があります（§ バージョン表）。 |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | dsh ランタイムの pnpm ポリシーが公開直後のバージョンをブロックします。profile の `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` にバージョンを追加してください。 |
| アップグレード後に古い client bundle が表示される | ブラウザをハードリフレッシュ（Ctrl+Shift+R）してください。 |

## 7. アンインストール

公式コマンドを使用：

```bash
dsh plugin --profile <profile> remove dsh-bash-terminal-ts
```

その後 DSH を再起動してください。`shell` / `terminal` ツールは消え、DSH 自身のシェルツール群はそのまま残ります。
