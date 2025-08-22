import { SimplyFeedManager } from "./simply-feed/simply-feed-manager.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetFeedItemDetailsTool } from "./tools/get-feed-item-details.js";
import { VERSION } from "./version.js";
import { registerGetRecentFeedItemsTool } from "./tools/get-recent-feed-items.js";
import { registerQueryFeedItemsTool } from "./tools/query-feed-items.js";
import { registerListFeedsTool } from "./tools/list-feeds.js";
import { registerGetFeedItemsTool } from "./tools/get-feed-items.js";

type ToolRegistration = (mcpServer: McpServer, feedManager: SimplyFeedManager) => Promise<void>;

export const createMcpServer = async (feedManager: SimplyFeedManager): Promise<McpServer> => {
  const mcpServer = new McpServer({
    name: "simply-feed-mcp",
    version: VERSION,
  });

  const tools: ToolRegistration[] = [
    registerGetFeedItemsTool,
    registerGetFeedItemDetailsTool,
    registerGetRecentFeedItemsTool,
    registerQueryFeedItemsTool,
    registerListFeedsTool,
  ];

  for (const tool of tools) {
    await tool(mcpServer, feedManager);
  }

  return mcpServer;
};
