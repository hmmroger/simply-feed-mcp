import { BlobServiceClient } from "@azure/storage-blob";
import { FeedConfig, FeedConfigProvider } from "./feed-config-provider.types.js";
import { SimplyFeedMcpEnvs } from "../simply-feed-mcp.types.js";

export class BlobFeedConfigProvider implements FeedConfigProvider {
  private cachedConfigs?: FeedConfig[];
  private blobServiceClient: BlobServiceClient;

  constructor(private readonly containerName: string, private readonly blobName: string, connectionString?: string) {
    // Use the same connection string pattern as other Azure services in the project
    const storageConnectionString = connectionString || process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_STORAGE_CONNECTION_STRING];

    if (!storageConnectionString) {
      throw new Error(
        "Missing Azure Storage connection string. Set SIMPLY_FEED_STORAGE_CONNECTION_STRING environment variable or provide connectionString parameter."
      );
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
  }

  public async getConfigs(): Promise<FeedConfig[]> {
    // Return cached configs if available to avoid downloading blob repeatedly
    if (this.cachedConfigs) {
      return this.cachedConfigs;
    }

    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(this.blobName);

      // Check if blob exists
      const exists = await blockBlobClient.exists();
      if (!exists) {
        throw new Error(`Configuration blob not found: ${this.blobName} in container ${this.containerName}`);
      }

      // Download blob content
      const downloadResponse = await blockBlobClient.download(0);
      if (!downloadResponse.readableStreamBody) {
        throw new Error("Failed to download blob content");
      }

      // Convert stream to string
      const blobContent = await this.streamToString(downloadResponse.readableStreamBody);
      const configData = JSON.parse(blobContent);

      // Validate that the config data is an array of feed configs
      if (!Array.isArray(configData)) {
        throw new Error("Configuration blob must contain an array of feed configurations");
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
      if (error instanceof Error) {
        throw new Error(`Failed to load feed configuration from blob ${this.blobName}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clears the cached configurations, forcing a reload on the next getConfigs() call
   */
  public clearCache(): void {
    this.cachedConfigs = undefined;
  }

  /**
   * Helper method to convert a readable stream to string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on("data", (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });
      readableStream.on("error", reject);
    });
  }
}
