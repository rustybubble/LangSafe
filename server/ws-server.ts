import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // also load .env for deployed environments

// ─── Fix 5: Startup environment variable validation ───

const REQUIRED_ENV = [
  "ELASTIC_URL",
  "ELASTIC_API_KEY",
  "FEATHERLESS_API_KEY",
  "JINA_API_KEY",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\n  Missing required environment variables:\n  ${missing.join("\n  ")}\n`
  );
  process.exit(1);
}

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import type {
  AgentEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  PreservationRequest,
} from "./types.js";
import { initEventEmitter, emitEvent, getEventHistory, pushToHistory } from "./utils/event-emitter.js";
import { runOrchestrator, injectSource } from "./orchestrator.js";
import { EmitEventSchema, PreserveRequestSchema } from "./utils/schemas.js";
import { getErrorMessage } from "../lib/utils/errors.js";

const app = express();

// Fix 2: Explicit request body size limit
app.use(express.json({ limit: "16kb" }));

const httpServer = createServer(app);

const CORS_ORIGINS = [
  "http://localhost:3000",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  process.env.FRONTEND_URL || "",
].filter(Boolean);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// Initialize the centralized event emitter with the Socket.io server
initEventEmitter(io);

// ─── Fix 3: Rate limiters ───

const emitLimiter = rateLimit({
  windowMs: 10_000,
  max: 100,
  message: { error: "Too many emit requests" },
});

const preserveLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: { error: "Too many preservation requests" },
});

const eventsLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: { error: "Too many polling requests" },
});

// Track active pipeline to prevent duplicate runs
let pipelineRunning = false;
let pipelineAbortController: AbortController | null = null;

// ─── Socket.io connection handling ───

io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send pipeline status to late-joining clients
  socket.emit("pipeline_status", { running: pipelineRunning });

  // Send event history to late-joining clients
  const history = getEventHistory();
  for (const event of history) {
    socket.emit("agent_event", event);
  }
  if (history.length > 0) {
    console.log(`[WS] Sent ${history.length} historical events to ${socket.id}`);
  }

  // Listen for preservation trigger from frontend
  socket.on("start_preservation", async (req: PreservationRequest) => {
    // Fix 6: Validate WebSocket input
    const parsed = PreserveRequestSchema.safeParse(req);
    if (!parsed.success) {
      emitEvent("orchestrator", "pipeline_error", "error", {
        message: `Invalid preservation request: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      });
      return;
    }

    const validReq = parsed.data as PreservationRequest;
    // Backward compat: accept `language` as alias for `language_name`
    if (!validReq.language_name && validReq.language) {
      validReq.language_name = validReq.language;
    }

    console.log(
      `[WS] Preservation requested by ${socket.id}: ${validReq.language_name} (${validReq.language_code})`
    );

    if (pipelineRunning) {
      emitEvent("orchestrator", "pipeline_error", "error", {
        message: "A preservation pipeline is already running. Please wait for it to complete.",
      });
      return;
    }

    pipelineRunning = true;
    pipelineAbortController = new AbortController();
    try {
      await runOrchestrator(validReq, pipelineAbortController.signal);
    } catch (err) {
      emitEvent("orchestrator", "pipeline_error", "error", {
        message: `Pipeline failed: ${getErrorMessage(err)}`,
      });
    } finally {
      pipelineRunning = false;
      pipelineAbortController = null;
    }
  });

  // Inject a source into the running pipeline
  socket.on("inject_source", (source: { url: string; title?: string; type?: string }) => {
    if (!pipelineRunning) {
      emitEvent("orchestrator", "inject_error", "error", {
        message: "No pipeline is currently running.",
      });
      return;
    }

    let title = source.title;
    if (!title) {
      try { title = new URL(source.url).hostname; } catch { title = source.url; }
    }
    const type = source.type || "generic";

    const success = injectSource({ url: source.url, title, type });
    if (success) {
      console.log(`[WS] Source injected by ${socket.id}: ${source.url}`);
      emitEvent("orchestrator", "source_injected", "complete", {
        url: source.url,
        title,
        message: `Manually added source: ${title}`,
      });
    } else {
      emitEvent("orchestrator", "inject_error", "error", {
        message: "Pipeline is finishing up — source cannot be added at this time.",
      });
    }
  });

  // Stop a running pipeline
  socket.on("stop_pipeline", () => {
    if (pipelineRunning && pipelineAbortController) {
      console.log(`[WS] Pipeline stop requested by ${socket.id}`);
      pipelineAbortController.abort();
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[WS] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ─── HTTP POST /emit — for P3/P4 services to push events ───

app.post("/emit", emitLimiter, (req, res) => {
  // Fix 1: Zod validation
  const parsed = EmitEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid event payload",
      details: parsed.error.issues,
    });
    return;
  }

  const body = parsed.data;
  const event: AgentEvent = {
    id: body.id || randomUUID(),
    agent: body.agent,
    action: body.action,
    status: body.status,
    data: (body.data || {}) as AgentEvent["data"],
    timestamp: body.timestamp || new Date().toISOString(),
  };

  // Store in ring buffer + broadcast
  pushToHistory(event);
  io.emit("agent_event", event);
  console.log(`[HTTP] Event from external service: ${event.agent}/${event.action}`);

  res.json({ ok: true, id: event.id });
});

// ─── GET /events — polling fallback for clients that can't maintain WebSocket ───

app.get("/events", eventsLimiter, (_req, res) => {
  res.json({ events: getEventHistory() });
});

// ─── POST /preserve — HTTP trigger for the pipeline (used by Next.js API route) ───

app.post("/preserve", preserveLimiter, (req, res) => {
  // Fix 1: Zod validation
  const parsed = PreserveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid preservation request",
      details: parsed.error.issues,
    });
    return;
  }

  const body = parsed.data;
  // Backward compat: accept `language` as alias for `language_name`
  const language_name = body.language_name || body.language;
  const language_code = body.language_code;

  if (pipelineRunning) {
    res.status(409).json({ error: "Pipeline already running" });
    return;
  }

  pipelineRunning = true;
  pipelineAbortController = new AbortController();
  const pipelineId = randomUUID();

  runOrchestrator({
    ...body,
    language_name,
    language_code,
  } as PreservationRequest, pipelineAbortController.signal)
    .catch((err) => {
      emitEvent("orchestrator", "pipeline_error", "error", {
        message: `Pipeline failed: ${getErrorMessage(err)}`,
      });
    })
    .finally(() => {
      pipelineRunning = false;
      pipelineAbortController = null;
    });

  res.json({ status: "started", pipeline_id: pipelineId });
});

// ─── Health check ───

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    connections: io.engine.clientsCount,
    pipeline_running: pipelineRunning,
    events_in_history: getEventHistory().length,
  });
});

// ─── Start ───

const PORT = parseInt(process.env.PORT || process.env.WS_PORT || "3001", 10);

httpServer.listen(PORT, () => {
  console.log(`\n  LangSafe WebSocket Server`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  CORS:    ${CORS_ORIGINS.join(", ")}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  Emit:    POST http://localhost:${PORT}/emit\n`);
});
