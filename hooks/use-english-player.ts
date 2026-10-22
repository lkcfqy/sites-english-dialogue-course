"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_BY_ID } from "@/lib/english-voices";

export type PlaybackItem = { id: string; text: string; voiceId: string; speaker?: "A" | "B" };
export type PlaybackOptions = {
  mode?: "listen" | "shadow" | "role";
  role?: "A" | "B";
  onItem?: (item: PlaybackItem) => void;
};

export function useEnglishPlayer() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState("美音 · 就绪");
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolveCurrent = useRef<(() => void) | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runId = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, string>());

  const continuePlayback = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = null;
    resolveCurrent.current?.();
    resolveCurrent.current = null;
    setWaiting(false);
  }, []);
  const stop = useCallback(() => {
    runId.current += 1;
    requestRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
    }
    audioRef.current = null;
    continuePlayback();
    setActiveId(null);
    setPlaying(false);
    setStatus("美音 · 已停止");
  }, [continuePlayback]);

  useEffect(() => () => {
    runId.current += 1;
    requestRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
    }
    if (delayRef.current) clearTimeout(delayRef.current);
    resolveCurrent.current?.();
    cache.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const getAudio = useCallback(async (text: string, voiceId: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    const cacheKey = `${voiceId}\0${text}`;
    const cached = cache.current.get(cacheKey);
    if (cached) return cached;
    const response = await fetch("/api/speech", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }), signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "语音请求失败，请稍后重试。");
    }
    const blob = await response.blob();
    signal.throwIfAborted();
    if (!blob.size) throw new Error("没有收到音频，请稍后重试。");
    const url = URL.createObjectURL(blob);
    cache.current.set(cacheKey, url);
    if (cache.current.size > 150) {
      const oldest = cache.current.keys().next().value;
      if (oldest) { URL.revokeObjectURL(cache.current.get(oldest)!); cache.current.delete(oldest); }
    }
    return url;
  }, []);

  const play = useCallback(async (items: PlaybackItem[], speed: number, repeat: number | "∞", order: "sequence" | "item" = "sequence", options: PlaybackOptions = {}): Promise<boolean> => {
    stop();
    if (!items.length) return false;
    const thisRun = runId.current;
    const controller = new AbortController();
    requestRef.current = controller;
    const rounds = repeat === "∞" ? Infinity : repeat;
    const queue = order === "item" && repeat !== "∞" ? items.flatMap((item) => Array.from({ length: repeat }, () => item)) : items;
    const passes = order === "item" && repeat !== "∞" ? 1 : rounds;
    const pauseForSpeech = async (item: PlaybackItem, role: boolean) => {
      setActiveId(item.id);
      setWaiting(true);
      setStatus(role ? `轮到你演角色 ${item.speaker} · 先自己说，再听参考表达` : "轮到你跟读 · 尝试保留原句的节奏");
      const words = item.text.trim().split(/\s+/).length;
      await new Promise<void>((resolve) => {
        resolveCurrent.current = resolve;
        delayRef.current = setTimeout(resolve, Math.min(25000, Math.max(3000, words * 550 / speed)));
      });
      if (thisRun !== runId.current) return;
      if (delayRef.current) clearTimeout(delayRef.current);
      delayRef.current = null;
      if (thisRun === runId.current) { resolveCurrent.current = null; setWaiting(false); }
    };
    setPlaying(true);
    try {
      for (let pass = 0; pass < passes; pass += 1) {
        for (const [index, item] of queue.entries()) {
          if (thisRun !== runId.current) return false;
          options.onItem?.(item);
          if (options.mode === "role" && item.speaker === options.role) {
            await pauseForSpeech(item, true);
            if (thisRun !== runId.current) return false;
          }
          const voiceName = VOICE_BY_ID[item.voiceId]?.name || "英语";
          setStatus(`正在准备 ${voiceName} 音频…`);
          const timeout = setTimeout(() => controller.abort(), 25000);
          let url: string;
          try { url = await getAudio(item.text, item.voiceId, controller.signal); }
          finally { clearTimeout(timeout); }
          if (thisRun !== runId.current) return false;
          const audio = new Audio(url);
          audio.playbackRate = speed;
          audioRef.current = audio;
          setActiveId(item.id);
          const repetition = order === "item" && repeat !== "∞" ? index % repeat + 1 : pass + 1;
          setStatus(`${voiceName} · ${options.mode === "role" && item.speaker === options.role ? "参考表达" : "正在播放"}${repeat === "∞" ? "（循环）" : `（第 ${repetition} 次）`}`);
          await new Promise<void>((resolve, reject) => {
            resolveCurrent.current = resolve;
            audio.onended = () => resolve();
            audio.onerror = () => {
              if (thisRun !== runId.current) return;
              cache.current.delete(`${item.voiceId}\0${item.text}`);
              URL.revokeObjectURL(url);
              reject(new Error("音频播放失败，请重试。"));
            };
            audio.play().catch(reject);
          });
          if (thisRun !== runId.current) return false;
          resolveCurrent.current = null;
          audioRef.current = null;
          if (options.mode === "shadow") {
            await pauseForSpeech(item, false);
            if (thisRun !== runId.current) return false;
          }
        }
      }
      if (thisRun !== runId.current) return false;
      setStatus("美音 · 播放完成");
      setActiveId(null);
      setPlaying(false);
      return true;
    } catch (error) {
      if (thisRun === runId.current) {
        setStatus(controller.signal.aborted ? "语音请求超时，请重试。" : error instanceof Error ? error.message : "英语语音暂时不可用。");
        setActiveId(null);
        setWaiting(false);
        setPlaying(false);
      }
      return false;
    }
  }, [stop, getAudio]);
  return { activeId, status, playing, waiting, play, stop, continuePlayback };
}
