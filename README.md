# Bedrock Agent + AgentCore Gateway 検証

Amazon Bedrock AgentとAgentCore Gatewayを連携させ、MCPサーバーとの統合を検証するリポジトリです。

## 概要

### プロジェクトの目的

- Bedrock AgentからAgentCore Gateway経由でMCPサーバーに接続する構成の検証
- TypeScript CDKによるインフラストラクチャのコード化
- エンタープライズ環境での実用性評価

### アーキテクチャ

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  Bedrock Agent  │────▶│  AgentCore Gateway  │────▶│   MCP Server    │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
```

- **Bedrock Agent**: ユーザーリクエストを理解し、タスクを実行するAIエージェント
- **AgentCore Gateway**: APIやMCPサーバーをエージェント互換ツールに変換するゲートウェイ
- **MCP Server**: Model Context Protocolに準拠した外部ツールサーバー

## 前提条件

- AWSアカウント
- AWS CLI（設定済み）
- Docker（devcontainer実行用）
- [devcontainer CLI](https://github.com/devcontainers/cli)

## 技術スタック

| 項目 | バージョン |
|------|-----------|
| Node.js | 24.x (LTS) |
| AWS CDK | 2.234.x |
| TypeScript | 5.x |

## ディレクトリ構成（予定）

```
.
├── .devcontainer/      # devcontainer設定
├── infra/              # CDK IaCコード
│   ├── bin/
│   └── lib/
├── src/                # アプリケーションコード
├── package.json
├── tsconfig.json
└── README.md
```

## 開発環境

### ローカル環境（コード編集）

コードの編集はローカル環境で行います。任意のエディタを使用してください。

### devcontainer（ライブラリインストール・実行）

ライブラリのインストールやCDKコマンドの実行はdevcontainer内で行います。

```bash
# devcontainerのビルドと起動
devcontainer up --workspace-folder .

# devcontainer内でコマンドを実行
devcontainer exec --workspace-folder . npm install
devcontainer exec --workspace-folder . npx cdk deploy
```

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd bedrock-agent-mcp-utilization
```

### 2. devcontainerの起動

```bash
devcontainer up --workspace-folder .
```

### 3. 依存関係のインストール

```bash
devcontainer exec --workspace-folder . npm install
```

### 4. AWS認証情報の設定

ローカルのAWS認証情報がdevcontainer内で利用可能であることを確認してください。

## デプロイ

### CDK Bootstrap（初回のみ）

```bash
devcontainer exec --workspace-folder . npx cdk bootstrap
```

### スタックのデプロイ

```bash
devcontainer exec --workspace-folder . npx cdk deploy
```

### スタックの削除

```bash
devcontainer exec --workspace-folder . npx cdk destroy
```

## 参考リンク

- [Amazon Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/)
- [Amazon Bedrock AgentCore Developer Guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/)
- [Amazon Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [devcontainer CLI](https://github.com/devcontainers/cli)
