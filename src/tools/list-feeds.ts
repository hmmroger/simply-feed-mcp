import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_FEEDS_LIMIT, getErrorToolResult, MAX_ITEMS_LIMIT, textToolResult, toFeedResult } from "./tool-utils.js";

export const registerListFeedsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "list-feeds",
    "Retrieve a list of all configured RSS/news feeds with pagination support. Use this tool when you need to find a specific feed by name or get all available feeds before working with feed items.",
    {
      limit: z
        .number()
        .max(MAX_ITEMS_LIMIT)
        .optional()
        .describe(`Number of feeds to return per page (default: ${DEFAULT_FEEDS_LIMIT}, max: ${MAX_ITEMS_LIMIT}).`),
      skip: z.number().optional().describe("Number of feeds to skip for pagination (default: 0)."),
    },
    async ({ limit, skip }) => {
      try {
        const feeds = await feedManager.getFeeds(limit || DEFAULT_FEEDS_LIMIT, skip);
        return textToolResult([`Available feeds (${feeds.length}): ${JSON.stringify(feeds.map((feed) => toFeedResult(feed)))}`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list feeds.");
      }
    }
  );
};
