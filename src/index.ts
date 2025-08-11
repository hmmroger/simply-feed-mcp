#!/usr/bin/env node

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { startSimplyFeedWorker } from "./worker/simply-feed-worker.js";
import { ConsoleLogger } from "./common/console-logger.js";
import { SimplyFeedManager } from "./simply-feed/simply-feed-manager.js";
import { StaticFeedConfigProvider } from "./worker/static-feed-config-provider.js";
import { BlobFeedConfigProvider } from "./worker/blob-feed-config-provider.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FeedConfigProvider } from "./worker/feed-config-provider.types.js";
import { createMcpServer } from "./simply-feed-mcp.js";
import { SimplyFeedMcpEnvs } from "./simply-feed-mcp.types.js";

const DEFAULT_FEEDS_CONFIG_FILE_NAME = "feeds.json";
const DEFAULT_REFRESH_MINUTES = 15;

config({ quiet: true });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .option("worker", {
      type: "boolean",
      description: "Start Simply Feed MCP worker only.",
    })
    .option("run_once", {
      type: "boolean",
      description: "Run the worker processing once and exit.",
      implies: ["worker"],
    })
    .option("refresh_interval", {
      type: "number",
      description: "Refresh interval for worker in seconds.",
      implies: ["worker"],
    })
    .option("config_file", {
      type: "string",
      description: "Load feeds config from file path.",
      conflicts: "config_blob_name",
    })
    .option("config_blob_name", {
      type: "string",
      description: "Load feeds config from a blob (format: 'container/blob' or 'container/path/to/blob').",
      conflicts: "config_file",
    })
    .parseSync();

  const dataFolder = process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_STORAGE_FILE_FOLDER] || join(__dirname, "..");
  if (argv.worker) {
    let feedConfigProvider: FeedConfigProvider;
    const configBlobName = argv.config_blob_name || process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_CONFIG_BLOB_NAME];
    if (configBlobName) {
      // Parse blob name to extract container and blob
      const blobParts = configBlobName.split("/");
      if (blobParts.length < 2) {
        throw new Error("config_blob_name must be in format 'container/blob' or 'container/path/to/blob'");
      }

      const containerName = blobParts[0];
      const blobName = blobParts.slice(1).join("/");

      feedConfigProvider = new BlobFeedConfigProvider(containerName, blobName);
    } else {
      const configFile = argv.config_file
        ? argv.config_file
        : join(__dirname, "..", process.env[SimplyFeedMcpEnvs.SIMPLY_FEED_CONFIG_FILE_NAME] || DEFAULT_FEEDS_CONFIG_FILE_NAME);
      feedConfigProvider = new StaticFeedConfigProvider(configFile);
    }

    const feedManager = new SimplyFeedManager(new ConsoleLogger("SimplyFeedManager"), dataFolder);
    const refreshInterval = argv.refresh_interval && argv.refresh_interval > 10 ? argv.refresh_interval : DEFAULT_REFRESH_MINUTES * 60;
    return await startSimplyFeedWorker(feedConfigProvider, feedManager, refreshInterval, argv.run_once);
  }

  const feedManager = new SimplyFeedManager(new ConsoleLogger("SimplyFeedManager", true), dataFolder);
  const transport = new StdioServerTransport();
  const server = await createMcpServer(feedManager);
  await server.connect(transport);
  console.error("Simply Feed MCP Server running on stdio.");
};

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
