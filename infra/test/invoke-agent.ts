#!/usr/bin/env npx ts-node

/**
 * Bedrock Agent 動作確認スクリプト
 *
 * 使用方法:
 *   npx ts-node test/invoke-agent.ts --agent-id <AGENT_ID> --alias-id <ALIAS_ID> --input "メッセージ"
 *
 * オプション:
 *   --agent-id   Bedrock Agent ID (必須)
 *   --alias-id   Agent Alias ID (必須)
 *   --input      送信するメッセージ (必須)
 *   --trace      トレース情報を表示 (オプション)
 *   --region     AWSリージョン (デフォルト: ap-northeast-1)
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';

interface Args {
  agentId: string;
  aliasId: string;
  input: string;
  trace: boolean;
  region: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = {
    agentId: '',
    aliasId: '',
    input: '',
    trace: false,
    region: 'ap-northeast-1',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agent-id':
        result.agentId = args[++i];
        break;
      case '--alias-id':
        result.aliasId = args[++i];
        break;
      case '--input':
        result.input = args[++i];
        break;
      case '--trace':
        result.trace = true;
        break;
      case '--region':
        result.region = args[++i];
        break;
      case '--help':
        printUsage();
        process.exit(0);
    }
  }

  if (!result.agentId || !result.aliasId || !result.input) {
    console.error('エラー: --agent-id, --alias-id, --input は必須です\n');
    printUsage();
    process.exit(1);
  }

  return result;
}

function printUsage(): void {
  console.log(`
使用方法:
  npx ts-node test/invoke-agent.ts --agent-id <AGENT_ID> --alias-id <ALIAS_ID> --input "メッセージ"

オプション:
  --agent-id   Bedrock Agent ID (必須)
  --alias-id   Agent Alias ID (必須)
  --input      送信するメッセージ (必須)
  --trace      トレース情報を表示 (オプション)
  --region     AWSリージョン (デフォルト: ap-northeast-1)
  --help       このヘルプを表示

例:
  npx ts-node test/invoke-agent.ts --agent-id YSKLF2T8GL --alias-id PTZI9TKPDT --input "こんにちは"
`);
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

async function invokeAgent(args: Args): Promise<void> {
  const client = new BedrockAgentRuntimeClient({ region: args.region });
  const sessionId = generateSessionId();

  console.log('========================================');
  console.log('Bedrock Agent 動作確認');
  console.log('========================================');
  console.log(`Agent ID:    ${args.agentId}`);
  console.log(`Alias ID:    ${args.aliasId}`);
  console.log(`Session ID:  ${sessionId}`);
  console.log(`Region:      ${args.region}`);
  console.log(`入力:        ${args.input}`);
  console.log('----------------------------------------');

  try {
    const command = new InvokeAgentCommand({
      agentId: args.agentId,
      agentAliasId: args.aliasId,
      sessionId: sessionId,
      inputText: args.input,
      enableTrace: args.trace,
    });

    const response: InvokeAgentCommandOutput = await client.send(command);

    console.log('\n応答:');
    console.log('----------------------------------------');

    // ストリーミングレスポンスを処理
    if (response.completion) {
      let fullResponse = '';

      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const text = new TextDecoder().decode(event.chunk.bytes);
          fullResponse += text;
          process.stdout.write(text);
        }

        // トレース情報を表示
        if (args.trace && event.trace) {
          console.log('\n\n[トレース情報]');
          console.log(JSON.stringify(event.trace, null, 2));
        }
      }

      console.log('\n----------------------------------------');
      console.log('完了');
    } else {
      console.log('応答がありませんでした');
    }
  } catch (error) {
    console.error('\nエラーが発生しました:');
    if (error instanceof Error) {
      console.error(`  ${error.name}: ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

// メイン実行
const args = parseArgs();
invokeAgent(args);
