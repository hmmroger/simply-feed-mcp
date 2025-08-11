import { join } from "path";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { Feed, FeedItem } from "./simply-feed.types.js";
import { AzureTableReadWriter } from "./azure-table-read-writer.js";
import { ILogger } from "../common/logger.types.js";
import { fetchItemsAndUpdateFeed } from "./feed-reader.js";
import { isString } from "es-toolkit";
import { isArray } from "es-toolkit/compat";
import {
  QUERY_USER_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT_NO_TOPICS,
  SUMMARY_SYSTEM_PROMPT_WITH_TOPICS,
  SUMMARY_USER_PROMPT,
} from "./system-prompts.js";
import { SimplyFeedMcpEnvs } from "../simply-feed-mcp.types.js";
import { TableReadWriter } from "./table-read-writer.types.js";
import { FileTableReadWriter } from "./file-table-read-writer.js";

const DEFAULT_LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_LLM_MODEL = "gemini-2.5-flash-lite";

const FEED_TABLE_NAME = "feeds";
const FEED_ITEMS_TABLE_NAME = "feeditems";
const FEED_PARTITION = "default";
const FEEDS_CACHE_MAX_AGE_IN_MINUTES = 5;
const DEFAULT_RETENTION_DAYS = 5;

interface SummaryResult {
  summary: string;
  topics: string[];
}

interface TopicsResult {
  topics: string[];
}

export class SimplyFeedManager {
  private llmApiKey: string;
  private llmApiBaseUrl: string;
  private llmModel: string;
  private feedReadWriter: TableReadWriter;
  private feedItemsReadWriter: TableReadWriter;
  private cachedFeeds: Map<string, Feed>;
  private cachedItems: Map<string, FeedItem[]>;
  private cachedFeedsTimestamp: number;

  constructor(private readonly logger: ILogger, dataFolder?: string) {
    const apiKey = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_LLM_API_KEY];
    if (!apiKey) {
      throw new Error(`Missing ${SimplyFeedMcpEnvs.SIMPLY_FEED_LLM_API_KEY}.`);
    }

    const connectionString = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_STORAGE_CONNECTION_STRING];
    if (connectionString) {
      this.feedReadWriter = new AzureTableReadWriter(logger, connectionString, FEED_TABLE_NAME);
      this.feedItemsReadWriter = new AzureTableReadWriter(logger, connectionString, FEED_ITEMS_TABLE_NAME);
    } else {
      if (!dataFolder) {
        throw new Error(`Missing data folder.`);
      }

      const feedTableFile = join(dataFolder, `${FEED_TABLE_NAME}.table.json`);
      this.feedReadWriter = new FileTableReadWriter(logger, feedTableFile);
      const itemsTableFile = join(dataFolder, `${FEED_ITEMS_TABLE_NAME}.table.json`);
      this.feedItemsReadWriter = new FileTableReadWriter(logger, itemsTableFile);
    }

    this.llmApiKey = apiKey;
    this.llmApiBaseUrl = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_LLM_BASE_URL] || DEFAULT_LLM_BASE_URL;
    this.llmModel = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_LLM_MODEL] || DEFAULT_LLM_MODEL;

    this.cachedFeeds = new Map();
    this.cachedItems = new Map();
    this.cachedFeedsTimestamp = 0;
  }

  public async addFeed(feedUrl: string): Promise<Feed> {
    const feeds = await this.getFeeds();
    const feed = feeds.find((feed) => feed.feedUrl.toLowerCase() === feedUrl.toLowerCase());
    if (feed) {
      return feed;
    }

    const newFeed = await this.createFeed(feedUrl);
    this.cachedFeeds.set(newFeed.id, newFeed);
    await this.refreshFeed(newFeed.id);
    return newFeed;
  }

  public async getFeed(id: string): Promise<Feed | undefined> {
    let feed = this.cachedFeeds.get(id);
    if (!feed) {
      try {
        feed = await this.feedReadWriter.getObject<Feed>(FEED_PARTITION, id);
        feed && this.cachedFeeds.set(feed.id, feed);
      } catch (error) {
        this.logger.error(`Failed to get feed ID [${id}]: ${error}`);
      }
    }

    return feed;
  }

  public async getFeedFromUrl(feedUrl: string): Promise<Feed | undefined> {
    let feed = Array.from(this.cachedFeeds.values()).find((feed) => feed.feedUrl === feedUrl);
    if (!feed) {
      try {
        const feeds = await this.feedReadWriter.queryObjects<Feed>(`extra_feedUrl eq '${feedUrl}'`);
        if (feeds.length) {
          feed = feeds[0];
          this.cachedFeeds.set(feed.id, feed);
        }
      } catch (error) {
        this.logger.error(`Failed to get feed url [${feedUrl}]: ${error}`);
      }
    }

    return feed;
  }

  public async getFeeds(top?: number, skip?: number): Promise<Feed[]> {
    if (this.cachedFeeds.size && Date.now() - this.cachedFeedsTimestamp < FEEDS_CACHE_MAX_AGE_IN_MINUTES * 60 * 1000) {
      return Array.from(this.cachedFeeds.values())
        .slice(skip || 0)
        .slice(0, top || undefined);
    }

    const feeds = await this.feedReadWriter.getAllObjects<Feed>();
    feeds.forEach((feed) => {
      this.cachedFeeds.set(feed.id, feed);
    });

    this.cachedFeedsTimestamp = Date.now();
    return feeds.slice(skip || 0).slice(0, top || undefined);
  }

  public async queryFeeds(query: string, top?: number, skip?: number): Promise<Feed[]> {
    const feeds = await this.getFeeds();
    const queries = query
      .split(" ")
      .map((query) => query.trim())
      .filter((query) => !!query);
    const matchedFeeds = feeds.filter((feed) => queries.some((query) => feed.title.includes(query)));
    return matchedFeeds.slice(skip || 0).slice(0, top || undefined);
  }

  public async getItem(feedId: string, id: string): Promise<FeedItem> {
    const feed = await this.getFeed(feedId);
    if (!feed) {
      throw new Error("Invalid Feed ID.");
    }

    let foundItem: FeedItem | undefined;
    const cachedItems = this.cachedItems.get(feed.id);
    if (cachedItems) {
      foundItem = cachedItems.find((item) => item.id === id);
    }

    if (!foundItem) {
      foundItem = await this.feedItemsReadWriter.getObject<FeedItem>(id, feed.id);
    }

    if (!foundItem) {
      throw new Error(`Item not found.`);
    }

    return foundItem;
  }

  public async getItemsFromFeed(id: string, top?: number, skip?: number, startPublishedTime?: number): Promise<FeedItem[]> {
    const feed = await this.getFeed(id);
    if (!feed) {
      return [];
    }

    let cachedItems = this.cachedItems.get(feed.id);
    if (!cachedItems || cachedItems.length === 0 || cachedItems[0].publishedTime < feed.latestItemPublishedTime) {
      let queryFilter = "";
      let queryFromTime: number | undefined;
      if (cachedItems && cachedItems.length > 0) {
        queryFromTime = cachedItems[0].publishedTime + 1;
        queryFilter = `extra_publishedTime ge ${queryFromTime}L`;
      }

      const items = await this.feedItemsReadWriter.queryObjects<FeedItem>(queryFilter, feed.id);
      items.sort((a, b) => b.publishedTime - a.publishedTime);

      if (cachedItems && cachedItems.length > 0) {
        const mergedItems = [...items, ...cachedItems];
        // Remove duplicates based on guid or link
        const uniqueItems = mergedItems.filter((item, index, arr) => {
          const itemKey = item.guid?.guid || item.link;
          return arr.findIndex((i) => (i.guid?.guid || i.link) === itemKey) === index;
        });
        uniqueItems.sort((a, b) => b.publishedTime - a.publishedTime);
        this.cachedItems.set(feed.id, uniqueItems);
        cachedItems = uniqueItems;
      } else {
        // No cached items, store the queried items
        this.cachedItems.set(feed.id, items);
        cachedItems = items;
      }
    }

    const totalItems = cachedItems.length;
    if (startPublishedTime && cachedItems) {
      cachedItems = cachedItems.filter((item) => item.publishedTime >= startPublishedTime);
      this.logger.debug(
        `apply start published time filter ${new Date(startPublishedTime).toString()}, ${
          cachedItems.length
        } items found out of ${totalItems} for feed ${id} latest was ${new Date(feed.latestItemPublishedTime).toString()}.`
      );
    }

    return cachedItems ? cachedItems.slice(skip || 0).slice(0, top || undefined) : [];
  }

  public async getRecentItems(recencyInMinutes: number, top?: number, skip?: number): Promise<FeedItem[]> {
    const recencyCutOff = Date.now() - recencyInMinutes * 60 * 1000;
    const allRecentItems: FeedItem[] = [];

    const feeds = await this.getFeeds();
    for (const feed of feeds) {
      const items = await this.getItemsFromFeed(feed.id, undefined, undefined, recencyCutOff);
      allRecentItems.push(...items);
    }

    allRecentItems.sort((a, b) => b.publishedTime - a.publishedTime);
    return allRecentItems.slice(skip || 0).slice(0, top || undefined);
  }

  public async queryItems(query: string, feedFilter?: string, top?: number, skip?: number): Promise<FeedItem[]> {
    query = query.trim();
    if (!query) {
      return [];
    }

    const topicsRes = await this.determineTopics(query);
    const topics = new Set<string>(topicsRes ? topicsRes.topics.concat(query.toLowerCase().split(" ")) : query.toLowerCase().split(" "));

    const feeds = feedFilter ? await this.queryFeeds(feedFilter) : await this.getFeeds();
    for (const feed of feeds) {
      await this.getItemsFromFeed(feed.id);
    }

    const queryFeedsId = new Set<string>(feeds.map((feed) => feed.id));
    let matchedItems: FeedItem[] = [];
    for (const [feedId, feedItems] of this.cachedItems.entries()) {
      if (!queryFeedsId.has(feedId)) {
        continue;
      }

      feedItems.forEach((item) => {
        if (item.topics?.some((topic) => topics.has(topic)) || Array.from(topics).some((topic) => item.title.includes(topic))) {
          matchedItems.push(item);
        }
      });
    }

    this.logger.debug(`${matchedItems.length} items found matching topics: ${topicsRes?.topics.join(",")}`);
    matchedItems = matchedItems.slice(skip || 0);
    return matchedItems.slice(0, top || undefined);
  }

  public async refreshFeed(id: string): Promise<FeedItem[]> {
    const feed = await this.getFeed(id);
    if (!feed) {
      this.logger.error(`Failed to find feed ID [${id}].`);
      return [];
    }

    let items: FeedItem[];
    try {
      items = await fetchItemsAndUpdateFeed(feed);
    } catch (error) {
      this.logger.error(`Failed to fetch from url [${feed.feedUrl}]: ${(error as Error).message}`);
      return [];
    }

    const currentFeedItems = await this.getItemsFromFeed(feed.id);
    const existingItemKeys = new Set(currentFeedItems.map((item) => item.guid?.guid || item.link));
    const newItems = items.filter((item) => {
      const itemKey = item.guid?.guid || item.link;
      return !existingItemKeys.has(itemKey);
    });
    const retryItems = currentFeedItems.filter((existingItem) => !existingItem.summary);

    const topics = currentFeedItems.reduce((topics, item) => {
      item.topics?.forEach((topic) => topics.add(topic));
      return topics;
    }, new Set<string>());

    const processingItems = newItems.concat(retryItems);
    if (processingItems.length > 0) {
      for (const processItem of processingItems) {
        const text = processItem.title.concat("\n", processItem.content || processItem.description);
        const res = await this.generateSummary(text, topics);
        if (res) {
          processItem.summary = res.summary;
          processItem.topics = res.topics;
          res.topics.forEach((topic) => topics.add(topic));
        }
      }

      const updatedItems = [...currentFeedItems, ...newItems].sort((a, b) => b.publishedTime - a.publishedTime);
      this.cachedItems.set(feed.id, updatedItems);

      await this.feedItemsReadWriter.writeObjects(processingItems, feed.id, ["title", "publishedTime", "topics"]);
      this.logger.info(`${processingItems.length} new items processed for feed [${feed.title}]`);
    }

    const retentionDays = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_ITEMS_RETENTION_DAYS] || DEFAULT_RETENTION_DAYS;
    if (retentionDays) {
      const expiredTime = Date.now() - Number(retentionDays) * 24 * 60 * 60 * 1000;
      const keysToDelete = currentFeedItems.filter((item) => item.publishedTime <= expiredTime).map((item) => item.id);
      await this.feedItemsReadWriter.deleteObjects(keysToDelete, feed.id);
    }

    // update feed
    await this.feedReadWriter.writeObject(feed, FEED_PARTITION, ["title", "feedUrl"]);

    return newItems;
  }

  private async generateSummary(text: string, topics: Set<string>): Promise<SummaryResult | undefined> {
    const openai = new OpenAI({
      apiKey: this.llmApiKey,
      baseURL: this.llmApiBaseUrl,
    });

    try {
      const systemPrompt =
        topics.size > 0
          ? SUMMARY_SYSTEM_PROMPT_WITH_TOPICS.join("\n").replace("{topics}", Array.from(topics).sort().join(", "))
          : SUMMARY_SYSTEM_PROMPT_NO_TOPICS.join("\n");
      const userPrompt = SUMMARY_USER_PROMPT.join("\n").replace("{text}", text);
      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: "{" },
        ],
      });

      const choice = response.choices?.at(0);
      if (!choice) {
        throw new Error("No response from model.");
      }

      if (!choice.message.content) {
        throw new Error("Empty content");
      }

      const parsed = JSON.parse(`{${choice.message.content}`) as SummaryResult;
      if (!parsed.summary || !isString(parsed.summary) || !parsed.topics || !isArray(parsed.topics)) {
        throw new Error(`Invalid response: ${choice.message.content}.`);
      }

      parsed.topics = parsed.topics.map((topic) => topic.toLowerCase());
      return parsed;
    } catch (error) {
      this.logger.error(`Failed to summarize text. ${(error as Error).message}`);
    }

    return undefined;
  }

  private async determineTopics(text: string): Promise<TopicsResult | undefined> {
    const openai = new OpenAI({
      apiKey: this.llmApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    try {
      const systemPrompt = SUMMARY_SYSTEM_PROMPT.join("\n");
      const userPrompt = QUERY_USER_PROMPT.join("\n").replace("{text}", text);
      const response = await openai.chat.completions.create({
        model: "gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: "{" },
        ],
      });

      const choice = response.choices?.at(0);
      if (!choice) {
        throw new Error("No response from model.");
      }

      if (!choice.message.content) {
        throw new Error("Empty content");
      }

      const parsed = JSON.parse(`{${choice.message.content}`) as TopicsResult;
      if (!parsed.topics || !isArray(parsed.topics)) {
        throw new Error(`Invalid response: ${choice.message.content}.`);
      }

      parsed.topics = parsed.topics.map((topic) => topic.toLowerCase());
      return parsed;
    } catch (error) {
      this.logger.error(`Failed to summarize text. ${(error as Error).message}`);
    }

    return undefined;
  }

  private async createFeed(feedUrl: string): Promise<Feed> {
    return {
      id: uuidv4(),
      title: "Untitled Feed",
      subtitle: "",
      description: "",
      feedUrl: feedUrl,
      latestItemPublishedTime: 0,
      firstItemPublishedTime: 0,
      lastUpdateTime: Date.now(),
    };
  }
}
