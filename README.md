# Simply Feed MCP Server

A Model Context Protocol (MCP) server for managing and querying RSS/news feeds. This server enables AI assistants to fetch, search, and retrieve information from RSS feeds in real-time.

## MCP Tools

This server provides the following MCP tools:

### `get-recent-feed-items`
Retrieve the most recent items from all configured feeds.
- `recencyInMinutes` (optional): Look back period in minutes (default: 120)
- `top` (optional): Number of items to return (max: 30, default: 15)
- `skip` (optional): Number of items to skip for pagination

### `query-feed-items`
Search and retrieve items using natural language queries.
- `query` (required): Description of the items to search for
- `feedId` (optional): Filter results to a specific feed
- `top` (optional): Number of items to return (max: 30, default: 15)
- `skip` (optional): Number of items to skip for pagination

### `get-item-details`
Get full details for a specific feed item.
- `feedId` (required): The feed ID containing the item
- `id` (required): The specific item ID

### `list-feed-items`
List items from all or specific feeds.
- `feedId` (optional): Filter to a specific feed
- `top` (optional): Number of items to return
- `skip` (optional): Number of items to skip for pagination

### `list-feeds`
List all configured RSS feeds.

## Installation

### Prerequisites

- Node.js 20+
- npm or yarn

### From npm

Install the package directly from npm:

```bash
npm install -g simply-feed-mcp
```

### From Source

1. Clone the repository:
```bash
git clone https://github.com/hmmroger/simply-feed-mcp.git
cd simply-feed-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

### Feed Configuration

The feed configuration is used by the worker to fetch and update feeds.
Create a `feeds.json` file in the project root or custom file specified by `--config_file` with your RSS feeds:

```json
[
  {
    "feedUrl": "https://www.technologyreview.com/feed/"
  }
]
```

### Environment Variables

Configure the server using these environment variables:

| Variable | Description | Default | MCP/Worker |
|----------|-------------|---------|------------|
| `SIMPLY_FEED_CONFIG_FILE_NAME` | Custom feeds config file name | `feeds.json` | Worker |
| `SIMPLY_FEED_CONFIG_BLOB_NAME` | Load config from Azure Blob (format: `container/blob`) | - | Worker |
| `SIMPLY_FEED_STORAGE_CONNECTION_STRING` | Azure Storage connection string | - | Both |
| `SIMPLY_FEED_STORAGE_FILE_FOLDER` | Local storage folder for feed data | - | Both |
| `SIMPLY_FEED_LLM_API_KEY` | API key for LLM integration | - | Both |
| `SIMPLY_FEED_LLM_BASE_URL` | Base URL for LLM API | `https://generativelanguage.googleapis.com/v1beta/openai` | Both |
| `SIMPLY_FEED_LLM_MODEL` | LLM model to use | `gemini-2.5-flash-lite` | Both |
| `SIMPLY_FEED_ITEMS_RETENTION_DAYS` | Days to retain feed items | - | Worker |

## Usage

> [!NOTE]
> You must have one instance of simply-feed-mcp running as a `worker` to fetch and update feeds, otherwise the MCP server will not see any feeds.

### Required Environment Variables

`SIMPLY_FEED_LLM_API_KEY` is required.

### Background Worker

Run the background worker to continuously fetch and update feeds:

```bash
# Run continuously (default: refresh every 15 minutes)
npx simply-feed-mcp --worker

# Run once and exit
npx simply-feed-mcp --worker --run_once

# Custom refresh interval (in seconds)
npx simply-feed-mcp --worker --refresh_interval 600

# Use custom config file and path
npx simply-feed-mcp --worker --config_file /custom/path/my-feeds.json

# Use Azure Blob config
npx simply-feed-mcp --worker --config_blob_name container/feeds.json
```

### MCP Server

Ensure you specify the same values for environment variables that were used in the worker.

## Integration

### Claude Desktop

Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "simply-feed-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "simply-feed-mcp"
      ],
      "env": {
        "SIMPLY_FEED_LLM_API_KEY": "<API KEY>"
      }
    }
  }
}
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/hmmroger/simply-feed-mcp/issues)
- Repository: [https://github.com/hmmroger/simply-feed-mcp](https://github.com/hmmroger/simply-feed-mcp)
