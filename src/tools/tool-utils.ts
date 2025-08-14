import { Feed, FeedItem } from "../simply-feed/simply-feed.types.js";

// keep this low since a post may have lots of links
const MAX_MENTIONED_LINKS = 2;

export const MAX_ITEMS_TOP = 50;
export const DEFAULT_ITEMS_TOP = 25;
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
 * Converts a FeedItem to a result object for tool responses, with optional detailed information.
 *
 * @param feedItem - The feed item to convert to result format
 * @param isDetails - Whether to include detailed fields (content, subtitle, categories, imageUrl)
 * @param feedName - Optional feed name to include in the result
 * @param timeZone - Optional timezone for formatting the published time (defaults to UTC)
 * @returns Result object with basic fields (id, feedId, feedName, summary, topics, link, author, mentionedLinks, publishedTime)
 *          and additional detailed fields when isDetails is true
 */
export const toFeedItemResult = (feedItem: FeedItem, isDetails: boolean, feedName?: string, timeZone?: string) => {
  const publishedDateTime = new Date(feedItem.publishedTime);
  const publishedTime = timeZone
    ? new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "medium" }).format(publishedDateTime)
    : publishedDateTime.toUTCString();
  const result = {
    id: feedItem.id,
    feedId: feedItem.feedId,
    feedName,
    summary: feedItem.summary || feedItem.description,
    topics: feedItem.topics,
    link: feedItem.link,
    author: feedItem.author,
    mentionedLinks: feedItem.refLinks?.slice(0, MAX_MENTIONED_LINKS),
    publishedTime,
  };

  return isDetails
    ? {
        ...result,
        mentionedLinks: undefined,
        content: feedItem.content,
        subtitle: feedItem.subtitle,
        categories: feedItem.categories,
        imageUrl: feedItem.imageUrl,
      }
    : result;
};

/**
 * Converts a Feed to a simplified result object for tool responses.
 *
 * @param feed - The feed object to convert to result format
 * @returns Result object containing feedId, name, and latestItemPublishedTime as a string
 */
export const toFeedResult = (feed: Feed) => {
  return {
    feedId: feed.id,
    name: feed.title,
    latestItemPublishedTime: new Date(feed.latestItemPublishedTime).toString(),
  };
};
