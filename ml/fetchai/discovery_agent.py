"""
LangSafe Discovery Agent -- Fetch.ai uAgent
Wraps the LangSafe Discovery pipeline as a discoverable agent
on the Fetch.ai Agentverse / ASI:One marketplace.

Usage:
  pip install -r requirements.txt
  python discovery_agent.py
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone
from uuid import uuid4

# Load .env.local from project root
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
sys.path.insert(0, PROJECT_ROOT)
from dotenv import load_dotenv

load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    EndSessionContent,
    chat_protocol_spec,
)
from uagents_core.contrib.protocols.payment import (
    payment_protocol_spec,
    RequestPayment,
    CommitPayment,
    CompletePayment,
    RejectPayment,
    Funds,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WS_SERVER_URL = os.getenv("WS_SERVER_URL", "http://localhost:3001")
AGENT_SEED = os.getenv(
    "FETCHAI_AGENT_SEED", "LangSafe-discovery-agent-seed-v1"
)
AGENT_PORT = int(os.getenv("FETCHAI_AGENT_PORT", "8010"))

# Payment config
PRICE_PER_DISCOVERY = "0.10"
PAYMENT_CURRENCY = "FET"
PAYMENT_METHOD = "wallet"

# ---------------------------------------------------------------------------
# Agent setup
# ---------------------------------------------------------------------------

agent = Agent(
    name="LangSafe Discovery Agent",
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)
payment_proto = Protocol(spec=payment_protocol_spec)


# ---------------------------------------------------------------------------
# Helper: Call LangSafe pipeline
# ---------------------------------------------------------------------------


def discover_sources(language: str, language_code: str) -> dict:
    """Start the LangSafe discovery pipeline and collect discovered sources."""

    # Start the pipeline
    res = requests.post(
        f"{WS_SERVER_URL}/preserve",
        json={"language": language, "language_code": language_code},
        timeout=10,
    )
    res.raise_for_status()

    # Wait for discovery phase to produce initial results
    time.sleep(15)

    # Fetch events to extract discovered sources
    events_res = requests.get(f"{WS_SERVER_URL}/events", timeout=10)
    events_res.raise_for_status()
    events = events_res.json().get("events", [])

    sources = []
    for event in events:
        if event.get("agent") == "discovery" and event.get("status") == "complete":
            data = event.get("data", {})
            if data.get("url"):
                sources.append(
                    {
                        "url": data.get("url", ""),
                        "title": data.get("title", ""),
                        "type": data.get("type", ""),
                        "description": data.get("message", ""),
                    }
                )

    return {
        "language": language,
        "language_code": language_code,
        "sources": sources,
        "total_found": len(sources),
    }


# ---------------------------------------------------------------------------
# Chat Protocol Handlers
# ---------------------------------------------------------------------------


@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    # Acknowledge receipt
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    # Extract text from message
    text = ""
    for item in msg.content:
        if isinstance(item, TextContent):
            text += item.text

    ctx.logger.info(f"Received discovery request: {text}")

    # Request payment for the discovery service
    try:
        await ctx.send(
            sender,
            RequestPayment(
                timestamp=datetime.now(timezone.utc),
                accepted_funds=[
                    Funds(
                        amount=PRICE_PER_DISCOVERY,
                        currency=PAYMENT_CURRENCY,
                        payment_method=PAYMENT_METHOD,
                    )
                ],
                recipient=str(ctx.agent.address),
                deadline_seconds=300,
                description=f"LangSafe language discovery service",
            ),
        )
        ctx.logger.info(
            f"Payment request sent to {sender}: {PRICE_PER_DISCOVERY} {PAYMENT_CURRENCY}"
        )
    except Exception as e:
        ctx.logger.warning(f"Payment request failed (continuing anyway): {e}")

    # Parse the request — JSON with language and language_code required
    language = None
    language_code = None

    try:
        parsed = json.loads(text)
        language = parsed.get("language")
        language_code = parsed.get("language_code")
    except (json.JSONDecodeError, TypeError):
        pass  # Natural language — can't reliably extract language name

    if not language or not language_code:
        await ctx.send(
            sender,
            ChatMessage(
                timestamp=datetime.now(timezone.utc),
                msg_id=uuid4(),
                content=[
                    TextContent(type="text", text=json.dumps({
                        "error": "Please specify language and language_code in JSON format",
                        "example": {"language": "Maguindanao", "language_code": "mdh"},
                    })),
                    EndSessionContent(type="end-session"),
                ],
            ),
        )
        return

    # Run discovery
    try:
        result = discover_sources(language, language_code)
        response_text = json.dumps(result, indent=2, ensure_ascii=False)
    except Exception as e:
        ctx.logger.exception(f"Discovery failed: {e}")
        response_text = json.dumps(
            {"error": str(e), "sources": [], "total_found": 0}
        )

    # Send response
    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.now(timezone.utc),
            msg_id=uuid4(),
            content=[
                TextContent(type="text", text=response_text),
                EndSessionContent(type="end-session"),
            ],
        ),
    )


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Acknowledged by {sender} for msg {msg.acknowledged_msg_id}")


# ---------------------------------------------------------------------------
# Payment Protocol Handlers
# ---------------------------------------------------------------------------


@payment_proto.on_message(CommitPayment)
async def handle_commit_payment(ctx: Context, sender: str, msg: CommitPayment):
    """Handle payment commitment — acknowledge and mark complete."""
    ctx.logger.info(
        f"Payment committed by {sender}: tx={msg.transaction_id}"
    )
    await ctx.send(
        sender,
        CompletePayment(
            timestamp=datetime.now(timezone.utc),
            transaction_id=msg.transaction_id,
        ),
    )
    ctx.logger.info(f"Payment completed for tx={msg.transaction_id}")


@payment_proto.on_message(RejectPayment)
async def handle_reject_payment(ctx: Context, sender: str, msg: RejectPayment):
    """Handle payment rejection — log and continue (service already delivered for demo)."""
    ctx.logger.warning(
        f"Payment rejected by {sender}: {msg.reason or 'no reason given'}"
    )


# Attach protocols
agent.include(protocol, publish_manifest=True)
agent.include(payment_proto, publish_manifest=True)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info("LangSafe Discovery Agent started")
    ctx.logger.info(f"  Address: {ctx.agent.address}")
    ctx.logger.info(f"  WS Server: {WS_SERVER_URL}")
    ctx.logger.info(f"  Protocols: Chat, Payment ({PRICE_PER_DISCOVERY} {PAYMENT_CURRENCY}/request)")


if __name__ == "__main__":
    agent.run()
