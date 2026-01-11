/**
 * MCP Tool Lambda for AgentCore Gateway Lambda Target.
 *
 * Gateway passes only tool arguments as the event.
 * Tool name is delivered via context.clientContext.custom.bedrockAgentCoreToolName.
 */

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
}

function getCurrentTime(): ToolResult {
  const now = new Date();
  const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    content: [
      {
        type: 'text',
        text: `${jstTime.toISOString().replace('T', ' ').substring(0, 19)} JST`,
      },
    ],
  };
}

function getToolName(context: any): string {
  const custom = context?.clientContext?.custom ?? context?.client_context?.custom ?? {};
  const fullName: string = custom.bedrockAgentCoreToolName ?? '';
  const parts = fullName.split('___');
  return parts.length > 1 ? parts.slice(1).join('___') : fullName;
}

export const handler = async (_event: any, context: any): Promise<ToolResult> => {
  const toolName = getToolName(context);

  if (toolName !== 'getCurrentTime') {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
    };
  }

  return getCurrentTime();
};
