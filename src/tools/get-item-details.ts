import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { getErrorToolResult, textToolResult } from "./tool-utils.js";

export const registerGetItemDetailsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "get-item-details",
    "Get full item details given the feed ID and feed item ID.",
    {
      feedId: z.string().describe("The feed ID of the item."),
      id: z.string().describe("The feed item ID to get details."),
    },
    async ({ feedId, id }) => {
      try {
        const item = await feedManager.getItem(feedId, id);
        return textToolResult([`Details for item: ${JSON.stringify(item)}`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to get item details.");
      }
    }
  );
};
