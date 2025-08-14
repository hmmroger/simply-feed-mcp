import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_TOP, getErrorToolResult, MAX_ITEMS_TOP, textToolResult, toFeedItemResult } from "./tool-utils.js";

export const registerListFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "list-feed-items",
    "Retrieve and list items from a specified news/RSS feed with pagination support.",
    {
      feedId: z.string().describe("The news/RSS feed ID from which to list items."),
      top: z.number().max(MAX_ITEMS_TOP).optional().describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_TOP}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ feedId, top, skip }) => {
      try {
        const feed = await feedManager.getFeed(feedId);
        if (!feed) {
          throw new Error("Ensure correct feedID is used.");
        }

        const items = await feedManager.getItemsFromFeed(feedId, top || DEFAULT_ITEMS_TOP, skip);
        return textToolResult([
          `Items from feed [${feed.title}]: ${JSON.stringify(items.map((item) => toFeedItemResult(item, false, feed.title)))}`,
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list feed items.");
      }
    }
  );
};
