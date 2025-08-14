import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_TOP, getErrorToolResult, MAX_ITEMS_TOP, textToolResult, toFeedItemResult } from "./tool-utils.js";

export const registerQueryFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "query-feed-items",
    "Search and retrieve items from all configured news/RSS feeds using queries.",
    {
      query: z.string().describe("Description of the news/RSS feed items to search for."),
      feedId: z.string().optional().describe("Optional feed ID to filter search results to a specific feed."),
      top: z.number().max(MAX_ITEMS_TOP).optional().describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_TOP}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ query, feedId, top, skip }) => {
      try {
        const feeds = await feedManager.getFeeds();
        const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));
        const items = await feedManager.queryItems(query, feedId, top || DEFAULT_ITEMS_TOP, skip);
        return textToolResult([
          items.length
            ? `Found items: ${JSON.stringify(items.map((item) => toFeedItemResult(item, false, feedsMap.get(item.feedId))))}`
            : `No items found for [${query}].`,
        ]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to query items.");
      }
    }
  );
};
