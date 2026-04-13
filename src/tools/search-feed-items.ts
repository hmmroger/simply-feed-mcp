import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import {
  DEFAULT_ITEMS_LIMIT,
  formatFeedItem,
  formatSkipNotice,
  getErrorToolResult,
  MAX_ITEMS_LIMIT,
  textToolResult,
  timeZoneSchema,
} from "./tool-utils.js";
import { McpToolConfig } from "../simply-feed-mcp.types.js";

export const SEARCH_FEED_ITEMS_TOOL_NAME = "search_feed_items";

export const searchFeedItemsToolConfig = (feedManager: SimplyFeedManager) => {
  const inputSchema = {
    query: z.string().describe("Description of the news/RSS feed items to search for."),
    feedId: z.string().optional().describe("Optional feed ID to filter search results to a specific feed."),
    timeZone: timeZoneSchema,
    limit: z
      .number()
      .max(MAX_ITEMS_LIMIT)
      .optional()
      .describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
    skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
  };

  const handler: ToolCallback<typeof inputSchema> = async ({ query, feedId, limit, skip, timeZone }) => {
    try {
      const feeds = await feedManager.getFeeds();
      const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));
      const items = await feedManager.queryItems(query, feedId, limit || DEFAULT_ITEMS_LIMIT, skip);
      if (!items.length) {
        return textToolResult([`No items found matching "${query}".`]);
      }
      const formattedItems = items.map((item) => formatFeedItem(item, false, feedsMap.get(item.feedId), timeZone));
      return textToolResult([
        `Found ${items.length} items matching "${query}"${formatSkipNotice(skip)}:`,
        "",
        ...formattedItems.flatMap((item) => [item, "---"]),
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to query items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: SEARCH_FEED_ITEMS_TOOL_NAME,
    description: `Search feed items by query across all feeds, or filter to a specific feed with feedId (default: ${DEFAULT_ITEMS_LIMIT} items). Use this to find items about a specific topic.`,
    inputSchema,
    handler,
  };

  return config;
};
