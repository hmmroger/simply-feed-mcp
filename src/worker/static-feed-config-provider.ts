import { readFile } from "fs/promises";
import { FeedConfig, FeedConfigProvider } from "./feed-config-provider.types.js";

export class StaticFeedConfigProvider implements FeedConfigProvider {
  private cachedConfigs?: FeedConfig[];

  constructor(private readonly configFilePath: string) {}

  public async getConfigs(): Promise<FeedConfig[]> {
    // Return cached configs if available to avoid reading file repeatedly
    if (this.cachedConfigs) {
      return this.cachedConfigs;
    }

    try {
      const fileContent = await readFile(this.configFilePath, "utf-8");
      const configData = JSON.parse(fileContent);

      // Validate that the config data is an array of feed configs
      if (!Array.isArray(configData)) {
        throw new Error("Configuration file must contain an array of feed configurations");
      }

      // Validate each config has required feedUrl property
      const configs: FeedConfig[] = configData.map((config, index) => {
        if (!config.feedUrl || typeof config.feedUrl !== "string") {
          throw new Error(`Invalid feed configuration at index ${index}: feedUrl is required and must be a string`);
        }
        return { feedUrl: config.feedUrl } as FeedConfig;
      });

      // Cache the configs for future calls
      this.cachedConfigs = configs;
      return configs;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Feed configuration file not found: ${this.configFilePath}`);
      }
      throw error;
    }
  }

  /**
   * Clears the cached configurations, forcing a reload on the next getConfigs() call
   */
  private clearCache(): void {
    this.cachedConfigs = undefined;
  }
}
