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

    // シンプルなBedrock Agent
    const agent = new bedrock.Agent(this, 'SimpleBedrockAgent', {
      agentName: 'simple-bedrock-agent',
      foundationModel: inferenceProfile,
      instruction:
        'あなたは親切で丁寧なアシスタントです。ユーザーの質問に対して、簡潔かつ正確に日本語で回答してください。',
      description: 'シンプルなBedrock Agent検証用',
      idleSessionTTL: cdk.Duration.minutes(10),
      shouldPrepareAgent: true,
    });

    // Agent Alias (本番呼び出し用)
    const agentAlias = new bedrock.AgentAlias(this, 'SimpleAgentAlias', {
      agent: agent,
      agentAliasName: 'live',
      description: '本番用エイリアス',
    });

    // MCP Tool Lambda Function (using NodejsFunction for TypeScript bundling)
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

    // AgentCore Gateway
    const gateway = new agentcore.Gateway(this, 'McpGateway', {
      gatewayName: 'bedrock-agent-mcp-gateway',
      authorizerConfiguration: agentcore.GatewayAuthorizer.usingAwsIam(),
    });

    // Add Lambda Target to Gateway
    const targetName = 'current-time-target-v2';
    gateway.addLambdaTarget('CurrentTimeTargetV2', {
      gatewayTargetName: targetName,
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

    // Action Group Lambda Function
    const actionGroupFunction = new lambda_nodejs.NodejsFunction(this, 'ActionGroupFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../lambda/action-group/gateway-caller/index.ts'),
      handler: 'handler',
      functionName: 'bedrock-agent-action-group-gateway-caller',
      description: 'Bedrock Agent Action Group that calls AgentCore Gateway MCP endpoint',
      environment: {
        GATEWAY_ENDPOINT: `https://${gateway.gatewayId}.gateway.bedrock-agentcore.${cdk.Aws.REGION}.amazonaws.com`,
        TARGET_NAME: targetName, // Required for MCP tool name prefixing
      },
      bundling: {
        minify: false,
        sourceMap: true,
        target: 'node24',
      },
    });

    // Grant Action Group Lambda permission to invoke Gateway
    gateway.grantInvoke(actionGroupFunction);

    // Grant Bedrock Agent permission to invoke Action Group Lambda
    actionGroupFunction.addPermission('BedrockAgentInvoke', {
      principal: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:agent/${agent.agentId}`,
    });

    // Note: Action Group will be created manually after deployment due to CDK API limitations

    // Note: Agent instruction is set in constructor, cannot be modified after creation

    // Outputs
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
  }
}
