import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_TOP, getErrorToolResult, MAX_ITEMS_TOP, textToolResult, toFeedItemResult } from "./tool-utils.js";

const DEFAULT_RECENCY_IN_MINUTES = 2 * 60;

export const registerGetRecentFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "get-recent-feed-items",
    "Retrieve the most recent items from all configured news/RSS feeds.",
    {
      recencyInMinutes: z
        .number()
        .default(120)
        .optional()
        .describe(`Number of minutes to look back from now for recent items (default: ${DEFAULT_RECENCY_IN_MINUTES}).`),
      top: z.number().max(MAX_ITEMS_TOP).optional().describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_TOP}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ recencyInMinutes, skip, top }) => {
      try {
        const feeds = await feedManager.getFeeds();
        const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));
        recencyInMinutes = recencyInMinutes || DEFAULT_RECENCY_IN_MINUTES;
        const items = await feedManager.getRecentItems(recencyInMinutes, top || DEFAULT_ITEMS_TOP, skip);
        return textToolResult([
          `Recent news from all feeds in the last ${recencyInMinutes} minutes: ${JSON.stringify(
            items.map((item) => toFeedItemResult(item, false, feedsMap.get(item.feedId)))
          )}`,
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to query recent items.");
      }
    }
  );
};
