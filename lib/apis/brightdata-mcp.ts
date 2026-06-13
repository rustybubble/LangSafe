import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MCP_BASE_URL = "https://mcp.brightdata.com/mcp";
const CALL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Singleton MCP client — lazy-connected on first tool call
// ---------------------------------------------------------------------------

let mcpClient: Client | null = null;
let connectPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (mcpClient) return mcpClient;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const token = process.env.BRIGHTDATA_API_TOKEN;
    if (!token) throw new Error("BRIGHTDATA_API_TOKEN not set");

    const client = new Client({ name: "LangSafe", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${MCP_BASE_URL}?token=${token}`)
    );

    await client.connect(transport);
    console.log("[BrightData MCP] Connected to hosted endpoint");
    mcpClient = client;
    connectPromise = null;
    return client;
  })();

  // If connection fails, allow retry on next call
  connectPromise.catch(() => {
    connectPromise = null;
  });

  return connectPromise;
}

// ---------------------------------------------------------------------------
// Configuration check
// ---------------------------------------------------------------------------

/**
 * Non-throwing check for whether BrightData MCP is configured.
 */
export function brightDataMCPConfigured(): boolean {
  return !!process.env.BRIGHTDATA_API_TOKEN;
}

// ---------------------------------------------------------------------------
// Tool wrappers
// ---------------------------------------------------------------------------

/**
 * Search the web via BrightData's `search_engine` MCP tool.
 * Returns formatted search results as a string.
 */
export async function brightdataSearch(
  query: string,
  country?: string
): Promise<string> {
  const client = await getClient();

  const args: Record<string, string> = { query };
  if (country) args.country = country;

  const result = await client.callTool(
    { name: "search_engine", arguments: args },
    undefined,
    { timeout: CALL_TIMEOUT_MS }
  );

  return extractTextContent(result);
}

/**
 * Scrape a URL as clean markdown via BrightData's `scrape_as_markdown` MCP tool.
 * Handles CAPTCHA, anti-bot, and JS rendering automatically.
 */
export async function brightdataScrapeMarkdown(
  url: string,
  country?: string
): Promise<string> {
  const client = await getClient();

  const args: Record<string, string> = { url };
  if (country) args.country = country;

  const result = await client.callTool(
    { name: "scrape_as_markdown", arguments: args },
    undefined,
    { timeout: CALL_TIMEOUT_MS }
  );

  return extractTextContent(result);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextContent(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (result.isError) {
    const errText =
      Array.isArray(result.content)
        ? result.content
            .filter((b): b is { type: "text"; text: string } => b.type === "text")
            .map((b) => b.text)
            .join("\n")
        : String(result.content);
    throw new Error(`BrightData MCP error: ${errText}`);
  }

  if (!Array.isArray(result.content)) return String(result.content);

  return result.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
