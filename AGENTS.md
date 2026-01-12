# Bedrock Agent MCP 活用リポジトリのエージェントガイドライン

このドキュメントは、このリポジトリで作業するエージェント型コーディングアシスタントのための包括的なガイドラインを提供します。ビルド/リント/テストコマンド、コードスタイルガイドライン、開発プラクティスをカバーしています。

## プロジェクト概要

このリポジトリは、AWS CDK を使用したインフラストラクチャ・アズ・コードにより、Amazon Bedrock Agent と AgentCore Gateway、および MCP (Model Context Protocol) サーバーの統合を実装しています。

### アーキテクチャ構成

```
User → Bedrock Agent (Claude 4.5) → Action Group Lambda(s) → AgentCore Gateway → MCP Tool Lambda(s)
                                                    │                                                    │
                                                    │                                                    └─→ AWS MCP Server
                                                    │
                                                    └─→ Simple MCP Tools (current-time)
```

- **Bedrock Agent**: Claude Sonnet 4.5 を使用、日本リージョン用推論プロファイル経由
- **Action Group Lambda(s)**:
  - `gateway-caller`: SigV4 認証で Gateway MCP エンドポイントを呼び出すブリッジ (現在時刻用)
  - `aws-mcp-caller`: AWS MCP Tools 用 Action Group Lambda
- **AgentCore Gateway**: IAM 認証付き MCP エンドポイント、複数の Lambda Target を管理
- **MCP Tool Lambda(s)**:
  - `current-time`: シンプルな MCP ツール（現在時刻取得）
  - `aws-mcp-proxy`: AWS MCP Server (https://aws-mcp.us-east-1.api.aws/mcp) へのプロキシ

## ビルド/リント/テストコマンド

### Infrastructure (CDK) コマンド

```bash
# Install dependencies
devcontainer exec --workspace-folder . npm install

# Build TypeScript
devcontainer exec --workspace-folder . npm run build

# Watch mode for development
devcontainer exec --workspace-folder . npm run watch

# Run tests
devcontainer exec --workspace-folder . npm run test

# Run single test file (when tests exist)
devcontainer exec --workspace-folder . npx jest path/to/test-file.test.ts

# CDK commands
devcontainer exec --workspace-folder . npx cdk synth          # Synthesize CloudFormation template
devcontainer exec --workspace-folder . npx cdk deploy         # Deploy stack
devcontainer exec --workspace-folder . npx cdk destroy        # Destroy stack
devcontainer exec --workspace-folder . npx cdk diff           # Show changes
devcontainer exec --workspace-folder . npx cdk bootstrap      # Bootstrap CDK (first time only)
```

### Lint/Format コマンド (Biome)

```bash
# Lint check
devcontainer exec --workspace-folder . npm run lint

# Lint with auto-fix
devcontainer exec --workspace-folder . npm run lint:fix

# Lint with unsafe auto-fix
devcontainer exec --workspace-folder . npm run lint:fix:unsafe

# Format code
devcontainer exec --workspace-folder . npm run format
```

### 開発環境

すべての CDK および AWS CLI コマンドは devcontainer 内で実行する必要があります:

```bash
# Start devcontainer
devcontainer up --workspace-folder .

# Run commands in devcontainer
devcontainer exec --workspace-folder . npm install
devcontainer exec --workspace-folder . npx cdk deploy
```

## コードスタイルガイドライン

### TypeScript 設定

- **Target**: ES2022
- **Module**: NodeNext
- **Strict mode**: Enabled (strict, noImplicitAny, strictNullChecks, etc.)
- **Source maps**: Inline source maps enabled
- **Declaration files**: Generated automatically

### Biome フォーマット設定

プロジェクトは Biome を使用してコードスタイルを統一しています。

| 設定項目 | 値 |
|---------|-----|
| インデント | スペース2つ |
| 行幅 | 100文字 |
| クォート | シングルクォート |
| セミコロン | 必須 |
| トレイリングカンマ | ES5スタイル |

### インポート規則

```typescript
// 実際のコードベースに基づくインポート順序
// 1. Node.js built-ins (node: prefix)
import * as path from 'node:path';

// 2. AWS CDK alpha packages
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as bedrock from '@aws-cdk/aws-bedrock-alpha';

// 3. AWS CDK lib packages
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib/core';

// 4. Type imports
import type { Construct } from 'constructs';
```

### 命名規則

- **Classes**: PascalCase (例: `InfraStack`, `BedrockAgentInput`)
- **Interfaces**: PascalCase (例: `BedrockAgentInput`, `MCPRequest`, `ToolResult`)
- **Variables**: camelCase (例: `gatewayEndpoint`, `agentAlias`, `foundationModel`)
- **Constants**: camelCase for module-level (例: `targetName`)
- **Functions**: camelCase (例: `handler`, `getCurrentTime`, `getToolName`)
- **Files**: kebab-case (例: `infra-stack.ts`, `gateway-caller/`, `current-time/`)

### 型定義

```typescript
// Bedrock Agent 入出力の型定義（実際のコードより）
interface BedrockAgentInput {
  messageVersion: string;
  agent: {
    name: string;
    id: string;
    alias: string;
    version: string;
  };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  function: string;
  parameters: Array<{
    name: string;
    type: string;
    value: string;
  }>;
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    function: string;
    functionResponse: {
      responseBody: {
        TEXT: {
          body: string;
        };
      };
    };
  };
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

// MCP プロトコルの型定義
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

// MCP ツール結果の型定義
interface ToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}
```

### エラーハンドリング

```typescript
// 実際の gateway-caller/index.ts より
try {
  const gatewayEndpoint = process.env.GATEWAY_ENDPOINT;
  if (!gatewayEndpoint) {
    throw new Error('GATEWAY_ENDPOINT environment variable is required');
  }

  const response = await aws.fetch(`${gatewayEndpoint}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mcpRequest),
  });

  if (!response.ok) {
    throw new Error(`Gateway call failed: ${response.status} ${response.statusText}`);
  }

  const mcpResponse = (await response.json()) as MCPResponse;

  if (mcpResponse.error) {
    throw new Error(`MCP Error: ${mcpResponse.error.message}`);
  }

  // Process response...
} catch (error) {
  console.error('Error processing request:', error);

  // Return structured error response
  return {
    messageVersion: '1.0',
    response: {
      actionGroup: event.actionGroup,
      function: event.function,
      functionResponse: {
        responseBody: {
          TEXT: {
            body: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        },
      },
    },
    sessionAttributes: event.sessionAttributes || {},
    promptSessionAttributes: event.promptSessionAttributes || {},
  };
}
```

### AWS CDK パターン

```typescript
// 実際の infra-stack.ts より

// Foundation Model と推論プロファイルの設定
const foundationModel = bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_4_5_V1_0;
const inferenceProfile = bedrock.CrossRegionInferenceProfile.fromConfig({
  geoRegion: bedrock.CrossRegionInferenceProfileRegion.JP,
  model: foundationModel,
});

// Bedrock Agent の作成
const agent = new bedrock.Agent(this, 'SimpleBedrockAgent', {
  agentName: 'simple-bedrock-agent',
  foundationModel: inferenceProfile,
  instruction: 'あなたは親切で丁寧なアシスタントです。ユーザーの質問に対して、簡潔かつ正確に日本語で回答してください。',
  description: 'シンプルなBedrock Agent検証用',
  idleSessionTTL: cdk.Duration.minutes(10),
  shouldPrepareAgent: true,
});

// Agent Alias の作成
const agentAlias = new bedrock.AgentAlias(this, 'SimpleAgentAlias', {
  agent: agent,
  agentAliasName: 'live',
  description: '本番用エイリアス',
});

// AgentCore Gateway の作成
const gateway = new agentcore.Gateway(this, 'McpGateway', {
  gatewayName: 'bedrock-agent-mcp-gateway',
  authorizerConfiguration: agentcore.GatewayAuthorizer.usingAwsIam(),
});

// Lambda Target の追加
gateway.addLambdaTarget('CurrentTimeTargetV2', {
  gatewayTargetName: targetName,
  lambdaFunction: currentTimeFunction,
  toolSchema: agentcore.ToolSchema.fromInline([
    {
      name: 'getCurrentTime',
      description: 'Get current time in Japan Standard Time (JST)',
      inputSchema: {
        type: 'object',
        properties: {},
      } as any,  // CDK で型が厳密でない場合のみ使用
    },
  ]),
});

// AWS MCP Proxy Lambda Target の追加
const awsMcpProxyFunction = new lambda_nodejs.NodejsFunction(this, 'AwsMcpProxyFunction', {
  runtime: lambda.Runtime.NODEJS_24_X,
  entry: path.join(__dirname, '../lambda/mcp-tools/aws-mcp-proxy/index.ts'),
  handler: 'handler',
  functionName: 'bedrock-agent-aws-mcp-proxy',
  timeout: cdk.Duration.seconds(120),
  bundling: {
    minify: false,
    sourceMap: true,
    target: 'node24',
  },
});

awsMcpProxyFunction.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['aws-mcp:InvokeMcp', 'aws-mcp:CallReadOnlyTool'],
    resources: ['*'],
  })
);

const awsMcpTargetName = 'aws-mcp-proxy';
gateway.addLambdaTarget('AwsMcpProxyTarget', {
  gatewayTargetName: awsMcpTargetName,
  lambdaFunction: awsMcpProxyFunction,
  toolSchema: agentcore.ToolSchema.fromInline([
    {
      name: 'search_documentation',
      description: 'Search across all AWS documentation',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      } as any,
    },
    // ... 他の AWS MCP ツール
  ]),
});

// CDK Outputs
new cdk.CfnOutput(this, 'AgentId', {
  value: agent.agentId,
  description: 'Bedrock Agent ID',
});
new cdk.CfnOutput(this, 'GatewayEndpoint', {
  value: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
  description: 'AgentCore Gateway MCP Endpoint',
});
new cdk.CfnOutput(this, 'AwsMcpCallerFunctionArn', {
  value: awsMcpCallerFunction.functionArn,
  description: 'AWS MCP Caller Lambda ARN (for Action Group configuration)',
});
```

### Lambda Function パターン

```typescript
// NodejsFunction を使用した TypeScript Lambda のバンドリング
const actionGroupFunction = new lambda_nodejs.NodejsFunction(this, 'ActionGroupFunction', {
  runtime: lambda.Runtime.NODEJS_24_X,
  entry: path.join(__dirname, '../lambda/action-group/gateway-caller/index.ts'),
  handler: 'handler',
  functionName: 'bedrock-agent-action-group-gateway-caller',
  description: 'Bedrock Agent Action Group that calls AgentCore Gateway MCP endpoint',
  environment: {
    GATEWAY_ENDPOINT: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
    TARGET_NAME: targetName,
  },
  bundling: {
    minify: false,
    sourceMap: true,
    target: 'node24',
  },
});

// IAM 権限の付与
gateway.grantInvoke(actionGroupFunction);

actionGroupFunction.addPermission('BedrockAgentInvoke', {
  principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:agent/${agent.agentId}`,
});
```

### MCP Tool Lambda パターン

```typescript
// AgentCore Gateway Lambda Target としての実装
// Gateway はツール引数のみを event として渡し、
// ツール名は context.clientContext.custom.bedrockAgentCoreToolName で取得

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function getToolName(context: any): string {
  const custom = context?.clientContext?.custom ?? context?.client_context?.custom ?? {};
  const fullName: string = custom.bedrockAgentCoreToolName ?? '';
  // ツール名は {target}___{tool} 形式でプレフィックスされる
  const parts = fullName.split('___');
  return parts.length > 1 ? parts.slice(1).join('___') : fullName;
}

export const handler = async (_event: any, context: any): Promise<ToolResult> => {
  const toolName = getToolName(context);

  if (toolName !== 'getCurrentTime') {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
    };
  }

  return getCurrentTime();
};
```

### AWS MCP Proxy Lambda パターン

```typescript
// AWS MCP Server (https://aws-mcp.us-east-1.api.aws/mcp) へのプロキシ
// SigV4 認証 (service: 'aws-mcp', region: 'us-east-1') でリクエストを転送

import { AwsClient } from 'aws4fetch';

const AWS_MCP_ENDPOINT = 'https://aws-mcp.us-east-1.api.aws/mcp';

export const handler = async (event: any, context: any): Promise<ToolResult> => {
  const toolName = getToolName(context);

  const aws = new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    service: 'aws-mcp',
    region: 'us-east-1',
  });

  // AWS MCP Server のツール名形式: aws___<tool_name>
  const awsMcpToolName = toolName.startsWith('aws___') ? toolName : `aws___${toolName}`;

  const mcpRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: awsMcpToolName,
      arguments: event || {},
    },
  };

  const response = await aws.fetch(AWS_MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mcpRequest),
  });

  const mcpResponse = await response.json();
  return mcpResponse.result;
};
```

### Documentation

- **JSDoc comments**: エクスポートされた関数と複雑なインターフェースに使用
- **Inline comments**: 複雑なビジネスロジックや非自明なコードに使用
- **README updates**: 新しい機能を追加する際にドキュメントを更新

### File Organization

```
infra/
├── bin/
│   └── infra.ts                # CDK アプリエントリポイント
├── lib/
│   └── infra-stack.ts          # メインスタック定義
├── lambda/
│   ├── action-group/
│   │   ├── gateway-caller/
│   │   │   ├── index.ts        # Bedrock Agent → Gateway ブリッジ (現在時刻用)
│   │   │   └── package.json
│   │   └── aws-mcp-caller/
│   │       ├── index.ts        # AWS MCP Tools 用 Action Group Lambda
│   │       └── package.json
│   └── mcp-tools/
│       ├── current-time/
│       │   └── index.ts        # MCP ツール実装 (現在時刻)
│       └── aws-mcp-proxy/
│           ├── index.ts        # AWS MCP Server へのプロキシ
│           └── package.json
├── test/
│   └── invoke-agent.ts         # エージェント動作確認スクリプト
├── biome.json                  # Biome リンター/フォーマッター設定
├── cdk.json                    # CDK 設定
├── jest.config.js              # Jest 設定
├── package.json
├── tsconfig.json
└── README.md
```

### Security Best Practices

- **Never commit secrets**: 環境変数または AWS Parameter Store を使用
- **IAM least privilege**: 最小限必要な権限のみを付与（`gateway.grantInvoke()` 使用）
- **Input validation**: Validate all inputs, especially from external sources
- **Error messages**: エラーメッセージで機密情報を公開しない
- **SigV4 authentication**: AgentCore Gateway への呼び出しは `aws4fetch` で署名
- **AWS MCP Server access**: `aws-mcp:InvokeMcp` と `aws-mcp:CallReadOnlyTool` のみ許可（Write 操作を禁止）

### Development Workflow

1. **Code changes**: ローカルエディタで変更を行う
2. **Lint/Format**: `npm run lint:fix && npm run format` で自動修正
3. **Build**: `npm run build` を実行して TypeScript コンパイルを確認
4. **Deploy**: CDK デプロイに devcontainer を使用
5. **Verify**: AWS console とログで適切なデプロイを確認

### Commit Message Conventions

conventional commit 形式に従ってください:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test additions/updates
- `chore:` - Maintenance tasks

Example: `feat: add MCP gateway integration for Bedrock Agent`

---

## エージェント向け注意事項

- **No Cursor rules**: 既存のコードで確立されたパターンに従ってください
- **No Copilot instructions**: このドキュメントをプライマリのガイドラインとして使用してください
- **Japanese comments**: コードベースには日本語のコメントが含まれています - 一貫性を維持してください
- **Biome**: ESLint/Prettier ではなく Biome を使用しています

---

## AWS MCP Tools 統合

### 概要

AWS MCP Server (https://aws-mcp.us-east-1.api.aws/mcp) を通じて、AWS ドキュメント検索、API 呼び出し（Read-only）などの機能を提供します。

### 公開ツール一覧

| ツール名 | 説明 | 必須パラメータ |
|----------|------|----------------|
| `search_documentation` | AWS ドキュメント検索 | `query` |
| `read_documentation` | ドキュメントページ取得 | `url` |
| `list_regions` | AWS リージョン一覧 | なし |
| `get_regional_availability` | サービスのリージョン対応状況 | `service` |
| `suggest_aws_commands` | AWS API コマンド提案 | `query` |
| `call_aws` | AWS API 呼び出し (Read-only) | `service`, `operation` |

### Action Group の CDK 定義

Action Group は CDK L2 コンストラクトで定義されており、デプロイ時に自動作成されます。手動作業は不要です。

```typescript
// Current Time Action Group
const currentTimeActionGroup = new bedrock.AgentActionGroup({
  name: 'CurrentTimeTools',
  description: 'Tools for getting current time in JST',
  executor: bedrock.ActionGroupExecutor.fromLambda(gatewayCallerFunction),
  functionSchema: new bedrock.FunctionSchema({
    functions: [
      {
        name: 'getCurrentTime',
        description: 'Get the current time in Japan Standard Time (JST)',
        parameters: {},
      },
    ],
  }),
  enabled: true,
});

// AWS MCP Action Group
const awsMcpActionGroup = new bedrock.AgentActionGroup({
  name: 'AwsMcpTools',
  description: 'AWS MCP tools for documentation search and read-only API access',
  executor: bedrock.ActionGroupExecutor.fromLambda(awsMcpCallerFunction),
  functionSchema: new bedrock.FunctionSchema({
    functions: [
      {
        name: 'search_documentation',
        description: 'Search across all AWS documentation...',
        parameters: {
          query: {
            type: bedrock.ParameterType.STRING,
            required: true,
            description: 'Search query string',
          },
        },
      },
      // ... 他のツール定義
    ],
  }),
  enabled: true,
});

// Agent に Action Group を追加
const agent = new bedrock.Agent(this, 'SimpleBedrockAgent', {
  // ...
  actionGroups: [currentTimeActionGroup, awsMcpActionGroup],
});
```

### Agent Instruction

Agent の instruction には、利用可能なすべてのツールの説明が含まれています：

1. **search_documentation**: AWS ドキュメント検索
2. **read_documentation**: ドキュメントページ取得
3. **list_regions**: AWS リージョン一覧
4. **get_regional_availability**: サービスのリージョン対応状況
5. **suggest_aws_commands**: AWS API コマンド提案
6. **call_aws**: AWS API 呼び出し (Read-only)
7. **getCurrentTime**: 日本標準時での現在時刻取得
