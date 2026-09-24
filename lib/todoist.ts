import { env } from "./env";

export type TodoistTask = {
  id: string;
  content: string;
  priority: number; // 4 = most urgent (p1 in the app)
  dueDate: string | null;
  dueString: string | null;
  overdue: boolean;
  url: string;
};

type RawTask = {
  id: string;
  content: string;
  priority?: number;
  due?: { date?: string; string?: string; datetime?: string | null } | null;
};

/** Tasks due today or overdue, most urgent first. Read-only. */
export async function todoistDueToday(today: string): Promise<TodoistTask[]> {
  const url = new URL("https://api.todoist.com/api/v1/tasks/filter");
  url.searchParams.set("query", "today | overdue");
  url.searchParams.set("limit", "50");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.todoistToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Todoist ${res.status}`);
  const json = (await res.json()) as { results?: RawTask[] } | RawTask[];
  const raw = Array.isArray(json) ? json : (json.results ?? []);
  return raw
    .map((t) => {
      const dueDate = t.due?.date?.slice(0, 10) ?? null;
      return {
        id: t.id,
        content: t.content,
        priority: t.priority ?? 1,
        dueDate,
        dueString: t.due?.string ?? null,
        overdue: !!dueDate && dueDate < today,
        url: `https://app.todoist.com/app/task/${t.id}`,
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.priority - a.priority);
}
