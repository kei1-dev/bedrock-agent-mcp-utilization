import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as bedrock from '@aws-cdk/aws-bedrock-alpha';

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

    // Outputs
    new cdk.CfnOutput(this, 'AgentId', {
      value: agent.agentId,
      description: 'Bedrock Agent ID',
    });
    new cdk.CfnOutput(this, 'AgentAliasId', {
      value: agentAlias.aliasId,
      description: 'Bedrock Agent Alias ID',
    });
  }
}
