import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { DEFAULT_ITEMS_TOP, getErrorToolResult, textToolResult, toFeedItemSummaryResult } from "./tool-utils.js";

export const registerListFeedItemsTool = async (mcpServer: McpServer, feedManager: SimplyFeedManager) => {
  mcpServer.tool(
    "list-feed-items",
    "Retrieve and list items from a specified news/RSS feed with pagination support.",
    {
      feedId: z.string().describe("The news/RSS feed ID from which to list items."),
      top: z.number().max(30).optional().describe(`Number of items to return per page (default: ${DEFAULT_ITEMS_TOP}).`),
      skip: z.number().optional().describe("Number of items to skip for pagination (default: 0)."),
    },
    async ({ feedId, top, skip }) => {
      try {
        const items = await feedManager.getItemsFromFeed(feedId, top || DEFAULT_ITEMS_TOP, skip);
        return textToolResult([`Items from feed [${feedId}]: ${JSON.stringify(items.map((item) => toFeedItemSummaryResult(item)))}`]);
      } catch (error) {
        return getErrorToolResult(error, "Failed to list feed items.");
      }
    }
  );
};
