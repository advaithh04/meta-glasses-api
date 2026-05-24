# Mai — Ambient AI for Meta Ray-Ban Smart Glasses

![](/assets/mai-promotional.png)

> By using this project you agree to the [Terms of Use](TERMS_OF_USE.md).

Mai turns Meta Ray-Ban Smart Glasses into a context-aware AI assistant. Rather than treating the glasses as a simple voice interface, this project explores what it means to have ambient intelligence that can perceive your environment, reason about it, and take real actions on your behalf — all through a natural conversational layer built on top of Messenger.

---

## Architecture Overview

```
Meta Glasses (voice/camera)
        │
        ▼
  Facebook Messenger
        │
        ▼
  Browser Extension (WXT + React)
  ├── Multi-provider LLM routing (OpenAI, Claude, Gemini, Perplexity, DeepSeek, xAI)
  ├── Agentic tool loop (Vercel AI SDK maxSteps)
  │   ├── searchWeb  → Perplexity Sonar
  │   ├── takeNote   → persistent local storage
  │   └── createCalendarEvent → Google Calendar
  └── Vision pipeline (screenshot → multimodal LLM → spoken response)
        │
        ▼
  Node.js Backend (Express + SQLite)
  ├── /api/conversations  — full history with provider/model metadata
  ├── /api/tool-logs      — per-tool execution records
  └── /api/analytics      — usage breakdowns, 7-day activity, agent mode stats
```

---

## Key Design Decisions

**Why a browser extension rather than a native app?**
Messenger's web client is the only reliable way to intercept and inject messages without violating Meta's API policies. A content script + background service worker combination gives us persistent LLM access without requiring any server-side infrastructure for the core chat loop.

**Why Vercel AI SDK?**
The `generateText` + `tools` + `maxSteps` API handles the full agentic loop cleanly across every provider. Swapping Claude for GPT-4o or Gemini requires changing one line. This provider-agnostic approach was a deliberate choice — wearable AI shouldn't be locked to a single model.

**Why Claude as the primary addition?**
Anthropic's models handle ambiguous, context-sparse voice queries better than most alternatives. The glasses capture limited context — a short transcribed sentence, sometimes a photo. Claude's instruction-following and concise output (enforced via the system prompt) makes it particularly well-suited for TTS-bound responses where verbosity is actively harmful.

**Why SQLite for the backend?**
The analytics backend is intentionally lightweight. The goal is observability, not scale — understanding which tools get invoked, which providers users gravitate toward, and how agent mode changes conversation patterns. SQLite with WAL mode handles this comfortably and ships as a single binary with zero ops overhead.

---

## Features

### Multi-Provider LLM Routing
Supports OpenAI (GPT-4.1, GPT-4o), **Anthropic Claude** (Sonnet 4.5, Opus 4, Haiku 4.5, Claude 3.5 Sonnet/Haiku), Google Gemini (2.5 Flash), Perplexity Sonar, DeepSeek, and xAI Grok — all switchable at runtime from the extension UI.

### Voice-to-Action Agent Mode
When Agent Mode is enabled, incoming voice messages are routed through an agentic tool loop before a response is generated. The model decides which tools to call based on intent:

- **`searchWeb`** — live Perplexity search for factual/current queries
- **`takeNote`** — persists a voice note to local storage with timestamp
- **`createCalendarEvent`** — opens Google Calendar pre-filled with parsed event details

The system prompt is tuned to produce responses that read naturally when spoken aloud — no markdown, no bullet points, 1-3 sentences by default.

### Backend Analytics API
A standalone Node.js/Express server (`localhost:3001`) logs every conversation and tool execution to SQLite. Useful for understanding usage patterns across a day of wearing the glasses.

```
GET  /api/analytics          # provider breakdown, tool usage, 7-day activity
GET  /api/conversations      # paginated history with provider/model/agent_mode
GET  /api/tool-logs          # per-tool execution log
POST /api/conversations      # logged automatically by background service worker
POST /api/tool-logs          # logged automatically on each tool invocation
```

### Vision Pipeline
Screenshots from video calls are routed to a multimodal model (Claude or GPT-4o) for real-time scene description, returned as a spoken response via the TTS pipeline.

---

## Setup

### Requirements
- [Meta Ray-Ban Smart Glasses](https://about.fb.com/news/2023/09/new-ray-ban-meta-smart-glasses/) or the standalone Messenger app
- API key for at least one provider (OpenAI, Anthropic, Perplexity, Google, DeepSeek, or xAI)
- A secondary Facebook/Messenger account to act as the bot

### Browser Extension

```bash
bun install
bun run dev:chrome   # or dev:brave, dev:firefox
```

Load the extension, add your API keys in the settings panel, then navigate to [facebook.com/messages/t](https://www.facebook.com/messages/t) on your secondary account.

### Backend API (optional)

```bash
cd backend
npm install
node index.js       # starts on localhost:3001
```

---

## Routing Voice Commands to the Extension

The glasses can only address contacts by name. The trick is to create a Messenger group chat named after the AI you want to invoke:

1. Create a group chat with two Facebook accounts
2. Remove the spare account — you now have a named group chat
3. Rename it (e.g. "Claude", "Perplexity", "Assistant")
4. In the Meta View app → Communications → Messenger: disconnect and reconnect to force a contact sync

After the sync, "Hey Meta, send a message to Claude" routes directly to your monitored chat.

---

## Examples

**Voice query answered by Claude with Minimax TTS**
![](/assets/messenger-example-1.png)

**Real-time web search via Perplexity agent tool**
![](/assets/messenger-example-2.png)

**Vision pipeline: GPT-4.1 describing a video call frame**
![](/assets/messenger-example-3.png)

---

*Built on top of the original [meta-glasses-api](https://github.com/dcrebbin/meta-glasses-api) foundation by Devon Crebbin.*
