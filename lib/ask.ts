import { generateText } from "ai";
import { features } from "./env";
import { clip, searchItems } from "./items";
import { fastModel } from "./llm";
import { nowForPrompt, shortDate } from "./time";
import { KIND_META, type Item } from "./types";

const SYSTEM = `You answer questions about the user's own saved notes, links, and facts.
Use only the notes provided. Answer in 1 to 3 short sentences. Cite the notes you used inline as [1], [2].
If the notes don't answer the question, reply exactly: I couldn't find that in your brain.`;

export async function askBrain(q: string): Promise<{ answer: string | null; sources: Item[] }> {
  const sources = await searchItems(q, 8);
  if (!features.llm || !sources.length) return { answer: null, sources };
  const notes = sources
    .map((s, i) =>
      [
        `[${i + 1}] ${KIND_META[s.kind].label}: ${s.title}`,
        `Saved: ${shortDate(s.createdAt)}`,
        s.url && `URL: ${s.url}`,
        s.summary && `Summary: ${s.summary}`,
        s.body && `Text: ${clip(s.body, 900)}`,
        s.linkDescription && `Page: ${clip(s.linkDescription, 300)}`,
        s.tags.length && `Tags: ${s.tags.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  try {
    const { text } = await generateText({
      model: fastModel(),
      system: SYSTEM,
      prompt: `Now: ${nowForPrompt()}\n\nNotes:\n${notes}\n\nQuestion: ${q}`,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return { answer: text.trim() || null, sources };
  } catch (err) {
    console.error("ask failed", (err as Error).message);
    return { answer: null, sources };
  }
}
