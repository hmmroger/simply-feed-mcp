import { z } from "zod";
import { Feed, FeedItem, RefLink } from "../simply-feed/simply-feed.types.js";

// keep this low since a post may have lots of links
const MAX_MENTIONED_LINKS = 2;

export const MAX_ITEMS_LIMIT = 100;
export const DEFAULT_ITEMS_LIMIT = 50;
export const DEFAULT_FEEDS_LIMIT = 50;

export const timeZoneSchema = z
  .string()
  .optional()
  .describe("IANA timezone string for formatting dates (e.g. 'America/New_York', 'Europe/London'). Defaults to UTC.");

export const formatSkipNotice = (skip: number | undefined): string => {
  return skip ? ` (skipped first ${skip})` : "";
};

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

const formatPublishedTime = (publishedTime: number, timeZone?: string): string => {
  const publishedDateTime = new Date(publishedTime);
  return timeZone
    ? new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium", timeStyle: "medium" }).format(publishedDateTime)
    : publishedDateTime.toUTCString();
};

const formatRefLinks = (refLinks: RefLink[]): string => {
  return refLinks.map((link) => (link.title ? `${link.title} (${link.url})` : link.url)).join(", ");
};

/**
 * Formats a FeedItem as a natural language string for tool responses.
 *
 * @param feedItem - The feed item to format
 * @param isDetails - Whether to include full content and detailed fields
 * @param feedName - Optional feed name to include
 * @param timeZone - Optional timezone for formatting the published time (defaults to UTC)
 * @returns Formatted natural language string
 */
export const formatFeedItem = (feedItem: FeedItem, isDetails: boolean, feedName?: string, timeZone?: string): string => {
  const publishedTime = formatPublishedTime(feedItem.publishedTime, timeZone);
  const lines: string[] = [];

  lines.push(`Title: ${feedItem.title}`);
  lines.push(`ID: ${feedItem.id} | Feed ID: ${feedItem.feedId}`);
  if (feedName) {
    lines.push(`Feed: ${feedName}`);
  }
  if (feedItem.author) {
    lines.push(`Author: ${feedItem.author}`);
  }
  lines.push(`Published: ${publishedTime}`);

  if (isDetails) {
    if (feedItem.subtitle) {
      lines.push(`Subtitle: ${feedItem.subtitle}`);
    }
    if (feedItem.categories?.length) {
      lines.push(`Categories: ${feedItem.categories.join(", ")}`);
    }
    if (feedItem.imageUrl) {
      lines.push(`Image: ${feedItem.imageUrl}`);
    }
  }

  lines.push(`Link: ${feedItem.link}`);

  if (feedItem.topics?.length) {
    lines.push(`Topics: ${feedItem.topics.join(", ")}`);
  }

  const summary = feedItem.summary || feedItem.description;
  if (summary) {
    lines.push(`Summary: ${summary}`);
  }

  if (!isDetails) {
    const mentionedLinks = feedItem.refLinks?.slice(0, MAX_MENTIONED_LINKS);
    if (mentionedLinks?.length) {
      lines.push(`Mentioned links: ${formatRefLinks(mentionedLinks)}`);
    }
  }

  if (isDetails && feedItem.content) {
    lines.push("");
    lines.push(`Content:\n${feedItem.content}`);
  }

  return lines.join("\n");
};

/**
 * Formats a Feed as a natural language string for tool responses.
 *
 * @param feed - The feed object to format
 * @returns Formatted natural language string
 */
export const formatFeed = (feed: Feed, timeZone?: string): string => {
  const latestPublished = formatPublishedTime(feed.latestItemPublishedTime, timeZone);
  return `- ${feed.title} (ID: ${feed.id}) - Latest item published: ${latestPublished}`;
};
