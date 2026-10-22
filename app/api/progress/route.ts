import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getProgressDb } from "@/db";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const statuses = new Set(["listened", "revisit", "understood"]);

function validDialogueId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^w(\d{2})d([1-5])-s([1-5])$/.exec(value);
  return !!match && Number(match[1]) >= 1 && Number(match[1]) <= 26;
}

function unavailable(error: unknown, action: "读取" | "保存") {
  const message = error instanceof Error ? error.message : String(error);
  const missingTable = /no such table:\s*dialogue_progress/i.test(message);
  return Response.json({
    error: missingTable
      ? "对话学习记录尚未初始化，请先应用数据库迁移。"
      : `对话学习记录暂时无法${action}，请稍后重试。`,
  }, { status: 503, headers });
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请登录后查看学习记录。" }, { status: 401, headers });
  try {
    const result = await getProgressDb().prepare(
      "SELECT dialogue_id AS dialogueId, status, updated_at AS updatedAt FROM dialogue_progress WHERE user_id = ? ORDER BY dialogue_id",
    ).bind(user.userId).all<{ dialogueId: string; status: string; updatedAt: string }>();
    return Response.json({ progress: result.results }, { headers });
  } catch (error) {
    console.error("Dialogue progress read failed", error);
    return unavailable(error, "读取");
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请登录后保存学习记录。" }, { status: 401, headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "请求来源无效。" }, { status: 403, headers });
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "请求格式有误。" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 2
    || !Object.hasOwn(body, "dialogueId") || !Object.hasOwn(body, "status")
    || !("dialogueId" in body) || !validDialogueId(body.dialogueId)
    || !("status" in body) || typeof body.status !== "string" || !statuses.has(body.status)) {
    return Response.json({ error: "对话或学习状态无效。" }, { status: 400, headers });
  }
  const progress = { dialogueId: body.dialogueId, status: body.status, updatedAt: new Date().toISOString() };
  try {
    await getProgressDb().prepare(
      "INSERT INTO dialogue_progress (user_id, dialogue_id, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, dialogue_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
    ).bind(user.userId, progress.dialogueId, progress.status, progress.updatedAt).run();
    return Response.json({ saved: true, progress }, { headers });
  } catch (error) {
    console.error("Dialogue progress save failed", error);
    return unavailable(error, "保存");
  }
}
