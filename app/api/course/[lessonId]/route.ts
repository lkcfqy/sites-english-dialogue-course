import { immersionLessons } from "@/data/immersion";

export async function GET(_request: Request, context: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await context.params;
  const lesson = immersionLessons.find((entry) => entry.id === lessonId);
  if (!lesson) return Response.json({ error: "没有找到这节对话课程。" }, { status: 404 });
  return Response.json({ lesson }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
}
