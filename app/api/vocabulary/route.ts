import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getProgressDb } from "@/db";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请登录后查看学习记录。" }, { status: 401, headers });
  try {
    const result = await getProgressDb().prepare(
      "SELECT term FROM vocabulary_progress WHERE user_id = ? AND mastered = 1",
    ).bind(user.userId).all<{ term: string }>();
    return Response.json({ mastered: result.results.map((row) => row.term) }, { headers });
  } catch (error) {
    console.error("Vocabulary progress read failed", error);
    return Response.json({ error: "学习记录暂时无法读取。" }, { status: 503, headers });
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
  if (!body || typeof body !== "object" || !("term" in body) || !("mastered" in body)
    || typeof body.term !== "string" || !/^[a-z][a-z0-9 '’.,()/-]{0,119}$/.test(body.term)
    || typeof body.mastered !== "boolean") {
    return Response.json({ error: "词汇或学习状态无效。" }, { status: 400, headers });
  }
  try {
    await getProgressDb().prepare(
      "INSERT INTO vocabulary_progress (user_id, term, mastered, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, term) DO UPDATE SET mastered = excluded.mastered, updated_at = excluded.updated_at",
    ).bind(user.userId, body.term, body.mastered ? 1 : 0, new Date().toISOString()).run();
    return Response.json({ saved: true }, { headers });
  } catch (error) {
    console.error("Vocabulary progress save failed", error);
    return Response.json({ error: "学习记录暂时无法保存。" }, { status: 503, headers });
  }
}
