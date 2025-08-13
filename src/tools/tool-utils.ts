import { Feed, FeedItem } from "../simply-feed/simply-feed.types.js";

// keep this low since a post may have lots of links
const MAX_MENTIONED_LINKS = 2;

export const DEFAULT_ITEMS_TOP = 15;
export const DEFAULT_FEEDS_TOP = 10;

/**
 * Creates a tool result object with text content.
 *
 * @param texts - Array of strings to be joined with newlines
 * @param isError - Optional flag indicating if this is an error result
 * @returns Object with content array containing text and optional isError flag
 */
export const textToolResult = (texts: string[], isError?: boolean) => {
  const text = texts.join("\n");
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    isError,
  };
};

/**
 * Creates an error tool result from an exception or error object.
 *
 * @param error - The error object or unknown error to extract message from
 * @param fallbackMessage - Message to use if no error message can be extracted
 * @returns Error tool result object with isError flag set to true
 */
export const getErrorToolResult = (error: unknown, fallbackMessage: string) => {
  const exceptionError = (error as Error).message;
  const errorMessage = exceptionError ? exceptionError : fallbackMessage;
  return textToolResult([errorMessage], true);
};

/**
 * Converts a FeedItem to a summary result object with essential information.
 *
 * @param feedItem - The feed item to convert to summary format
 * @returns Summary object containing id, feedId, content, topics, link, author, mentionedLinks, and publishedTime
 */
export const toFeedItemSummaryResult = (feedItem: FeedItem) => {
  return {
    id: feedItem.id,
    feedId: feedItem.feedId,
    content: feedItem.summary || feedItem.description || feedItem.title,
    topics: feedItem.topics || feedItem.categories,
    link: feedItem.link,
    author: feedItem.author,
    mentionedLinks: feedItem.refLinks?.slice(0, MAX_MENTIONED_LINKS),
    publishedTimeUtc: new Date(feedItem.publishedTime).toUTCString(),
  };
};

export const toFeedSummaryResult = (feed: Feed) => {
  return {
    feedId: feed.id,
    name: feed.title,
    latestItemPublishedTime: new Date(feed.latestItemPublishedTime).toString(),
  };
};
