# Bedrock Agent CDK インフラストラクチャ

このディレクトリには、Amazon Bedrock Agentをデプロイするための AWS CDK コードが含まれています。

## 概要

Bedrock Agent と AgentCore Gateway を使用した MCP 統合をデプロイします。

### 作成されるリソース

| リソース | 説明 |
|---------|------|
| Bedrock Agent | Claude Sonnet 4.5 を使用したAIエージェント（日本リージョン用推論プロファイル経由） |
| Agent Alias | 本番呼び出し用エイリアス (`live`) |
| AgentCore Gateway | MCP プロトコルに準拠したエンドポイントを提供（IAM認証） |
| Gateway Caller Lambda | Bedrock Agent → Gateway ブリッジ（現在時刻ツール用） |
| AWS MCP Caller Lambda | Bedrock Agent → Gateway ブリッジ（AWS MCP Tools用） |
| Current Time Lambda | 現在時刻取得ツール（JST）を提供 |
| AWS MCP Proxy Lambda | AWS MCP Server へのプロキシ（Read-only操作のみ） |

### 利用可能なツール

| ツール名 | Action Group | 説明 |
|---------|--------------|------|
| `getCurrentTime` | CurrentTimeTools | 日本標準時(JST)での現在時刻を取得 |
| `search_documentation` | AwsMcpTools | AWS ドキュメント検索 |
| `read_documentation` | AwsMcpTools | AWS ドキュメントページを取得 |
| `list_regions` | AwsMcpTools | AWS リージョン一覧を取得 |
| `get_regional_availability` | AwsMcpTools | サービスのリージョン対応状況を確認 |
| `suggest_aws_commands` | AwsMcpTools | AWS API コマンドを提案 |
| `call_aws` | AwsMcpTools | 読み取り専用 AWS API を呼び出し |

## 前提条件

- AWSアカウント
- Bedrock で Claude Sonnet 4.5 モデルへのアクセスが有効化されていること
- devcontainer 環境（推奨）

## AWS認証情報の設定

### devcontainer内で `aws configure` を実行

devcontainer内で直接AWS CLIを使って認証情報を設定します。

```bash
# devcontainerに入る
devcontainer exec --workspace-folder . bash

# AWS CLIで認証情報を設定
aws configure
```

以下の項目を入力します:

| 項目 | 値 |
|------|-----|
| AWS Access Key ID | アクセスキーID |
| AWS Secret Access Key | シークレットアクセスキー |
| Default region name | `ap-northeast-1` |
| Default output format | `json` |

設定後、認証情報が正しく設定されたか確認:

```bash
aws sts get-caller-identity
```

### 認証情報の確認

どの方法でも、以下のコマンドで認証情報が正しく設定されているか確認できます:

```bash
devcontainer exec --workspace-folder . aws sts get-caller-identity
```

成功すると、以下のような出力が表示されます:

```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

## エージェントのバージョンとエイリアス

Bedrock Agentには**バージョン**と**エイリアス**の概念があります。

### バージョン

| バージョン | 説明 |
|-----------|------|
| DRAFT | 編集可能な作業用バージョン。`cdk deploy`で更新される |
| 番号付き (1, 2, 3...) | 不変のスナップショット。新しいエイリアス作成時に自動生成 |

### エイリアス

| エイリアス | 説明 |
|-----------|------|
| TSTALIASID | テスト用。DRAFTバージョンを直接参照可能 |
| live | 本番用。番号付きバージョンを参照 |

### 重要な注意点

- `npx cdk deploy`はDRAFTバージョンを更新するが、**番号付きバージョンは自動作成されない**
- 本番エイリアス（`live`）を最新のDRAFTに追従させるには、手動でバージョン作成とエイリアス更新が必要
- 詳細は「5. エイリアスを最新バージョンに更新」を参照

## デプロイ手順

### 1. 依存関係のインストール

```bash
cd infra
npm install
```

### 2. TypeScriptのビルド

```bash
npm run build
```

### 3. CDK Bootstrap（初回のみ）

対象のAWSアカウント・リージョンでCDKを初めて使用する場合に実行します。

```bash
npx cdk bootstrap
```

### 4. スタックのデプロイ

```bash
npx cdk deploy
```

デプロイ完了後、以下の出力が表示されます:

- `AgentId`: Bedrock Agent の ID
- `AgentAliasId`: Agent Alias の ID

### 5. エイリアスを最新バージョンに更新（2回目以降のデプロイ時）

`cdk deploy`後、本番エイリアス（`live`）を最新のDRAFTから作成した新バージョンに更新します。

```bash
# 環境変数を設定（デプロイ時の出力値を使用）
export AGENT_ID=<AgentId>
export LIVE_ALIAS_ID=<AgentAliasId>

# 現在のエイリアスが参照しているバージョンを確認
aws bedrock-agent get-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-id $LIVE_ALIAS_ID \
  --query 'agentAlias.routingConfiguration[0].agentVersion' \
  --output text

# 新しいバージョンを作成するために一時エイリアスを作成
TEMP_ALIAS_ID=$(aws bedrock-agent create-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-name temp-version \
  --query 'agentAlias.agentAliasId' \
  --output text)

echo "Created temp alias: $TEMP_ALIAS_ID"

# 作成されたバージョン番号を確認（数秒待つ）
sleep 3
NEW_VERSION=$(aws bedrock-agent get-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-id $TEMP_ALIAS_ID \
  --query 'agentAlias.routingConfiguration[0].agentVersion' \
  --output text)

echo "New version: $NEW_VERSION"

# liveエイリアスを新しいバージョンに更新
aws bedrock-agent update-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-id $LIVE_ALIAS_ID \
  --agent-alias-name live \
  --routing-configuration "[{\"agentVersion\": \"$NEW_VERSION\"}]"

# 一時エイリアスを削除
aws bedrock-agent delete-agent-alias \
  --agent-id $AGENT_ID \
  --agent-alias-id $TEMP_ALIAS_ID

echo "Updated live alias to version $NEW_VERSION"
```

> **ヒント**: 初回デプロイ時はCDKが自動的にバージョンを作成するため、この手順は不要です。

## 便利なコマンド

| コマンド | 説明 |
|---------|------|
| `npm run build` | TypeScriptをJavaScriptにコンパイル |
| `npm run watch` | 変更を監視して自動コンパイル |
| `npm run test` | Jestユニットテストを実行 |
| `npx cdk synth` | CloudFormationテンプレートを出力 |
| `npx cdk diff` | デプロイ済みスタックとの差分を表示 |
| `npx cdk deploy` | スタックをデプロイ |
| `npx cdk destroy` | スタックを削除 |

### エージェント管理コマンド

| コマンド | 説明 |
|---------|------|
| `aws bedrock-agent list-agent-versions --agent-id <ID>` | バージョン一覧を表示 |
| `aws bedrock-agent list-agent-aliases --agent-id <ID>` | エイリアス一覧を表示 |
| `aws bedrock-agent get-agent-alias --agent-id <ID> --agent-alias-id <ALIAS_ID>` | エイリアスの詳細を表示 |
| `aws bedrock-agent prepare-agent --agent-id <ID>` | DRAFTバージョンを準備 |

## 動作確認

デプロイ後、以下のスクリプトでBedrock Agentの動作確認ができます。

> **注意**: AWS CLIは `InvokeAgent` API（ストリーミング）をサポートしていないため、専用のスクリプトを使用します。

### スクリプトの実行

```bash
cd infra
npx ts-node test/invoke-agent.ts --agent-id <AGENT_ID> --alias-id <ALIAS_ID> --input "メッセージ"
```

### パラメータ

| パラメータ | 説明 | 必須 |
|-----------|------|------|
| `--agent-id` | Bedrock Agent ID（デプロイ時に出力される `AgentId`） | Yes |
| `--alias-id` | Agent Alias ID（デプロイ時に出力される `AgentAliasId`） | Yes |
| `--input` | エージェントに送信するメッセージ | Yes |
| `--trace` | トレース情報を表示 | No |
| `--region` | AWSリージョン（デフォルト: `ap-northeast-1`） | No |

### 実行例

```bash
# 基本的な呼び出し
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "こんにちは。あなたは何ができますか？"

# 現在時刻を取得
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "今何時ですか？"

# AWS ドキュメント検索
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "AWS Lambda のコールドスタートについて調べてください"

# リージョン一覧を取得
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "AWSのリージョン一覧を教えて"

# Bedrock のリージョン対応状況を確認
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "Bedrockはどのリージョンで利用できますか？"

# AWS API コマンドを提案
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "S3バケットの一覧を取得する方法を教えて"

# トレース情報を表示
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "Lambda関数の一覧を取得してください" \
  --trace
```

### 期待される出力

```
========================================
Bedrock Agent 動作確認
========================================
Agent ID:    YSKLF2T8GL
Alias ID:    PTZI9TKPDT
Session ID:  session-1234567890-abc123
Region:      ap-northeast-1
入力:        こんにちは。あなたは何ができますか？
----------------------------------------

応答:
----------------------------------------
こんにちは！私は以下の機能を持つアシスタントです：

1. **現在時刻の取得**: 日本標準時(JST)での現在時刻をお伝えできます
2. **AWSドキュメント検索**: AWSのドキュメント、APIリファレンス、ベストプラクティスを検索できます
3. **AWSリージョン情報**: 利用可能なAWSリージョンの一覧やサービスの対応状況を確認できます
4. **AWSコマンド提案**: AWS APIの使い方を提案できます
5. **AWS API呼び出し**: 読み取り専用のAWS APIを実行できます（Describe*、List*、Get*操作）

何かお手伝いできることはありますか？
----------------------------------------
完了
```

## AWS MCP Tools について

このエージェントは [AWS MCP Server](https://aws-mcp.us-east-1.api.aws/mcp) と統合されており、以下の操作が可能です：

### 読み取り専用の制限

セキュリティのため、AWS API 呼び出しは**読み取り専用操作のみ**に制限されています：
- `Describe*` 操作（例: `DescribeInstances`）
- `List*` 操作（例: `ListBuckets`）
- `Get*` 操作（例: `GetFunction`）

書き込み操作（`Create*`, `Update*`, `Delete*` など）は実行できません。

## クリーンアップ

作成したリソースを削除するには:

```bash
npx cdk destroy
```

## トラブルシューティング

### "Unable to resolve AWS account" エラー

AWS認証情報が正しく設定されていません。上記の「AWS認証情報の設定」セクションを参照してください。

### "Access denied" エラー（Bedrockモデル）

Bedrock コンソールで Claude Sonnet 4.5 モデルへのアクセスを有効化してください:

1. AWS コンソール → Amazon Bedrock → Model access
2. Claude Sonnet 4.5 を選択して「Request model access」
