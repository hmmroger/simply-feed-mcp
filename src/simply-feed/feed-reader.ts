import { Feed, FeedItem, FeedItemGuid, FeedItemTypes, RefLink } from "./simply-feed.types.js";
import axios from "axios";
import { isString } from "es-toolkit";
import { XMLParser } from "fast-xml-parser";
import { v4 as uuidv4 } from "uuid";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { fromMarkdown } from "mdast-util-from-markdown";
import { visit } from "unist-util-visit";
import { isArray } from "es-toolkit/compat";

const USER_AGENT_HEADER = "Mozilla/5.0 (compatible; SimplyFeed/0.0.1; RSS Reader)";
const ACCEPT_ENCODING_HEADER = "gzip, deflate";
const ACCEPT_HEADER = "text/html,application/xhtml+xml,application/xml";
const FETCH_FEED_TIMEOUT_MS = 15000;
const ATTR_PREFIX = "@_";
const XMLNS_ATTR = "@_xmlns";

const XmlNamespaces = {
  Atom: "http://www.w3.org/2005/atom",
  Content: "http://purl.org/rss/1.0/modules/content/",
  Itunes: "http://www.itunes.com/dtds/podcast-1.0.dtd",
  GooglePlay: "http://www.google.com/schemas/play-podcasts/1.0",
  DC: "http://purl.org/dc/elements/1.1/",
  Media: "http://search.yahoo.com/mrss/",
} as const;

const XmlTags = {
  title: "title",
  subtitle: "subtitle",
  link: "link",
  description: "description",
  language: "language",
  image: "image",
  url: "url",
  type: "type",
  author: "author",
  owner: "owner",
  pubDate: "pubDate",
  published: "published",
  guid: "guid",
  copyright: "copyright",
  generator: "generator",
  creator: "creator",
  category: "category",
  categories: "categories",
  item: "item",
  entry: "entry",
  enclosure: "enclosure",
  duration: "duration",
  content: "content",
  thumbnail: "thumbnail",
  credit: "credit",
  encoded: "encoded",
};

export async function fetchItemsAndUpdateFeed(feed: Feed): Promise<FeedItem[]> {
  try {
    const response = await axios.get(feed.feedUrl, {
      headers: {
        Accept: ACCEPT_HEADER,
        "Accept-Encoding": ACCEPT_ENCODING_HEADER,
        "User-Agent": USER_AGENT_HEADER,
      },
      timeout: FETCH_FEED_TIMEOUT_MS,
    });

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ATTR_PREFIX,
      allowBooleanAttributes: true,
      parseAttributeValue: true,
      trimValues: true,
    });

    const parsed = parser.parse(response.data);
    const rss = parsed.rss || parsed;
    const nsMap = getNamespacePrefixMap(rss);
    const channel: Record<string, unknown> = rss.channel || rss.feed || rss;
    if (!channel) {
      throw new Error("Invalid RSS/Atom feed format");
    }

    const channelNSMap = getNamespacePrefixMap(channel);
    if (channelNSMap.size) {
      channelNSMap.forEach((value, key) => nsMap.set(key, value));
    }

    const link =
      getElementAttribute(channel, XmlTags.link, `${ATTR_PREFIX}href`, nsMap, XmlNamespaces.Atom) ||
      getElementAttribute(channel, XmlTags.link, `${ATTR_PREFIX}href`) ||
      getStringElement(channel, XmlTags.link);

    const imageUrl =
      getElementAttribute(channel, XmlTags.image, "url") ||
      getElementAttribute(channel, XmlTags.image, `${ATTR_PREFIX}href`) ||
      getElementAttribute(channel, XmlTags.image, `${ATTR_PREFIX}href`, nsMap, XmlNamespaces.Itunes);

    const author =
      getElement<string>(channel, XmlTags.author, nsMap, XmlNamespaces.Itunes) ||
      getElement<string>(channel, XmlTags.creator, nsMap, XmlNamespaces.DC);

    feed.title = getElementAttribute(channel, XmlTags.title, "#text") || getStringElement(channel, XmlTags.title) || "Untitled Feed";
    feed.subtitle = getElementAttribute(channel, XmlTags.subtitle, "#text") || getStringElement(channel, XmlTags.subtitle) || "";
    feed.description = getElementAttribute(channel, XmlTags.description, "#text") || getStringElement(channel, XmlTags.description) || "";
    feed.language = getElement(channel, XmlTags.language);
    feed.link = link;
    feed.imageUrl = imageUrl;
    feed.author = author;
    feed.copyright = getElement(channel, XmlTags.copyright);
    feed.generator = getElement(channel, XmlTags.generator);

    // Extract feed items
    const nhm = new NodeHtmlMarkdown();
    const rawItems = channel[XmlTags.item] || channel[XmlTags.entry];
    const items = rawItems ? extractFeedItems(feed.id, rawItems, nsMap, nhm) : [];

    // Update feed timestamps based on items
    if (items.length > 0) {
      const publishedTimes = items.map((item) => item.publishedTime).filter((time) => time > 0);
      if (publishedTimes.length > 0) {
        feed.latestItemPublishedTime = Math.max(...publishedTimes);
        feed.firstItemPublishedTime = Math.min(...publishedTimes);
      }
    }

    feed.lastUpdateTime = Date.now();

    return items;
  } catch (error) {
    throw new Error(`Failed to fetch feed from ${feed.feedUrl}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

function extractFeedItems(feedId: string, rawItems: unknown, nsMap: Map<string, string>, nhm: NodeHtmlMarkdown): FeedItem[] {
  const items: FeedItem[] = [];
  const itemArray: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : [rawItems];

  itemArray.forEach((item) => {
    if (!item) {
      return;
    }

    const enclosureUrl = getElementAttribute(item, XmlTags.enclosure, `${ATTR_PREFIX}url`);
    const feedItemType = enclosureUrl ? FeedItemTypes.Podcast : FeedItemTypes.Post;
    const guid = parseItemGuid(item);
    const link =
      getElementAttribute(item, XmlTags.link, `${ATTR_PREFIX}href`, nsMap, XmlNamespaces.Atom) ||
      getElementAttribute(item, XmlTags.link, `${ATTR_PREFIX}href`) ||
      getStringElement(item, XmlTags.link) ||
      (guid && guid.isLink ? guid.guid : undefined);
    const author =
      getElement<string>(item, XmlTags.author, nsMap, XmlNamespaces.Itunes) ||
      getElement<string>(item, XmlTags.creator, nsMap, XmlNamespaces.DC) ||
      getElementAttribute<string>(item, XmlTags.author, "name") ||
      getStringElement(item, XmlTags.author);
    const imageUrl =
      getElementAttribute(item, XmlTags.content, `${ATTR_PREFIX}url`, nsMap, XmlNamespaces.Media) ||
      getElementAttribute(item, XmlTags.thumbnail, `${ATTR_PREFIX}url`, nsMap, XmlNamespaces.Media) ||
      getElementAttribute(item, XmlTags.image, `${ATTR_PREFIX}href`, nsMap, XmlNamespaces.Itunes);
    const title = getElementAttribute(item, XmlTags.title, "#text") || getStringElement(item, XmlTags.title) || "Untitled";
    const subtitle = getElementAttribute(item, XmlTags.subtitle, "#text") || getStringElement(item, XmlTags.subtitle) || "";
    const duration = parseDuration(getElement(item, XmlTags.duration));
    const publishedTime = parseDate(getElement<string>(item, XmlTags.pubDate) || getElement<string>(item, XmlTags.published));
    const content = getElementAttribute(item, XmlTags.content, "#text");
    const encoded = getElementWithDefault(item, XmlTags.encoded, "", nsMap, XmlNamespaces.Content) || content || "";
    const description = getElementAttribute(item, XmlTags.description, "#text") || getStringElement(item, XmlTags.description) || "";
    const categories = extractCategories(item);

    const mdContent = encoded ? nhm.translate(encoded) : "";
    const mdDesc = description ? nhm.translate(description) : "";

    // ignore item without link or without content and description for now
    if (!link || (!mdDesc && !mdContent)) {
      return;
    }

    const feedItem: FeedItem = {
      id: uuidv4(),
      feedId: feedId,
      feedItemType,
      title: nhm.translate(title),
      subtitle,
      description: mdDesc,
      author,
      link,
      content: mdContent,
      enclosureUrl,
      duration,
      imageUrl,
      categories,
      guid,
      publishedTime,
      lastUpdateTime: Date.now(),
    };

    const links = getRefLinksFromMarkdown(feedItem.content, link);
    feedItem.refLinks = links;

    items.push(feedItem);
  });

  return items;
}

function parseItemGuid(data: Record<string, unknown>): FeedItemGuid | undefined {
  const guid = getElementAttribute(data, XmlTags.guid, "#text");
  if (!guid) {
    return undefined;
  }

  const isLink = getElementAttribute<boolean>(data, XmlTags.guid, `${ATTR_PREFIX}isPermaLink`) === false ? false : true;
  return {
    guid,
    isLink,
  };
}

function parseDuration(duration: string | number | undefined): number | undefined {
  if (!duration) {
    return undefined;
  }

  if (typeof duration === "number") {
    return duration;
  }

  // Parse duration in format HH:MM:SS or MM:SS or SS
  const parts = duration
    .toString()
    .split(":")
    .map((part) => parseInt(part, 10));

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else if (parts.length === 1) {
    return parts[0]; // SS
  }

  return undefined;
}

function parseDate(dateString: string | undefined): number {
  if (!dateString) return 0;

  const date = new Date(dateString);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * Get namespaces map, key is the normalized XML namespace URI and value is the prefix used in the feed
 * @param data parsed XML feed response
 */
function getNamespacePrefixMap(data: Record<string, unknown>): Map<string, string> {
  const namespaces = new Map<string, string>();

  // Check all keys in the top-level object for namespace declarations
  for (const [key, value] of Object.entries(data)) {
    // Look for xmlns attributes (namespace declarations)
    if (key.startsWith(XMLNS_ATTR)) {
      const namespaceUri = value as string;
      // Use lowercase URI as the normalized key
      const normalizedKey = namespaceUri.toLowerCase();

      if (key === XMLNS_ATTR) {
        // Default namespace
        namespaces.set(normalizedKey, "default");
      } else if (key.startsWith(`${XMLNS_ATTR}:`)) {
        // Named namespace - extract the prefix
        const prefix = key.substring(`${XMLNS_ATTR}:`.length);
        namespaces.set(normalizedKey, prefix);
      }
    }
  }

  return namespaces;
}

function extractCategories(data: Record<string, unknown>): string[] {
  const categories: string[] = [];
  const category = data[XmlTags.category] || data[XmlTags.categories];
  if (category) {
    const regularCategories = Array.isArray(category) ? category : [category];
    regularCategories.forEach((cat) => {
      if (isString(cat)) {
        categories.push(cat);
      }
    });
  }

  return [...new Set(categories)];
}

function getElement<T>(data: Record<string, unknown>, key: string, nsMap?: Map<string, string>, namespace?: string): T | undefined {
  let prefix: string | undefined;
  if (nsMap && namespace) {
    prefix = nsMap.get(namespace);
    if (!prefix) {
      return undefined;
    }
  }

  const dataKey = prefix ? `${prefix}:${key}` : key;
  const value = data[dataKey] as T | undefined;
  return value;
}

function getStringElement(data: Record<string, unknown>, key: string, nsMap?: Map<string, string>, namespace?: string): string | undefined {
  let prefix: string | undefined;
  if (nsMap && namespace) {
    prefix = nsMap.get(namespace);
    if (!prefix) {
      return undefined;
    }
  }

  const dataKey = prefix ? `${prefix}:${key}` : key;
  const value = data[dataKey];
  return isString(value) ? value : undefined;
}

function getElementWithDefault(
  data: Record<string, unknown>,
  key: string,
  defaultValue: string,
  nsMap?: Map<string, string>,
  namespace?: string
): string {
  const value = getElement<string>(data, key, nsMap, namespace);
  return value || defaultValue;
}

function getElementAttribute<T = string>(
  data: Record<string, unknown>,
  key: string,
  attr: string,
  nsMap?: Map<string, string>,
  namespace?: string
): T | undefined {
  let value = getElement<Record<string, unknown>>(data, key, nsMap, namespace);
  if (value) {
    if (isArray(value) && value.length > 0) {
      value = value[0] as Record<string, unknown>;
    }

    return value[attr] as T | undefined;
  }
  return undefined;
}

function getRefLinksFromMarkdown(content: string, itemLink: string): RefLink[] | undefined {
  const links: RefLink[] = [];
  const synTree = fromMarkdown(content);
  visit(synTree, "link", (node) => {
    if (node.url.startsWith(itemLink)) {
      return;
    }

    const linkText = node.children.map((child) => (child.type === "text" ? child.value : "")).join("");
    links.push({
      url: node.url,
      title: node.title ? node.title : linkText || undefined,
    });
  });

  return links.length ? links : undefined;
}
