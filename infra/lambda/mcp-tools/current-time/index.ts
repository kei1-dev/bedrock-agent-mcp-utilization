/**
 * MCP Tool Lambda for AgentCore Gateway Lambda Target.
 *
 * Gateway passes only tool arguments as the event. For no-arg tools the event is {}.
 * Tool metadata is delivered via context.clientContext.custom (or context.client_context.custom).
 */

declare const awslambda: {
  streamifyResponse: (handler: StreamHandler) => any;
  HttpResponseStream: {
    from: (responseStream: NodeJS.WritableStream, metadata: HttpResponseMetadata) => NodeJS.WritableStream;
  };
};

interface HttpResponseMetadata {
  statusCode: number;
  headers?: Record<string, string>;
}

type StreamHandler = (
  event: any,
  responseStream: NodeJS.WritableStream,
  context: any
) => Promise<void>;

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call' | 'tools/list';
  params?: {
    name?: string;
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

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function stripTargetPrefix(fullToolName: string): string {
  const parts = fullToolName.split('___');
  return parts.length > 1 ? parts.slice(1).join('___') : fullToolName;
}

function buildCurrentTimeToolResult(): ToolResult {
  const now = new Date();
  const jstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));

  return {
    content: [{
      type: 'text',
      text: jstTime.toISOString().replace('T', ' ').substring(0, 19) + ' JST',
    }],
  };
}

function buildToolErrorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function buildCurrentTimeMcpResponse(id: MCPResponse['id']): MCPResponse {
  return {
    jsonrpc: '2.0',
    id,
    result: buildCurrentTimeToolResult(),
  };
}

function getGatewayCustomContext(context: any): Record<string, unknown> {
  // Support both camelCase (clientContext) and snake_case (client_context)
  const customContext = context?.clientContext?.custom;
  const custom_context = context?.client_context?.custom;
  if (customContext && typeof customContext === 'object') {
    return customContext;
  }
  if (custom_context && typeof custom_context === 'object') {
    return custom_context;
  }
  return {};
}

function resolveGatewayToolName(context: any): string {
  const custom = getGatewayCustomContext(context);
  const toolName = custom.bedrockAgentCoreToolName;
  return typeof toolName === 'string' ? stripTargetPrefix(toolName) : '';
}

function hasGatewayContext(context: any): boolean {
  const custom = getGatewayCustomContext(context);
  return typeof custom.bedrockAgentCoreToolName === 'string';
}

function handleGatewayInvocation(context: any): ToolResult {
  const toolName = resolveGatewayToolName(context);

  if (!toolName) {
    return buildToolErrorResult('Missing tool name in gateway context');
  }

  if (toolName !== 'getCurrentTime') {
    return buildToolErrorResult(`Method not found: ${toolName}`);
  }

  return buildCurrentTimeToolResult();
}

function processMCPRequest(body: MCPRequest): MCPResponse {
  if (body.jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      id: body.id || 0,
      error: { code: -32600, message: 'Invalid Request: missing jsonrpc 2.0' },
    };
  }

  if (body.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: body.id,
      result: {
        tools: [{
          name: 'getCurrentTime',
          description: 'Get the current time in Japan Standard Time (JST)',
          inputSchema: { type: 'object', properties: {} },
        }],
      },
    };
  }

  if (body.method === 'tools/call') {
    const rawToolName = body.params?.name || '';
    const toolName = stripTargetPrefix(rawToolName);

    if (toolName !== 'getCurrentTime') {
      return {
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: `Method not found: ${rawToolName}` },
      };
    }

    return buildCurrentTimeMcpResponse(body.id);
  }

  return {
    jsonrpc: '2.0',
    id: body.id,
    error: { code: -32601, message: 'Method not found' },
  };
}

const streamHandler: StreamHandler = async (event, responseStream, context) => {
  console.log('=== Lambda Streaming Handler Invoked ===');
  console.log('Event type:', typeof event);
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context clientContext:', JSON.stringify(context?.clientContext, null, 2));
  console.log('Context client_context:', JSON.stringify(context?.client_context, null, 2));

  try {
    if (hasGatewayContext(context)) {
      console.log('Gateway context detected, handling as gateway invocation');
      const result = handleGatewayInvocation(context);
      console.log('Gateway result:', JSON.stringify(result, null, 2));
      responseStream.write(JSON.stringify(result));
      responseStream.end();
      return;
    }

    let body: MCPRequest;

    if (event?.jsonrpc === '2.0') {
      body = event as MCPRequest;
    } else if (event?.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } else {
      console.log('No gateway context and empty event, returning error');
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32600, message: 'Invalid Request: empty event received' },
      };
      responseStream.write(JSON.stringify(errorResponse));
      responseStream.end();
      return;
    }

    const response = processMCPRequest(body);
    responseStream.write(JSON.stringify(response));
    responseStream.end();
  } catch (error) {
    console.error('Error processing request:', error);
    const errorResponse: MCPResponse = {
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32603, message: `Internal error: ${error instanceof Error ? error.message : 'Unknown'}` },
    };
    responseStream.write(JSON.stringify(errorResponse));
    responseStream.end();
  }
};

export const handler = async (event: MCPRequest | any, context?: any): Promise<MCPResponse | ToolResult> => {
  console.log('=== Standard Lambda Handler Invoked ===');
  console.log('Event type:', typeof event);
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context clientContext:', JSON.stringify(context?.clientContext, null, 2));
  console.log('Context client_context:', JSON.stringify(context?.client_context, null, 2));

  try {
    if (hasGatewayContext(context)) {
      console.log('Gateway context detected, handling as gateway invocation');
      return handleGatewayInvocation(context);
    }

    let body: MCPRequest;

    if (event?.jsonrpc === '2.0') {
      body = event as MCPRequest;
    } else if (event?.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } else {
      return {
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32600, message: 'Invalid Request: empty event received' },
      };
    }

    return processMCPRequest(body);
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32603, message: `Internal error: ${error instanceof Error ? error.message : 'Unknown'}` },
    };
  }
};

export const streamingHandler = typeof awslambda !== 'undefined'
  ? awslambda.streamifyResponse(streamHandler)
  : handler;
