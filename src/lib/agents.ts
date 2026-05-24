import { generateText, tool } from "ai";
import { z } from "zod";
import { StorageKey, getStorage } from "./storage";
import { logError, logMessage } from "./utils";

export interface AgentToolResult {
  toolsUsed: string[];
  toolOutputs: Record<string, string>;
  finalResponse: string;
}

const AGENT_SYSTEM_PROMPT = `You are an AI assistant integrated into Meta smart glasses.
You receive voice commands from the user and can take real actions on their behalf.
When the user's intent matches a tool, use it. Always explain what you did in 1-2 short sentences suitable for text-to-speech.
Available actions: search the web, take a note, create a calendar event.
Keep all spoken responses concise and conversational — no markdown or bullet points.`;

function buildSearchTool(perplexityApiKey: string) {
  return tool({
    description:
      "Search the web for current information. Use when the user asks a question that requires up-to-date or factual information.",
    parameters: z.object({
      query: z.string().describe("The search query to look up"),
    }),
    execute: async ({ query }) => {
      logMessage(`[agents] searchWeb: ${query}`);
      try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${perplexityApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            messages: [{ role: "user", content: query }],
            max_tokens: 200,
          }),
        });
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const result = data.choices?.[0]?.message?.content ?? "No results found.";
        await saveToolLog("searchWeb", query, result);
        return result;
      } catch (error) {
        logError(`[agents] searchWeb error: ${error}`);
        return "Sorry, the web search failed.";
      }
    },
  });
}

function buildNoteToolWithApiKey() {
  return tool({
    description:
      "Save a voice note to local storage. Use when the user says they want to remember something or take a note.",
    parameters: z.object({
      content: z.string().describe("The note content to save"),
      title: z.string().optional().describe("Optional title for the note"),
    }),
    execute: async ({ content, title }) => {
      logMessage(`[agents] takeNote: ${content}`);
      try {
        const key = "local:voice_notes";
        const stored = localStorage.getItem(key);
        const notes: Array<{ id: string; title: string; content: string; timestamp: number }> =
          stored ? (JSON.parse(stored) as typeof notes) : [];
        const note = {
          id: crypto.randomUUID(),
          title: title ?? `Note ${new Date().toLocaleTimeString()}`,
          content,
          timestamp: Date.now(),
        };
        notes.push(note);
        localStorage.setItem(key, JSON.stringify(notes));
        await saveToolLog("takeNote", content, "Note saved: " + note.title);
        return `Note saved: "${note.title}"`;
      } catch (error) {
        logError(`[agents] takeNote error: ${error}`);
        return "Failed to save the note.";
      }
    },
  });
}

function buildCalendarTool() {
  return tool({
    description:
      "Create a calendar event by opening Google Calendar with pre-filled details. Use when the user wants to schedule something.",
    parameters: z.object({
      title: z.string().describe("Event title"),
      date: z
        .string()
        .optional()
        .describe("Date in YYYY-MM-DD format, defaults to today"),
      time: z
        .string()
        .optional()
        .describe("Time in HH:MM 24h format, e.g. 14:30"),
      duration: z
        .number()
        .optional()
        .describe("Duration in minutes, defaults to 60"),
      description: z.string().optional().describe("Event description"),
    }),
    execute: async ({ title, date, time, duration = 60, description }) => {
      logMessage(`[agents] createCalendarEvent: ${title}`);
      try {
        const eventDate = date ?? new Date().toISOString().split("T")[0];
        const startTime = time ?? "09:00";
        const [hours, minutes] = startTime.split(":").map(Number);
        const startDate = new Date(`${eventDate}T${startTime}:00`);
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

        const pad = (n: number) => String(n).padStart(2, "0");
        const toGCal = (d: Date) =>
          `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

        const params = new URLSearchParams({
          action: "TEMPLATE",
          text: title,
          dates: `${toGCal(startDate)}/${toGCal(endDate)}`,
          ...(description ? { details: description } : {}),
        });

        const calUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
        chrome.tabs.create({ url: calUrl });
        await saveToolLog("createCalendarEvent", title, `Event URL opened: ${calUrl}`);
        return `Calendar event "${title}" created for ${eventDate} at ${startTime}.`;
      } catch (error) {
        logError(`[agents] createCalendarEvent error: ${error}`);
        return "Failed to create the calendar event.";
      }
    },
  });
}

async function saveToolLog(tool: string, input: string, output: string) {
  try {
    const key = "local:tool_logs";
    const stored = localStorage.getItem(key);
    const logs: Array<{ tool: string; input: string; output: string; timestamp: number }> =
      stored ? (JSON.parse(stored) as typeof logs) : [];
    logs.push({ tool, input, output, timestamp: Date.now() });
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    localStorage.setItem(key, JSON.stringify(logs));
  } catch (_) {}

  try {
    await fetch("http://localhost:3001/api/tool-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolName: tool, input, output }),
    });
  } catch (_) {}
}

export async function runAgentWithTools(
  message: string,
  aiProviderFn: (model: string) => Parameters<typeof generateText>[0]["model"],
  model: string
): Promise<AgentToolResult> {
  logMessage("[agents] runAgentWithTools: " + message);

  const storageApiKey = getStorage(StorageKey.API_KEYS);
  const apiKeys = await storageApiKey.getValue();
  const perplexityApiKey = apiKeys["perplexity"] ?? "";

  const tools: Record<string, ReturnType<typeof tool>> = {
    takeNote: buildNoteToolWithApiKey(),
    createCalendarEvent: buildCalendarTool(),
  };

  if (perplexityApiKey) {
    tools.searchWeb = buildSearchTool(perplexityApiKey);
  }

  try {
    const result = await generateText({
      model: aiProviderFn(model),
      system: AGENT_SYSTEM_PROMPT,
      prompt: message,
      tools,
      maxSteps: 3,
    });

    const toolsUsed = result.toolCalls?.map((tc) => tc.toolName) ?? [];
    const toolOutputs: Record<string, string> = {};
    for (const tr of result.toolResults ?? []) {
      toolOutputs[tr.toolName] = String(tr.result);
    }

    logMessage(`[agents] tools used: ${toolsUsed.join(", ") || "none"}`);
    return {
      toolsUsed,
      toolOutputs,
      finalResponse: result.text,
    };
  } catch (error) {
    logError("[agents] runAgentWithTools error: " + error);
    throw error;
  }
}
