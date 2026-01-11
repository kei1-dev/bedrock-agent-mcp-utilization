# Bedrock Agent MCP 活用リポジトリのエージェントガイドライン

このドキュメントは、このリポジトリで作業するエージェント型コーディングアシスタントのための包括的なガイドラインを提供します。ビルド/リント/テストコマンド、コードスタイルガイドライン、開発プラクティスをカバーしています。

## プロジェクト概要

このリポジトリは、AWS CDK を使用したインフラストラクチャ・アズ・コードにより、Amazon Bedrock Agent と AgentCore Gateway、および MCP (Model Context Protocol) サーバーの統合を実装しています。

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

### インポート規則

```typescript
// インポートをタイプごとにグループ化し、空行で区切る
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import * as bedrock from '@aws-cdk/aws-bedrock-alpha';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
```

### 命名規則

- **Classes**: PascalCase (例: `InfraStack`, `BedrockAgentInput`)
- **Interfaces**: PascalCase with 'I' prefix for input types (例: `BedrockAgentInput`, `MCPRequest`)
- **Variables**: camelCase (例: `gatewayEndpoint`, `agentAlias`)
- **Constants**: UPPER_SNAKE_CASE (例: `GATEWAY_ENDPOINT`)
- **Functions**: camelCase (例: `handler`, `getCurrentTime`)
- **Files**: kebab-case for directories, camelCase for files (例: `infra-stack.ts`, `gateway-caller`)

### 型定義

```typescript
// 複雑なオブジェクトには明示的な型を使用する
interface BedrockAgentInput {
  messageVersion: string;
  agent: {
    name: string;
    id: string;
    alias: string;
    version: string;
  };
  // ... other properties
}

// 'as any' は控えめに使用し、適切な型付けを優先する
inputSchema: {
  type: 'object',
  properties: {},
} as any, // CDK で要求される場合のみ
```

### エラーハンドリング

```typescript
try {
  // Operation that might fail
  const response = await aws.fetch(endpoint, options);

  if (!response.ok) {
    throw new Error(`Gateway call failed: ${response.status} ${response.statusText}`);
  }

  // Process response
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
// Use descriptive resource names
const agent = new bedrock.Agent(this, 'SimpleBedrockAgent', {
  agentName: 'simple-bedrock-agent',
  // ... other properties
});

// Use CDK outputs for important values
new cdk.CfnOutput(this, 'AgentId', {
  value: agent.agentId,
  description: 'Bedrock Agent ID',
});

// Use proper IAM permissions
actionGroupFunction.addPermission('BedrockAgentInvoke', {
  principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
  action: 'lambda:InvokeFunction',
  sourceArn: `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:agent/${agent.agentId}`,
});
```

### Lambda Function パターン

```typescript
// Use proper TypeScript types for Lambda handlers
export const handler = async (
  event: BedrockAgentInput
): Promise<BedrockAgentResponse> => {
  // Handler implementation
};

// Use NodejsFunction for TypeScript bundling
const lambdaFunction = new lambda_nodejs.NodejsFunction(this, 'FunctionName', {
  runtime: lambda.Runtime.NODEJS_24_X,
  entry: path.join(__dirname, 'path/to/index.ts'),
  bundling: {
    minify: false,
    sourceMap: true,
    target: 'node24',
  },
});
```

### Documentation

- **JSDoc comments**: エクスポートされた関数と複雑なインターフェースに使用
- **Inline comments**: 複雑なビジネスロジックや非自明なコードに使用
- **README updates**: 新しい機能を追加する際にドキュメントを更新

### Testing Guidelines

```typescript
// Jest configuration (jest.config.js)
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
};

// Example test structure
describe('InfraStack', () => {
  test('should create Bedrock Agent', () => {
    // Test implementation
  });
});
```

### File Organization

```
infra/
├── lib/                    # CDK constructs
│   ├── infra-stack.ts     # Main stack
│   └── infra-stack.d.ts   # Generated types
├── lambda/                 # Lambda functions
│   ├── action-group/
│   └── mcp-tools/
├── test/                   # Test files
├── package.json
├── tsconfig.json
├── jest.config.js
└── .gitignore
```

### Security Best Practices

- **Never commit secrets**: 環境変数または AWS Parameter Store を使用
- **IAM least privilege**: 最小限必要な権限のみを付与
- **Input validation**: Validate all inputs, especially from external sources
- **Error messages**: エラーメッセージで機密情報を公開しない

### Development Workflow

1. **Code changes**: ローカルエディタで変更を行う
2. **Build**: `devcontainer exec --workspace-folder . npm run build` を実行して TypeScript コンパイルを確認する
3. **Deploy**: CDK デプロイに devcontainer を使用
4. **Verify**: AWS console とログで適切なデプロイを確認

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

