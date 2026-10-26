import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "./client.js";
import { zodToJsonSchema } from "./schema.js";
import { tools } from "./tools.js";

const toolByName = new Map(tools.map((t) => [t.name, t]));

/** Build the MCP server with all Modrinth tools registered (not yet connected). */
export function createServer() {
  const server = new Server(
    { name: "modrinth-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
      annotations: t.annotations,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      };
    }
    try {
      const args = tool.inputSchema.parse(request.params.arguments || {});
      return await tool.handler(args);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${err.message}` }],
      };
    }
  });

  return server;
}
