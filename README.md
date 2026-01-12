# Bedrock Agent + AgentCore Gateway + MCP 統合

Amazon Bedrock AgentとAgentCore Gatewayを連携させ、MCPサーバーとの統合を実現するリポジトリです。

## 概要

### プロジェクトの目的

- Bedrock AgentからAgentCore Gateway経由でMCPサーバーに接続する構成の検証
- TypeScript CDKによるインフラストラクチャのコード化
- エンタープライズ環境での実用性評価

### アーキテクチャ

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   User      │────▶│  Bedrock Agent   │────▶│  Action Group     │────▶│  AgentCore        │
│             │     │  (Claude 4.5)    │     │  Lambda(s)        │     │  Gateway          │
└─────────────┘     └──────────────────┘     └───────────────────┘     └─────────┬─────────┘
                                                                                    │
                                          ┌─────────────────────────────────────────┤
                                          │                                         ▼
                                          │                                 ┌─────────────────┐
                                          │                                 │  MCP Tool       │
                                          │                                 │  Lambda         │
                                          │                                 └─────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │  AWS MCP Server  │
                                  │  (Read-only)     │
                                  └──────────────────┘
```

### 主要コンポーネント

| コンポーネント | 説明 |
|---------------|------|
| **Bedrock Agent** | Claude Sonnet 4.5を使用したAIエージェント。ユーザーリクエストを理解しタスクを実行 |
| **Action Group Lambda(s)** | Bedrock AgentとAgentCore Gatewayを接続するブリッジ。SigV4認証でMCPエンドポイントを呼び出す |
| **AgentCore Gateway** | MCPプロトコルに準拠したエンドポイントを提供。IAM認証でセキュアにアクセス |
| **MCP Tool Lambda(s)** | 実際のツール機能を実装。現在は現在時刻取得ツール（JST）、AWS MCP Server へのプロキシを提供 |

## 前提条件

- AWSアカウント
- AWS CLI（設定済み）
- Docker（devcontainer実行用）
- [devcontainer CLI](https://github.com/devcontainers/cli)

## 技術スタック

| 項目 | バージョン |
|------|-----------|
| Node.js | 24.x |
| AWS CDK | 2.234.1 |
| TypeScript | 5.9.x |
| Biome | 1.9.x（リンター/フォーマッター） |

## ディレクトリ構成

```
.
├── .devcontainer/              # devcontainer設定
│   ├── devcontainer.json       # コンテナ設定
│   ├── Dockerfile              # Ubuntu 24.04ベース
│   └── README.md               # devcontainer使用方法
├── infra/                      # CDK IaCコード
│   ├── bin/
│   │   └── infra.ts            # CDKアプリエントリポイント
│   ├── lib/
│   │   └── infra-stack.ts      # メインスタック定義
│   ├── lambda/
│   │   ├── action-group/       # Bedrock Agent → Gateway ブリッジ
│   │   │   ├── gateway-caller/
│   │   │   │   └── index.ts
│   │   │   └── aws-mcp-caller/
│   │   │       └── index.ts
│   │   └── mcp-tools/          # MCPツール実装
│   │       ├── current-time/
│   │       │   └── index.ts
│   │       └── aws-mcp-proxy/
│   │           └── index.ts
│   ├── test/
│   │   └── invoke-agent.ts     # 動作確認スクリプト
│   ├── biome.json              # リンター/フォーマッター設定
│   ├── jest.config.js          # テスト設定
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md               # インフラ詳細ドキュメント
├── .node-version               # Node.js バージョン指定
├── AGENTS.md                   # エージェント向けガイドライン
└── README.md                   # このファイル
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

devcontainer内での作業は `infra/` ディレクトリで行います。

### 4. AWS認証情報の設定

AWS認証情報の設定方法については [infra/README.md](./infra/README.md) を参照してください。

## デプロイ

### CDK Bootstrap（初回のみ）

```bash
devcontainer exec --workspace-folder . npx cdk bootstrap
```

### スタックのデプロイ

```bash
devcontainer exec --workspace-folder . npx cdk deploy
```

デプロイ完了後、以下の出力が表示されます：

- `AgentId`: Bedrock Agent の ID
- `AgentAliasId`: Agent Alias の ID
- `GatewayEndpoint`: AgentCore Gateway の MCP エンドポイント

### スタックの削除

```bash
devcontainer exec --workspace-folder . npx cdk destroy
```

## 動作確認

デプロイ後、以下のスクリプトでBedrock Agentの動作確認ができます。

```bash
cd infra
npx ts-node test/invoke-agent.ts \
  --agent-id <AGENT_ID> \
  --alias-id <ALIAS_ID> \
  --input "今何時ですか？"
```

詳細は [infra/README.md](./infra/README.md) を参照してください。

## 参考リンク

- [Amazon Bedrock AgentCore](https://aws.amazon.com/bedrock/agentcore/)
- [Amazon Bedrock AgentCore Developer Guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/)
- [Amazon Bedrock Agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents.html)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [devcontainer CLI](https://github.com/devcontainers/cli)
