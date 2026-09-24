import { after } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { applyAction, deleteItem, getItem } from "@/lib/items";
import { smDelete } from "@/lib/supermemory";
import type { ItemAction } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const item = await getItem((await params).id);
  return item ? Response.json({ item }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const { action, date } = (await req.json().catch(() => ({}))) as { action?: ItemAction; date?: string };
  if (!action) return Response.json({ error: "action required" }, { status: 400 });
  const item = await applyAction((await params).id, action, date);
  return item ? Response.json({ item }) : Response.json({ error: "not found or bad action" }, { status: 404 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const gone = await deleteItem((await params).id);
  if (!gone) return Response.json({ error: "not found" }, { status: 404 });
  if (gone.smDocId) after(() => smDelete(gone.smDocId!));
  return Response.json({ ok: true, item: gone.item });
}
