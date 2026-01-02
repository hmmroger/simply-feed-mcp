import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_LIMIT, getErrorToolResult, MAX_ITEMS_LIMIT, textToolResult, toFeedItemResult } from "./tool-utils.js";

const DEFAULT_RECENCY_IN_MINUTES = 2 * 60;

export const registerGetRecentFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "get-recent-feed-items",
    "Retrieve the most recent items from all configured news/RSS feeds within a specified time window (recencyInMinutes).",
    {
      recencyInMinutes: z
        .number()
        .default(DEFAULT_RECENCY_IN_MINUTES)
        .optional()
        .describe(`Number of minutes to look back from now for recent items (default: ${DEFAULT_RECENCY_IN_MINUTES}).`),
      limit: z
        .number()
        .max(MAX_ITEMS_LIMIT)
        .optional()
        .describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ recencyInMinutes, skip, limit }) => {
      try {
        recencyInMinutes = recencyInMinutes || DEFAULT_RECENCY_IN_MINUTES;
        const feeds = await feedManager.getFeeds();
        const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));
        const items = await feedManager.getRecentItems(recencyInMinutes, limit || DEFAULT_ITEMS_LIMIT, skip);
        return items.length
          ? textToolResult([
              `There are ${items.length} recent items from all feeds (last ${recencyInMinutes} minutes):`,
              `${JSON.stringify(
                items.map((item) => toFeedItemResult(item, false, feedsMap.get(item.feedId))),
                null,
                2
              )}`,
            ])
          : textToolResult([`No items found in the last ${recencyInMinutes} minutes. Try increase the minutes.`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to query recent items.");
      }
    }
  );
};
