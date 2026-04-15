import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import {
  applyPagination,
  DEFAULT_ITEMS_LIMIT,
  formatFeedItem,
  formatPaginationHeader,
  getErrorToolResult,
  MAX_ITEMS_LIMIT,
  textToolResult,
  timeZoneSchema,
} from "./tool-utils.js";
import { McpToolConfig } from "../simply-feed-mcp.types.js";

const DEFAULT_RECENCY_IN_MINUTES = 2 * 60;

export const GET_RECENT_FEED_ITEMS_TOOL_NAME = "get_recent_feed_items";

export const getRecentFeedItemsToolConfig = (feedManager: SimplyFeedManager) => {
  const inputSchema = {
    recencyInMinutes: z
      .number()
      .default(DEFAULT_RECENCY_IN_MINUTES)
      .optional()
      .describe(`Number of minutes to look back from now for recent items (default: ${DEFAULT_RECENCY_IN_MINUTES}).`),
    timeZone: timeZoneSchema,
    limit: z
      .number()
      .max(MAX_ITEMS_LIMIT)
      .optional()
      .describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
    skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
  };

  const handler: ToolCallback<typeof inputSchema> = async ({ recencyInMinutes, skip, limit, timeZone }) => {
    try {
      recencyInMinutes = recencyInMinutes || DEFAULT_RECENCY_IN_MINUTES;
      const feeds = await feedManager.getFeeds();
      const feedsMap = new Map<string, string>(feeds.map((feed) => [feed.id, feed.title]));
      const allItems = await feedManager.getRecentItems(recencyInMinutes);
      if (!allItems.length) {
        return textToolResult([`No items found in the last ${recencyInMinutes} minutes. Try increase the minutes.`]);
      }
      const pagination = applyPagination(allItems, limit || DEFAULT_ITEMS_LIMIT, skip);
      const formattedItems = pagination.items.map((item) => formatFeedItem(item, false, feedsMap.get(item.feedId), timeZone));
      const header = formatPaginationHeader(`Recent items from all feeds (last ${recencyInMinutes} minutes)`, pagination);
      return textToolResult([...header, "", ...formattedItems.flatMap((item) => [item, "---"])]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to query recent items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_RECENT_FEED_ITEMS_TOOL_NAME,
    description: `Get recent items across all feeds within a time window (default: last ${DEFAULT_RECENCY_IN_MINUTES} minutes, ${DEFAULT_ITEMS_LIMIT} items). Use this to catch up on the latest news without specifying a feed.`,
    inputSchema,
    handler,
  };

  return config;
};
