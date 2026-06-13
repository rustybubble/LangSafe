export const FEATHERLESS_CHAT_URL = "https://api.featherless.ai/v1/chat/completions";
export const DEFAULT_FEATHERLESS_MODEL = "Qwen/Qwen2.5-7B-Instruct";

export namespace Featherless {
  export interface Usage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }

  export interface Tool {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
    cache_control?: Record<string, unknown>;
  }

  export interface TextBlock {
    type: "text";
    text: string;
  }

  export interface ToolUseBlock {
    type: "tool_use";
    id: string;
    name: string;
    input: unknown;
  }

  export interface ToolResultBlockParam {
    type: "tool_result";
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  }

  export interface ContentBlockParam {
    type: string;
    text?: string;
    source?: unknown;
    title?: string;
    cache_control?: Record<string, unknown>;
  }

  export type DocumentBlockParam = ContentBlockParam;
  export type ImageBlockParam = ContentBlockParam;
  export type ContentBlock = TextBlock | ToolUseBlock;

  export interface MessageParam {
    role: "user" | "assistant";
    content:
      | string
      | Array<ContentBlockParam | ToolResultBlockParam | ContentBlock>;
  }

  export interface Message {
    content: ContentBlock[];
    stop_reason?: string;
    usage: Usage;
  }

  export interface CreateParams {
    model?: string;
    max_tokens?: number;
    temperature?: number;
    system?: string | Array<{ text?: string; [key: string]: unknown }>;
    tools?: Tool[];
    tool_choice?: { type?: string; name?: string };
    messages: MessageParam[];
  }
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

function getApiKey(): string {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    throw new Error("FEATHERLESS_API_KEY is not set");
  }
  return apiKey;
}

function getModel(model?: string): string {
  return model || process.env.FEATHERLESS_MODEL || DEFAULT_FEATHERLESS_MODEL;
}

function normalizeSystem(system?: Featherless.CreateParams["system"]): string | null {
  if (!system) return null;
  if (typeof system === "string") return system;
  return system.map((part) => part.text || "").filter(Boolean).join("\n\n") || null;
}

function normalizeContent(
  content: Featherless.MessageParam["content"]
): { text: string; toolCalls: OpenAIMessage["tool_calls"] } {
  if (typeof content === "string") {
    return { text: content, toolCalls: undefined };
  }

  const textParts: string[] = [];
  const toolCalls: OpenAIMessage["tool_calls"] = [];

  for (const block of content) {
    if (block.type === "text" && "text" in block) {
      textParts.push(block.text || "");
    } else if (block.type === "tool_use" && "name" in block) {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {}),
        },
      });
    } else if (block.type === "tool_result" && "tool_use_id" in block) {
      textParts.push(
        `Tool result for ${block.tool_use_id}: ${block.content}${block.is_error ? " [error]" : ""}`
      );
    } else if (block.type === "image") {
      textParts.push("[Image attachment omitted; use extracted text/OCR context only.]");
    } else if (block.type === "document") {
      textParts.push("[Document attachment omitted; use extracted text/OCR context only.]");
    }
  }

  return {
    text: textParts.filter(Boolean).join("\n\n"),
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

function toOpenAIMessages(params: Featherless.CreateParams): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  const systemText = normalizeSystem(params.system);
  if (systemText) {
    messages.push({ role: "system", content: systemText });
  }

  for (const message of params.messages) {
    const normalized = normalizeContent(message.content);
    messages.push({
      role: message.role,
      content: normalized.text || null,
      ...(normalized.toolCalls ? { tool_calls: normalized.toolCalls } : {}),
    });
  }

  return messages;
}

function toOpenAITools(tools?: Featherless.Tool[]) {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema,
    },
  }));
}

function toOpenAIToolChoice(choice?: Featherless.CreateParams["tool_choice"]) {
  if (!choice?.name) return undefined;
  return { type: "function" as const, function: { name: choice.name } };
}

function parseJsonFromText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)?.[1] || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function inferToolCalls(
  text: string,
  tools?: Featherless.Tool[],
  toolChoice?: Featherless.CreateParams["tool_choice"]
): Featherless.ToolUseBlock[] {
  const parsed = parseJsonFromText(text);
  if (!parsed || !tools?.length) return [];

  const toolNames = new Set(tools.map((tool) => tool.name));
  const makeBlock = (name: string, input: unknown, index = 0): Featherless.ToolUseBlock => ({
    type: "tool_use",
    id: `featherless_tool_${Date.now()}_${index}`,
    name,
    input,
  });

  if (toolChoice?.name && toolNames.has(toolChoice.name)) {
    return [makeBlock(toolChoice.name, parsed)];
  }

  if (toolNames.has("report_source")) {
    const sources = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).sources)
        ? ((parsed as Record<string, unknown>).sources as unknown[])
        : [];
    if (sources.length > 0) {
      return sources.map((source, index) => makeBlock("report_source", source, index));
    }
  }

  if (toolNames.has("save_entries")) {
    const maybeEntries = Array.isArray((parsed as Record<string, unknown>).entries)
      ? (parsed as Record<string, unknown>)
      : Array.isArray(parsed)
        ? { entries: parsed }
        : null;
    if (maybeEntries) return [makeBlock("save_entries", maybeEntries)];
  }

  if (toolNames.has("save_grammar_patterns")) {
    const maybePatterns = Array.isArray((parsed as Record<string, unknown>).patterns)
      ? (parsed as Record<string, unknown>)
      : null;
    if (maybePatterns) return [makeBlock("save_grammar_patterns", maybePatterns)];
  }

  return [];
}

export class FeatherlessClient {
  constructor(private readonly options: { maxRetries?: number } = {}) {}

  messages = {
    create: async (
      params: Featherless.CreateParams,
      requestOptions: { signal?: AbortSignal } = {}
    ): Promise<Featherless.Message> => {
      const maxRetries = this.options.maxRetries ?? 2;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(FEATHERLESS_CHAT_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${getApiKey()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: getModel(params.model),
              messages: toOpenAIMessages(params),
              max_tokens: params.max_tokens,
              temperature: params.temperature,
              tools: toOpenAITools(params.tools),
              tool_choice: toOpenAIToolChoice(params.tool_choice),
            }),
            signal: requestOptions.signal,
          });

          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Featherless API ${res.status}: ${body}`);
          }

          const data = (await res.json()) as OpenAIResponse;
          const choice = data.choices?.[0];
          const message = choice?.message;
          const contentText = message?.content || "";

          const toolCalls =
            message?.tool_calls?.map((call, index): Featherless.ToolUseBlock => ({
              type: "tool_use",
              id: call.id || `featherless_tool_${Date.now()}_${index}`,
              name: call.function?.name || "",
              input: parseJsonFromText(call.function?.arguments || "{}") || {},
            })).filter((call) => call.name) ||
            inferToolCalls(contentText, params.tools, params.tool_choice);

          const content: Featherless.ContentBlock[] = toolCalls.length > 0
            ? toolCalls
            : [{ type: "text", text: contentText }];

          return {
            content,
            stop_reason: toolCalls.length > 0 ? "tool_use" : choice?.finish_reason || "end_turn",
            usage: {
              input_tokens: data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0,
              output_tokens: data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0,
            },
          };
        } catch (err) {
          lastError = err as Error;
          const retryable =
            attempt < maxRetries &&
            !requestOptions.signal?.aborted &&
            !/ 4\d\d:/.test(lastError.message);
          if (!retryable) break;
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * Math.pow(2, attempt) + Math.random() * 250)
          );
        }
      }

      throw lastError || new Error("Featherless request failed");
    },
  };
}

export async function featherlessChatText({
  system,
  prompt,
  maxTokens = 1024,
  temperature = 0.2,
  signal,
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const client = new FeatherlessClient({ maxRetries: 2 });
  const response = await client.messages.create(
    {
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }],
    },
    { signal }
  );
  const textBlock = response.content.find((block): block is Featherless.TextBlock => block.type === "text");
  return textBlock?.text.trim() || "";
}

export function extractJson<T>(text: string): T {
  const parsed = parseJsonFromText(text);
  if (!parsed) {
    throw new Error("Featherless response did not contain valid JSON");
  }
  return parsed as T;
}
