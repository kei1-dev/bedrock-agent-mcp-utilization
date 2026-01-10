# Bedrock Agent CDK インフラストラクチャ

このディレクトリには、Amazon Bedrock Agentをデプロイするための AWS CDK コードが含まれています。

## 概要

シンプルなBedrock Agent（Claude Sonnet 4.5）を最小構成でデプロイします。

### 作成されるリソース

| リソース | 説明 |
|---------|------|
| Bedrock Agent | Claude Sonnet 4.5 を使用したAIエージェント |
| Agent Alias | 本番呼び出し用エイリアス (`live`) |

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

# トレース情報を表示
npx ts-node test/invoke-agent.ts \
  --agent-id YSKLF2T8GL \
  --alias-id PTZI9TKPDT \
  --input "今日の天気は？" \
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
こんにちは！私は親切で丁寧なアシスタントです。...
----------------------------------------
完了
```

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
