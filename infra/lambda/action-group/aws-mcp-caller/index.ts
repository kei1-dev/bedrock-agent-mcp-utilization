/**
 * Bedrock Agent Action Group Lambda for AWS MCP Tools.
 *
 * This Lambda receives tool calls from Bedrock Agent and forwards them
 * to AgentCore Gateway's AWS MCP Proxy target using SigV4 authentication.
 */

import { AwsClient } from 'aws4fetch';

interface BedrockAgentInput {
  messageVersion: string;
  agent: { name: string; id: string; alias: string; version: string };
  inputText: string;
  sessionId: string;
  actionGroup: string;
  function: string;
  parameters: Array<{ name: string; type: string; value: string }>;
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

interface BedrockAgentResponse {
  messageVersion: string;
  response: {
    actionGroup: string;
    function: string;
    functionResponse: {
      responseBody: { TEXT: { body: string } };
    };
  };
  sessionAttributes: Record<string, string>;
  promptSessionAttributes: Record<string, string>;
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string };
}

export const handler = async (event: BedrockAgentInput): Promise<BedrockAgentResponse> => {
  console.log('Received Bedrock Agent event:', JSON.stringify(event, null, 2));

  try {
    const gatewayEndpoint = process.env.GATEWAY_ENDPOINT;
    const targetName = process.env.TARGET_NAME;

    if (!gatewayEndpoint || !targetName) {
      throw new Error('GATEWAY_ENDPOINT and TARGET_NAME environment variables are required');
    }

    const aws = new AwsClient({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: 'bedrock-agentcore',
      region: process.env.AWS_REGION || 'ap-northeast-1',
    });

    const toolArgs: Record<string, any> = {};
    for (const param of event.parameters || []) {
      // Skip null/undefined/empty values
      if (param.value === null || param.value === undefined || param.value === 'null') {
        continue;
      }
      try {
        const parsed = JSON.parse(param.value);
        // Only include non-null parsed values
        if (parsed !== null) {
          toolArgs[param.name] = parsed;
        }
      } catch {
        // Keep as string if not valid JSON
        if (param.value !== '') {
          toolArgs[param.name] = param.value;
        }
      }
    }

    const mcpToolName = `${targetName}___${event.function}`;
    console.log(`Calling MCP tool: ${mcpToolName}, args:`, toolArgs);

    const mcpRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: mcpToolName,
        arguments: toolArgs,
      },
    };

    const response = await aws.fetch(`${gatewayEndpoint}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      throw new Error(`Gateway call failed: ${response.status} ${response.statusText}`);
    }

    const mcpResponse = (await response.json()) as MCPResponse;
    console.log('MCP response:', JSON.stringify(mcpResponse, null, 2));

    if (mcpResponse.error) {
      throw new Error(`MCP Error: ${mcpResponse.error.message}`);
    }

    let resultText: string;
    if (mcpResponse.result?.content) {
      resultText = mcpResponse.result.content
        .map((c: any) => c.text || JSON.stringify(c))
        .join('\n');
    } else {
      resultText = JSON.stringify(mcpResponse.result);
    }

    return {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseBody: { TEXT: { body: resultText } },
        },
      },
      sessionAttributes: event.sessionAttributes || {},
      promptSessionAttributes: event.promptSessionAttributes || {},
    };
  } catch (error) {
    console.error('Error processing request:', error);

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
};
