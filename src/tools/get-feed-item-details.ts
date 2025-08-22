import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { getErrorToolResult, textToolResult, toFeedItemResult } from "./tool-utils.js";

export const registerGetFeedItemDetailsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "get-feed-item-details",
    "Get full item details given the feed ID and feed item ID.",
    {
      feedId: z.string().describe("The feed ID of the item."),
      id: z.string().describe("The feed item ID to get details."),
    },
    async ({ feedId, id }) => {
      try {
        const feed = await feedManager.getFeed(feedId);
        if (!feed) {
          throw new Error("Ensure correct feedID is used.");
        }

        const item = await feedManager.getItem(feedId, id);
        return textToolResult([`Item details: ${JSON.stringify(toFeedItemResult(item, true, feed.title))}`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to get item details.");
      }
    }
  );
};
