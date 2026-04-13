import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { formatFeedItem, getErrorToolResult, textToolResult, timeZoneSchema } from "./tool-utils.js";
import { McpToolConfig } from "../simply-feed-mcp.types.js";

export const GET_FEED_ITEM_DETAILS_TOOL_NAME = "get_feed_item_details";

export const getFeedItemDetailsToolConfig = (feedManager: SimplyFeedManager) => {
  const inputSchema = {
    feedId: z.string().describe("The feed ID of the item."),
    id: z.string().describe("The feed item ID to get details."),
    timeZone: timeZoneSchema,
  };

  const handler: ToolCallback<typeof inputSchema> = async ({ feedId, id, timeZone }) => {
    try {
      const feed = await feedManager.getFeed(feedId);
      if (!feed) {
        throw new Error("Ensure correct feedID is used.");
      }

      const item = await feedManager.getItem(feedId, id);
      return textToolResult([formatFeedItem(item, true, feed.title, timeZone)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to get item details.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_FEED_ITEM_DETAILS_TOOL_NAME,
    description: "Get full item details given the feed ID and feed item ID.",
    inputSchema,
    handler,
  };

  return config;
};
