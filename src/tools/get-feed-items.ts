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

export const GET_FEED_ITEMS_TOOL_NAME = "get_feed_items";

export const getFeedItemsToolConfig = (feedManager: SimplyFeedManager) => {
  const inputSchema = {
    feedId: z.string().describe("The news/RSS feed ID from which to get items."),
    timeZone: timeZoneSchema,
    limit: z
      .number()
      .max(MAX_ITEMS_LIMIT)
      .optional()
      .describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
    skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
  };

  const handler: ToolCallback<typeof inputSchema> = async ({ feedId, limit, skip, timeZone }) => {
    try {
      const feed = await feedManager.getFeed(feedId);
      if (!feed) {
        throw new Error("Ensure correct feedID is used.");
      }

      const items = await feedManager.getItemsFromFeed(feedId, limit || DEFAULT_ITEMS_LIMIT, skip);
      const formattedItems = items.map((item) => formatFeedItem(item, false, feed.title, timeZone));
      return textToolResult([
        `${items.length} items from feed [${feed.title}]${formatSkipNotice(skip)}:`,
        "",
        ...formattedItems.flatMap((item) => [item, "---"]),
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list feed items.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_FEED_ITEMS_TOOL_NAME,
    description: `Get items from a specific feed by feed ID, ordered newest first (default: ${DEFAULT_ITEMS_LIMIT} items). Use list-feeds to discover available feed IDs.`,
    inputSchema,
    handler,
  };

  return config;
};
