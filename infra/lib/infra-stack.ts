import * as path from 'node:path';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import * as bedrock from '@aws-cdk/aws-bedrock-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cdk from 'aws-cdk-lib/core';
import type { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Claude Sonnet 4.5のモデルを定義
    const foundationModel = bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_SONNET_4_5_V1_0;

    // 日本リージョン用の推論プロファイルを作成
    // Claude Sonnet 4.5はオンデマンドスループットをサポートしていないため、
    // 推論プロファイル経由で呼び出す必要がある
    const inferenceProfile = bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: bedrock.CrossRegionInferenceProfileRegion.JP,
      model: foundationModel,
    });

    // ========================================
    // MCP Tool Lambda Functions
    // ========================================

    // Current Time MCP Tool Lambda
    const currentTimeFunction = new lambda_nodejs.NodejsFunction(this, 'CurrentTimeFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/mcp-tools/current-time/index.ts'),
      handler: 'handler',
      functionName: 'bedrock-agent-mcp-current-time',
      description: 'MCP tool that returns current time in JST',
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node24',
      },
    });

    // AWS MCP Proxy Lambda (proxies to AWS MCP Server)
    const awsMcpProxyFunction = new lambda_nodejs.NodejsFunction(this, 'AwsMcpProxyFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/mcp-tools/aws-mcp-proxy/index.ts'),
      handler: 'handler',
      functionName: 'bedrock-agent-aws-mcp-proxy',
      description: 'MCP proxy that forwards tool calls to AWS MCP Server with SigV4 auth',
      timeout: cdk.Duration.seconds(120),
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node24',
      },
    });

    // Grant AWS MCP Proxy Lambda permissions to call AWS MCP Server (read-only)
    awsMcpProxyFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['aws-mcp:InvokeMcp', 'aws-mcp:CallReadOnlyTool'],
        resources: ['*'],
      })
    );

    // ========================================
    // AgentCore Gateway
    // ========================================

    const gateway = new agentcore.Gateway(this, 'McpGateway', {
      gatewayName: 'bedrock-agent-mcp-gateway',
      authorizerConfiguration: agentcore.GatewayAuthorizer.usingAwsIam(),
    });

    // Add Current Time Lambda Target to Gateway
    const currentTimeTargetName = 'current-time-target-v2';
    gateway.addLambdaTarget('CurrentTimeTargetV2', {
      gatewayTargetName: currentTimeTargetName,
      lambdaFunction: currentTimeFunction,
      toolSchema: agentcore.ToolSchema.fromInline([
        {
          name: 'getCurrentTime',
          description: 'Get the current time in Japan Standard Time (JST)',
          inputSchema: {
            type: 'object',
            properties: {},
          } as any,
        },
      ]),
    });

    // Add AWS MCP Proxy Lambda Target to Gateway
    const awsMcpTargetName = 'aws-mcp-proxy';
    gateway.addLambdaTarget('AwsMcpProxyTarget', {
      gatewayTargetName: awsMcpTargetName,
      lambdaFunction: awsMcpProxyFunction,
      toolSchema: agentcore.ToolSchema.fromInline([
        {
          name: 'search_documentation',
          description:
            'Search across all AWS documentation, API references, best practices, and service guides.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query string' },
            },
            required: ['query'],
          } as any,
        },
        {
          name: 'read_documentation',
          description: 'Retrieve and convert AWS documentation pages to markdown format.',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL of the AWS documentation page' },
            },
            required: ['url'],
          } as any,
        },
        {
          name: 'list_regions',
          description: 'Retrieve a list of all AWS regions with their identifiers and names.',
          inputSchema: {
            type: 'object',
            properties: {},
          } as any,
        },
        {
          name: 'get_regional_availability',
          description:
            'Check AWS regional availability for services, features, and CloudFormation resources.',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'AWS service name (e.g., "bedrock", "lambda")',
              },
            },
            required: ['service'],
          } as any,
        },
        {
          name: 'suggest_aws_commands',
          description: 'Get descriptions and syntax help for relevant AWS APIs.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Description of what you want to do',
              },
            },
            required: ['query'],
          } as any,
        },
        {
          name: 'call_aws',
          description: 'Execute read-only AWS API calls (Describe*, List*, Get* operations only).',
          inputSchema: {
            type: 'object',
            properties: {
              service: {
                type: 'string',
                description: 'AWS service name (e.g., "ec2", "s3", "lambda")',
              },
              operation: {
                type: 'string',
                description: 'API operation name (e.g., "DescribeInstances", "ListBuckets")',
              },
              parameters: {
                type: 'string',
                description: 'Operation parameters as JSON string (e.g., {"InstanceIds": ["i-123"]})',
              },
              region: {
                type: 'string',
                description: 'AWS region (optional, defaults to ap-northeast-1)',
              },
            },
            required: ['service', 'operation'],
          } as any,
        },
      ]),
    });

    // ========================================
    // Action Group Lambda Functions
    // ========================================

    // Gateway Caller Lambda (bridges Bedrock Agent to Gateway for current-time)
    const gatewayCallerFunction = new lambda_nodejs.NodejsFunction(this, 'ActionGroupFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/action-group/gateway-caller/index.ts'),
      handler: 'handler',
      functionName: 'bedrock-agent-action-group-gateway-caller',
      description: 'Bedrock Agent Action Group that calls AgentCore Gateway MCP endpoint',
      timeout: cdk.Duration.seconds(30),
      environment: {
        GATEWAY_ENDPOINT: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
        TARGET_NAME: currentTimeTargetName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node24',
      },
    });

    // Grant Gateway Caller Lambda permission to invoke Gateway
    gateway.grantInvoke(gatewayCallerFunction);

    // AWS MCP Caller Lambda (bridges Bedrock Agent to Gateway for AWS MCP tools)
    const awsMcpCallerFunction = new lambda_nodejs.NodejsFunction(this, 'AwsMcpCallerFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/action-group/aws-mcp-caller/index.ts'),
      handler: 'handler',
      functionName: 'bedrock-agent-aws-mcp-caller',
      description: 'Bedrock Agent Action Group that calls AWS MCP tools via AgentCore Gateway',
      timeout: cdk.Duration.seconds(120),
      environment: {
        GATEWAY_ENDPOINT: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
        TARGET_NAME: awsMcpTargetName,
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node24',
      },
    });

    // Grant AWS MCP Caller Lambda permission to invoke Gateway
    gateway.grantInvoke(awsMcpCallerFunction);

    // ========================================
    // Action Groups (using L2 constructs)
    // ========================================

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
            description:
              'Search across all AWS documentation, API references, best practices, and service guides.',
            parameters: {
              query: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'Search query string',
              },
            },
          },
          {
            name: 'read_documentation',
            description: 'Retrieve and convert AWS documentation pages to markdown format.',
            parameters: {
              url: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'URL of the AWS documentation page',
              },
            },
          },
          {
            name: 'list_regions',
            description: 'Retrieve a list of all AWS regions with their identifiers and names.',
            parameters: {},
          },
          {
            name: 'get_regional_availability',
            description:
              'Check AWS regional availability for services, features, and CloudFormation resources.',
            parameters: {
              service: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'AWS service name (e.g., "bedrock", "lambda")',
              },
            },
          },
          {
            name: 'suggest_aws_commands',
            description: 'Get descriptions and syntax help for relevant AWS APIs.',
            parameters: {
              query: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'Description of what you want to do',
              },
            },
          },
          {
            name: 'call_aws',
            description:
              'Execute read-only AWS API calls (Describe*, List*, Get* operations only).',
            parameters: {
              service: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'AWS service name (e.g., "ec2", "s3", "lambda")',
              },
              operation: {
                type: bedrock.ParameterType.STRING,
                required: true,
                description: 'API operation name (e.g., "DescribeInstances", "ListBuckets")',
              },
              parameters: {
                type: bedrock.ParameterType.STRING,
                required: false,
                description: 'Operation parameters as JSON string (e.g., {"InstanceIds": ["i-123"]})',
              },
              region: {
                type: bedrock.ParameterType.STRING,
                required: false,
                description: 'AWS region (optional, defaults to ap-northeast-1)',
              },
            },
          },
        ],
      }),
      enabled: true,
    });

    // ========================================
    // Bedrock Agent
    // ========================================

    const agent = new bedrock.Agent(this, 'SimpleBedrockAgent', {
      agentName: 'simple-bedrock-agent',
      foundationModel: inferenceProfile,
      instruction: `あなたは親切で丁寧なアシスタントです。ユーザーの質問に対して、簡潔かつ正確に日本語で回答してください。

以下のツールを使用してAWS関連の情報を提供することができます：

1. **AWSドキュメント検索** (search_documentation): AWSのドキュメント、APIリファレンス、ベストプラクティスを検索します。
2. **ドキュメント読み取り** (read_documentation): 指定されたURLのAWSドキュメントページを取得します。
3. **リージョン一覧** (list_regions): 利用可能なAWSリージョンの一覧を取得します。
4. **サービス利用可能リージョン** (get_regional_availability): 指定したAWSサービスのリージョン対応状況を確認します。
5. **AWSコマンド提案** (suggest_aws_commands): AWS APIの構文と説明を取得します。
6. **AWS API呼び出し** (call_aws): 読み取り専用のAWS APIを呼び出します（Describe*、List*、Get*操作のみ）。
7. **現在時刻取得** (getCurrentTime): 日本標準時(JST)での現在時刻を取得します。

これらのツールを適切に使用して、ユーザーの質問に答えてください。情報が不足している場合は、検索ツールを使用して最新の情報を取得してください。`,
      description: 'シンプルなBedrock Agent検証用',
      idleSessionTTL: cdk.Duration.minutes(10),
      shouldPrepareAgent: true,
      actionGroups: [currentTimeActionGroup, awsMcpActionGroup],
    });

    // Agent Alias (本番呼び出し用)
    const agentAlias = new bedrock.AgentAlias(this, 'SimpleAgentAlias', {
      agent: agent,
      agentAliasName: 'live',
      description: '本番用エイリアス',
    });

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'AgentId', {
      value: agent.agentId,
      description: 'Bedrock Agent ID',
    });
    new cdk.CfnOutput(this, 'AgentAliasId', {
      value: agentAlias.aliasId,
      description: 'Bedrock Agent Alias ID',
    });
    new cdk.CfnOutput(this, 'GatewayEndpoint', {
      value: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
      description: 'AgentCore Gateway MCP Endpoint',
    });
    new cdk.CfnOutput(this, 'GatewayCallerFunctionArn', {
      value: gatewayCallerFunction.functionArn,
      description: 'Gateway Caller Lambda ARN (for CurrentTimeTools Action Group)',
    });
    new cdk.CfnOutput(this, 'AwsMcpCallerFunctionArn', {
      value: awsMcpCallerFunction.functionArn,
      description: 'AWS MCP Caller Lambda ARN (for AwsMcpTools Action Group)',
    });
  }
}
