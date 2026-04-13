import { SimplyFeedManager } from "./simply-feed/simply-feed-manager.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFeedItemDetailsToolConfig } from "./tools/get-feed-item-details.js";
import { VERSION } from "./version.js";
import { getRecentFeedItemsToolConfig } from "./tools/get-recent-feed-items.js";
import { searchFeedItemsToolConfig } from "./tools/search-feed-items.js";
import { listFeedsToolConfig } from "./tools/list-feeds.js";
import { getFeedItemsToolConfig } from "./tools/get-feed-items.js";
import { McpToolConfig } from "./simply-feed-mcp.types.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat";

export const createSimplyFeedMcpServer = (feedManager: SimplyFeedManager): McpServer => {
  const mcpServer = new McpServer({
    name: "simply-feed-mcp",
    version: VERSION,
  });

  addToolConfig(mcpServer, listFeedsToolConfig(feedManager));
  addToolConfig(mcpServer, getFeedItemsToolConfig(feedManager));
  addToolConfig(mcpServer, getFeedItemDetailsToolConfig(feedManager));
  addToolConfig(mcpServer, getRecentFeedItemsToolConfig(feedManager));
  addToolConfig(mcpServer, searchFeedItemsToolConfig(feedManager));

  return mcpServer;
};

const addToolConfig = <InputArgs extends ZodRawShapeCompat>(mcpServer: McpServer, toolConfig: McpToolConfig<InputArgs>): void => {
  mcpServer.registerTool(
    toolConfig.name,
    {
      description: toolConfig.description,
      inputSchema: toolConfig.inputSchema,
      annotations: toolConfig.annotations,
    },
    toolConfig.handler
  );
};
