import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_LIMIT, getErrorToolResult, MAX_ITEMS_LIMIT, textToolResult, toFeedItemResult } from "./tool-utils.js";

export const registerGetFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "get-feed-items",
    "Retrieve items from a specified news/RSS feed, ordered by recency (newest first), with pagination support. ",
    {
      feedId: z.string().describe("The news/RSS feed ID from which to get items."),
      limit: z
        .number()
        .max(MAX_ITEMS_LIMIT)
        .optional()
        .describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ feedId, limit, skip }) => {
      try {
        const feed = await feedManager.getFeed(feedId);
        if (!feed) {
          throw new Error("Ensure correct feedID is used.");
        }

        const items = await feedManager.getItemsFromFeed(feedId, limit || DEFAULT_ITEMS_LIMIT, skip);
        return textToolResult([
          `Items from feed [${feed.title}]: ${JSON.stringify(items.map((item) => toFeedItemResult(item, false, feed.title)))}`,
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list feed items.");
      }
    }
  );
};
