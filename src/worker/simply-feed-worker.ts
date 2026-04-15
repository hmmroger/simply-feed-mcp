import { ConsoleLogger } from "../common/console-logger.js";
import { SimplyFeedManager } from "../simply-feed/simply-feed-manager.js";
import { FeedConfigProvider } from "./feed-config-provider.types.js";

const DEFAULT_REFRESH_MINUTES = 15;

export interface SimplyFeedWorkerOptions {
  intervalInSeconds?: number;
  runOnce?: boolean;
  includeExistingTopics?: boolean;
}

export const startSimplyFeedWorker = (
  configProvider: FeedConfigProvider,
  feedManager: SimplyFeedManager,
  options?: SimplyFeedWorkerOptions
): Promise<void> => {
  const logger = new ConsoleLogger("SimplyFeedWorker");
  const processor = async () => {
    try {
      const configs = await configProvider.getConfigs();
      for (const config of configs) {
        const feed = await feedManager.getFeedFromUrl(config.feedUrl);
        if (!feed) {
          logger.info(`Adding new feed url: ${config.feedUrl}`);
          await feedManager.addFeed(config.feedUrl);
        } else {
          const items = await feedManager.refreshFeed(feed.id, options?.includeExistingTopics);
          logger.info(`Added ${items.length} new items from feed [${feed.title}].`);
        }
      }
    } catch (error) {
      logger.error(`Something went wrong: ${(error as Error).message}`);
    }
  };

  return new Promise<void>((resolve) => {
    processor();

    if (options?.runOnce) {
      resolve();
      return;
    }

    const intervalId = setInterval(
      () => {
        processor();
      },
      (options?.intervalInSeconds ?? DEFAULT_REFRESH_MINUTES * 60) * 1000
    );

    const cleanup = () => {
      clearInterval(intervalId);
      resolve();
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  });
};
