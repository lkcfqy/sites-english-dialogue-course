"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogueProgress, DialogueStatus } from "@/data/immersion-types";

const statuses = new Set(["listened", "revisit", "understood"]);
export function useDialogueProgress() {
  const [progress, setProgress] = useState<Record<string, DialogueProgress>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const readVersion = useRef(0);
  const writeVersion = useRef(0);
  const requests = useRef(new Set<AbortController>());

  const reload = useCallback(async () => {
    if (busy.current) return;
    const version = ++readVersion.current;
    const writes = writeVersion.current;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const response = await fetch("/api/progress", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "登录后可把对话进度保存到账号。" : "学习记录暂时无法读取，请重试。");
      const body = await response.json() as { progress?: DialogueProgress[] };
      if (!Array.isArray(body.progress) || body.progress.some((entry) => !entry || typeof entry.dialogueId !== "string" || !statuses.has(entry.status) || typeof entry.updatedAt !== "string")) throw new Error("学习记录格式有误，请重新读取。");
      if (!mounted.current || controller.signal.aborted || version !== readVersion.current || writes !== writeVersion.current) return;
      setProgress(Object.fromEntries(body.progress.map((entry) => [entry.dialogueId, entry])));
      setReady(true);
      setError("");
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && version === readVersion.current && writes === writeVersion.current) setError(cause instanceof Error ? cause.message : "学习记录暂时无法读取。");
    } finally { requests.current.delete(controller); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => { if (active) void reload(); });
    const controllers = requests.current;
    return () => { active = false; mounted.current = false; controllers.forEach((controller) => controller.abort()); };
  }, [reload]);

  const mark = async (dialogueId: string, status: DialogueStatus) => {
    if (!ready || busy.current) return false;
    busy.current = true;
    writeVersion.current += 1;
    setPending(dialogueId);
    setError("");
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const response = await fetch("/api/progress", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogueId, status }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请重新登录后保存。" : "没有保存成功，请重试。");
      const body = await response.json() as { progress: DialogueProgress };
      if (!body.progress || body.progress.dialogueId !== dialogueId || body.progress.status !== status || typeof body.progress.updatedAt !== "string") throw new Error("保存结果有误，请重新读取学习记录。");
      if (mounted.current && !controller.signal.aborted) setProgress((current) => ({ ...current, [dialogueId]: body.progress }));
      return true;
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "没有保存成功。");
      return false;
    } finally {
      writeVersion.current += 1;
      requests.current.delete(controller);
      busy.current = false;
      if (mounted.current) setPending(null);
    }
  };
  return { progress, ready, error, pending, mark, reload };
}
