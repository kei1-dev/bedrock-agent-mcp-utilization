import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AwsClient } from 'aws4fetch';

/**
 * Bedrock Agent Action Group Lambda
 *
 * This Lambda function acts as a bridge between Bedrock Agent and AgentCore Gateway MCP endpoint.
 * It receives tool calls from Bedrock Agent and forwards them to the MCP Gateway using SigV4 authentication.
 */

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
  error?: {
    code: number;
    message: string;
  };
}

export const handler = async (
  event: BedrockAgentInput
): Promise<BedrockAgentResponse> => {
  console.log('Received Bedrock Agent event:', JSON.stringify(event, null, 2));

  try {

    // Extract Gateway endpoint from environment variable
    const gatewayEndpoint = process.env.GATEWAY_ENDPOINT;
    if (!gatewayEndpoint) {
      throw new Error('GATEWAY_ENDPOINT environment variable is required');
    }

    // Create AWS4 signed client
    const aws = new AwsClient({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: 'bedrock-agentcore',
      region: process.env.AWS_REGION || 'ap-northeast-1',
    });

    // Build MCP request from Bedrock Agent function call
    // AgentCore Gateway prefixes tool names with target name: {target-name}___{tool-name} (3 underscores)
    const targetName = process.env.TARGET_NAME;
    if (!targetName) {
      throw new Error('TARGET_NAME environment variable is required');
    }
    
    const toolName = event.function;
    const mcpToolName = `${targetName}___${toolName}`;
    const toolArgs = event.parameters && event.parameters.length > 0 ? event.parameters[0].value : undefined;

    console.log(`Calling tool: ${toolName} -> MCP tool: ${mcpToolName}, args: ${toolArgs}`);

    const mcpRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now(), // Generate unique ID
      method: 'tools/call',
      params: {
        name: mcpToolName,  // Use prefixed tool name for Gateway
        arguments: toolArgs ? JSON.parse(toolArgs) : {},
      },
    };

    console.log('Sending MCP request:', JSON.stringify(mcpRequest, null, 2));

    // Call Gateway MCP endpoint
    const response = await aws.fetch(`${gatewayEndpoint}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      throw new Error(`Gateway call failed: ${response.status} ${response.statusText}`);
    }

    const mcpResponse = await response.json() as MCPResponse;
    console.log('Received MCP response:', JSON.stringify(mcpResponse, null, 2));

    // Handle MCP error
    if (mcpResponse.error) {
      throw new Error(`MCP Error: ${mcpResponse.error.message}`);
    }

    // Extract tool result
    const toolResult = mcpResponse.result;

    // Build Bedrock Agent response
    const bedrockResponse: BedrockAgentResponse = {
      messageVersion: '1.0',
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseBody: {
            TEXT: {
              body: JSON.stringify(toolResult),
            },
          },
        },
      },
      sessionAttributes: event.sessionAttributes || {},
      promptSessionAttributes: event.promptSessionAttributes || {},
    };

    return bedrockResponse;

  } catch (error) {
    console.error('Error processing request:', error);

    // Return error response in Bedrock Agent format
    const bedrockResponse: BedrockAgentResponse = {
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

    return bedrockResponse;
  }
};