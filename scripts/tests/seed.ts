// Seeds a realistic-looking brain for screenshots: PGLITE_DIR=... tsx scripts/tests/seed.ts
import { query } from "../../lib/db";
import { createItem } from "../../lib/items";

const rows: [string, string, string | null, string[], string | null, number][] = [
  ["The Feynman technique: explain it to a 12 year old to find gaps", "fact", "Teaching forces you to notice what you don't actually understand.", ["learning"], null, 16],
  ["https://www.paulgraham.com/greatwork.html", "link", "Paul Graham on choosing work driven by curiosity and doing it ambitiously.", ["career", "writing"], "How to Do Great Work", 5],
  ["Idea: walk-and-talk 1:1s instead of the Friday sync", "idea", "Swap the sit-down sync for a walking meeting to get more candid conversations.", ["team", "meetings"], null, 1],
  ["Sam's birthday is March 3. Loves pour-over coffee", "fact", null, ["people", "gifts"], null, 0],
  ["“We are what we repeatedly do.” — Will Durant", "quote", "Durant summarizing Aristotle on habit.", ["habits"], null, 0],
  ["Book dentist cleaning", "todo", null, ["health"], null, 0],
];

async function main() {
  for (const [text, kind, summary, tags, linkTitle, ageDays] of rows) {
    const { item } = await createItem({ text, source: ["ios", "browser", "mac", "whatsapp", "web", "ios"][ageDays % 6] });
    await query(
      `update items set kind = $2, summary = $3, tags = $4::text[], link_title = coalesce($5, link_title), title = coalesce($5, title),
         enrich_state = 'done', created_at = now() - make_interval(days => $6), actionable = ($2 = 'todo'),
         review_at = case when $6 >= 14 then now() - interval '1 hour' else review_at end
       where id = $1`,
      [item.id, kind, summary, tags, linkTitle, ageDays],
    );
  }
  await query(`update items set remind_at = now() + interval '2 hours' where title like 'Book dentist%'`);
  console.log("seeded");
}
main();
