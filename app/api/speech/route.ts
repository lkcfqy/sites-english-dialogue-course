import { synthesizeEnglishSpeech } from "@/lib/english-edge";
import { VOICE_BY_ID } from "@/lib/english-voices";

export const runtime = "edge";

export async function POST(request: Request) {
  let text: unknown;
  let voiceId: unknown;
  try {
    const body: unknown = await request.json();
    text = body && typeof body === "object" && "text" in body ? body.text : undefined;
    voiceId = body && typeof body === "object" && "voiceId" in body
      ? body.voiceId : "en-US-JennyNeural";
  } catch {
    return Response.json({ error: "语音请求格式有误。" }, { status: 400 });
  }

  if (typeof text !== "string" || text.length < 1 || text.length > 300 || !/[A-Za-z0-9]/u.test(text)) {
    return Response.json({ error: "请选择一句英语对话或有效数字。" }, { status: 400 });
  }
  if (typeof voiceId !== "string" || !Object.hasOwn(VOICE_BY_ID, voiceId)) {
    return Response.json({ error: "不支持这个英语音色。" }, { status: 400 });
  }

  try {
    const audio = await synthesizeEnglishSpeech(text, voiceId, request.signal);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
        "X-Voice": voiceId,
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: "语音请求已取消。" }, { status: 499, headers: { "Cache-Control": "no-store" } });
    }
    console.error("English speech synthesis failed", error);
    return Response.json({ error: "英语语音暂时不可用，请稍后再试。" }, { status: 502 });
  }
}
