import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import {
  applyPagination,
  DEFAULT_FEEDS_LIMIT,
  formatFeed,
  formatPaginationHeader,
  getErrorToolResult,
  MAX_ITEMS_LIMIT,
  textToolResult,
  timeZoneSchema,
} from "./tool-utils.js";
import { McpToolConfig } from "../simply-feed-mcp.types.js";

export const LIST_FEEDS_TOOL_NAME = "list_feeds";

export const listFeedsToolConfig = (feedManager: SimplyFeedManager) => {
  const inputSchema = {
    timeZone: timeZoneSchema,
    limit: z
      .number()
      .max(MAX_ITEMS_LIMIT)
      .optional()
      .describe(`Number of feeds to return per page (default: ${DEFAULT_FEEDS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
    skip: z.number().optional().describe("Number of feeds to skip for pagination (default: 0)."),
  };

  const handler: ToolCallback<typeof inputSchema> = async ({ limit, skip, timeZone }) => {
    try {
      const allFeeds = await feedManager.getFeeds();
      const pagination = applyPagination(allFeeds, limit || DEFAULT_FEEDS_LIMIT, skip);
      const formattedFeeds = pagination.items.map((feed) => formatFeed(feed, timeZone));
      const header = formatPaginationHeader("Available feeds", pagination);
      return textToolResult([...header, "", ...formattedFeeds]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list feeds.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_FEEDS_TOOL_NAME,
    description: `List all available RSS/news feeds with their names, IDs, and latest publish times (default: ${DEFAULT_FEEDS_LIMIT} feeds). Call this first to discover feed IDs needed by other tools.`,
    inputSchema,
    handler,
  };

  return config;
};
