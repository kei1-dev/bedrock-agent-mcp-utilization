# devcontainer 使用方法

このドキュメントでは、devcontainer CLI を使用した開発環境の操作方法を説明します。

## 前提条件

- Docker（Docker Desktop または OrbStack など）
- [devcontainer CLI](https://github.com/devcontainers/cli)

### devcontainer CLI のインストール

```bash
# Homebrew
brew install devcontainer

# または npm
npm install -g @devcontainers/cli
```

## 基本操作

### devcontainer の起動

```bash
devcontainer up --workspace-folder .
```

### コマンドの実行

```bash
# 単一コマンドの実行
devcontainer exec --workspace-folder . <command>

# 例: npm install
devcontainer exec --workspace-folder . npm install

# 例: CDK デプロイ
devcontainer exec --workspace-folder . npx cdk deploy

# 対話シェルの起動
devcontainer exec --workspace-folder . bash
```

### devcontainer の再ビルド

設定ファイルを変更した場合は、再ビルドが必要です。

```bash
devcontainer up --workspace-folder . --remove-existing-container
```

### devcontainer の停止・削除

```bash
# コンテナIDの確認
docker ps -a --filter "label=devcontainer.local_folder=$(pwd)"

# コンテナの停止・削除
docker rm -f <container-id>
```

## 環境構成

| ツール | 説明 |
|--------|------|
| Node.js 24.x | fnm で管理（`.node-version` で指定） |
| AWS CLI v2 | AWS リソースの操作用 |
| Docker | Docker-in-Docker（DinD）構成 |

## AWS 認証情報

ホストマシンの `~/.aws` ディレクトリが存在する場合、devcontainer 起動時に自動的にコピーされます。

認証情報がない場合でも devcontainer は正常に起動しますが、AWS CLI コマンドは認証エラーになります。

## トラブルシューティング

### Docker コマンドが動作しない

devcontainer 起動後、Docker デーモンの起動に数秒かかる場合があります。少し待ってから再試行してください。

```bash
# Docker デーモンの状態確認
devcontainer exec --workspace-folder . docker info
```

### Node.js が見つからない

fnm 環境が読み込まれていない可能性があります。bash を明示的に起動してください。

```bash
devcontainer exec --workspace-folder . bash -c "node --version"
```
