/**
 * AWS MCP Proxy Lambda for AgentCore Gateway Lambda Target.
 *
 * Proxies MCP tool calls to AWS MCP Server (https://aws-mcp.us-east-1.api.aws/mcp)
 * with SigV4 authentication.
 */

import { AwsClient } from 'aws4fetch';

const AWS_MCP_ENDPOINT = 'https://aws-mcp.us-east-1.api.aws/mcp';

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
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
  result?: {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

function getToolName(context: any): string {
  const custom = context?.clientContext?.custom ?? context?.client_context?.custom ?? {};
  const fullName: string = custom.bedrockAgentCoreToolName ?? '';
  const parts = fullName.split('___');
  return parts.length > 1 ? parts.slice(1).join('___') : fullName;
}

export const handler = async (event: any, context: any): Promise<ToolResult> => {
  console.log('AWS MCP Proxy received event:', JSON.stringify(event, null, 2));

  const toolName = getToolName(context);
  console.log(`Tool name: ${toolName}`);

  if (!toolName) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Tool name not provided in context' }],
    };
  }

  try {
    const aws = new AwsClient({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: 'aws-mcp',
      region: 'us-east-1',
    });

    const awsMcpToolName = toolName.startsWith('aws___') ? toolName : `aws___${toolName}`;

    const mcpRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: awsMcpToolName,
        arguments: event || {},
      },
    };

    console.log('Sending MCP request:', JSON.stringify(mcpRequest, null, 2));

    const response = await aws.fetch(AWS_MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mcpRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AWS MCP Server error:', errorText);
      return {
        isError: true,
        content: [
          { type: 'text', text: `AWS MCP Server error: ${response.status} - ${errorText}` },
        ],
      };
    }

    const mcpResponse = (await response.json()) as MCPResponse;
    console.log('AWS MCP Server response:', JSON.stringify(mcpResponse, null, 2));

    if (mcpResponse.error) {
      return {
        isError: true,
        content: [{ type: 'text', text: `MCP Error: ${mcpResponse.error.message}` }],
      };
    }

    if (mcpResponse.result?.content) {
      return {
        isError: mcpResponse.result.isError,
        content: mcpResponse.result.content.map((c) => ({
          type: 'text',
          text: typeof c.text === 'string' ? c.text : JSON.stringify(c.text),
        })),
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(mcpResponse.result) }],
    };
  } catch (error) {
    console.error('Error calling AWS MCP Server:', error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
};
