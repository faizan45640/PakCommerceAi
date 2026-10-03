import { generateText, type UIMessage } from "ai";

import { getAiConfig, getLanguageModel } from "./provider.js";

export const TITLE_MAX = 48;

/** First user message as plain text, or null. */
export function firstUserText(messages: UIMessage[]): string | null {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return null;

  const text = firstUser.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim();

  return text || null;
}

/** Short fallback when the model is offline or returns junk. */
export function fallbackChatTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= TITLE_MAX) return cleaned;
  return `${cleaned.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

function cleanTitle(raw: string): string | null {
  const title = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title || title.length > TITLE_MAX) return null;
  if (/[.!?]$/.test(title) && title.split(" ").length > 6) return null;
  return title;
}

/**
 * A short sidebar label for the chat. Uses the same provider as Rafiq when
 * configured; otherwise a trimmed first message. Never invents shop facts.
 */
export async function generateChatTitle(messages: UIMessage[]): Promise<string | null> {
  const source = firstUserText(messages);
  if (!source) return null;

  const config = getAiConfig();
  if (!config.isConfigured) return fallbackChatTitle(source);

  try {
    const { text } = await generateText({
      model: getLanguageModel(),
      temperature: 0.2,
      prompt:
        `Write a short chat title for a shop assistant sidebar.\n` +
        `Rules: 2 to 5 words. No quotes. No trailing punctuation. Title case.\n` +
        `Message:\n${source.slice(0, 400)}`,
    });

    return cleanTitle(text) ?? fallbackChatTitle(source);
  } catch (error) {
    console.error("Chat title generation failed:", error);
    return fallbackChatTitle(source);
  }
}
