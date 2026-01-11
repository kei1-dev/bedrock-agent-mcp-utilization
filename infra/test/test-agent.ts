import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const AGENT_ID = 'YSKLF2T8GL';
const AGENT_ALIAS_ID = 'PTZI9TKPDT';
const REGION = 'ap-northeast-1';

async function testAgent() {
  const client = new BedrockAgentRuntimeClient({ region: REGION });

  const sessionId = `test-session-${Date.now()}`;
  const inputText = '今何時ですか？'; // "What time is it now?" in Japanese

  console.log('=== Invoking Bedrock Agent ===');
  console.log(`Agent ID: ${AGENT_ID}`);
  console.log(`Alias ID: ${AGENT_ALIAS_ID}`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Input: ${inputText}`);
  console.log('');

  try {
    const command = new InvokeAgentCommand({
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId,
      inputText,
      enableTrace: true,
    });

    const response = await client.send(command);

    console.log('=== Agent Response ===');

    if (response.completion) {
      let fullResponse = '';

      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const text = new TextDecoder().decode(event.chunk.bytes);
          fullResponse += text;
          process.stdout.write(text);
        }

        // Log trace events for debugging
        if (event.trace?.trace) {
          console.log('\n--- Trace ---');
          console.log(JSON.stringify(event.trace.trace, null, 2));
        }
      }

      console.log('\n');
      console.log('=== Full Response ===');
      console.log(fullResponse);
    }
  } catch (error) {
    console.error('Error invoking agent:', error);
    throw error;
  }
}

testAgent().catch(console.error);
