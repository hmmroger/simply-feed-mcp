import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_FEEDS_TOP, getErrorToolResult, textToolResult, toFeedItemSummaryResult, toFeedSummaryResult } from "./tool-utils.js";

export const registerListFeedsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "list-feeds",
    "Retrieve a list of all configured RSS/news feeds with optional filtering and pagination support.",
    {
      feedNameFilter: z.string().optional().describe("Optional filter string to search for feeds by name."),
      top: z.number().max(30).optional().describe(`Number of feeds to return per page (default: ${DEFAULT_FEEDS_TOP}).`),
      skip: z.number().optional().describe("Number of feeds to skip for pagination (default: 0)."),
    },
    async ({ feedNameFilter, top, skip }) => {
      try {
        const feeds = feedNameFilter
          ? await feedManager.queryFeeds(feedNameFilter, top || DEFAULT_FEEDS_TOP, skip)
          : await feedManager.getFeeds(top || DEFAULT_FEEDS_TOP, skip);
        return textToolResult([`Found feeds: ${JSON.stringify(feeds.map((feed) => toFeedSummaryResult(feed)))}`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list feeds.");
      }
    }
  );
};
