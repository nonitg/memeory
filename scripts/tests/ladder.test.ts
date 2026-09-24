// Run: pnpm test  (uses a throwaway embedded database)
import assert from "node:assert/strict";
import { query } from "../../lib/db";
import { buildDigest, sendDaily } from "../../lib/digest";
import { applyAction, createItem, getItem, markShown, remindersDue, reviewQueue, searchItems } from "../../lib/items";

const days = (iso: string | null) => Math.round((new Date(iso!).getTime() - Date.now()) / 86_400_000);
const past = (id: string) => query(`update items set review_at = now() - interval '1 hour' where id = $1`, [id]);

async function main() {
  const a = (await createItem({ text: "Octopuses have three hearts", source: "test" })).item;
  const b = (await createItem({ text: "Idea: walking 1:1s", source: "test" })).item;
  const c = (await createItem({ text: "Parked on level 3", source: "test" })).item;
  assert.equal(days(a.reviewAt), 3, "first look is 3 days out");

  await past(a.id);
  await past(b.id);
  let q = await reviewQueue();
  assert.deepEqual(q.map((i) => i.id).sort(), [a.id, b.id].sort(), "due items are in the queue");

  const d = await buildDigest();
  assert.equal(d.review.length, 2, "digest picks the due items");
  const again = await buildDigest();
  assert.deepEqual(again.review.map((i) => i.id), d.review.map((i) => i.id), "same picks all day");

  await markShown([a.id, b.id]);
  let A = (await getItem(a.id))!;
  assert.equal(days(A.reviewAt), 14, "after first look: 14 days");
  assert.equal(A.timesShown, 1);
  q = await reviewQueue();
  assert.equal(q.length, 2, "shown today but unanswered: still on the home screen");

  await markShown([a.id]);
  A = (await getItem(a.id))!;
  assert.equal(A.timesShown, 1, "no double count on the same day");

  A = (await applyAction(a.id, "got"))!;
  assert.equal(days(A.reviewAt), 14, "got after the digest keeps the schedule");
  q = await reviewQueue();
  assert.deepEqual(q.map((i) => i.id), [b.id], "answered items leave the queue");

  const B = (await applyAction(b.id, "again"))!;
  assert.equal(days(B.reviewAt), 2, "again: back in 2 days");

  // A due item answered in the app (never shown by a digest) advances the ladder.
  await past(c.id);
  await query(`update items set ladder_idx = 1 where id = $1`, [c.id]);
  const C = (await applyAction(c.id, "got"))!;
  assert.equal(days(C.reviewAt), 45, "second rung: 45 days");

  const arch = (await applyAction(c.id, "archive"))!;
  assert.equal(arch.status, "archived");
  q = await reviewQueue();
  assert.ok(!q.some((i) => i.id === c.id), "archived items never resurface");

  const r = (await applyAction(b.id, "tomorrow"))!;
  assert.ok(r.remindAt && days(r.remindAt) <= 1, "tomorrow reminder set");
  assert.ok(!(await remindersDue()).some((i) => i.id === b.id), "tomorrow's reminder isn't due today");

  await query(`update items set tags = '{marine-biology}' where id = $1`, [a.id]);
  assert.equal((await searchItems("#marine-biology"))[0]?.id, a.id, "tag search");
  assert.equal((await searchItems("octopus hearts"))[0]?.id, a.id, "keyword search");

  const res = await sendDaily({});
  assert.ok("results" in res, "daily run completes with no channels configured");

  console.log("✓ all ladder, digest, and search checks passed");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
