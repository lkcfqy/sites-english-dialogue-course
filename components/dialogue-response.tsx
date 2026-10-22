"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const checks = ["我表达了自己的意思", "我补充了原因或具体细节", "我能换一种说法再解释"];

export function DialogueResponse({ dialogueId, onEdit }: { dialogueId: string; onEdit: () => void }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(`english-immersion-response-${dialogueId}`) || "null");
      if (stored && typeof stored === "object" && "text" in stored && typeof stored.text === "string") {
        const value = stored.text.slice(0, 3000);
        const flags = "checks" in stored && Array.isArray(stored.checks) ? stored.checks.filter((entry): entry is number => Number.isInteger(entry) && entry >= 0 && entry < checks.length) : [];
        queueMicrotask(() => { if (active) { setText(value); setSelected(flags); setNotice("已打开上次保存在这个浏览器的回应。"); } });
      }
    } catch { /* A new response remains available without storage. */ }
    return () => { active = false; };
  }, [dialogueId]);

  const save = () => {
    try {
      window.localStorage.setItem(`english-immersion-response-${dialogueId}`, JSON.stringify({ text, checks: selected, updatedAt: new Date().toISOString() }));
      setNotice("这次表达已保存在当前浏览器。下次可以换一种说法再试。");
    } catch { setNotice("浏览器暂时无法保存，请先复制自己的回应。"); }
  };

  const keepDraft = (value: string, flags: number[]) => {
    try {
      window.localStorage.setItem(`english-immersion-response-${dialogueId}`, JSON.stringify({ text: value, checks: flags, updatedAt: new Date().toISOString() }));
      setNotice("草稿已保存在当前浏览器。");
    } catch { setNotice("浏览器暂时无法保存，请先复制自己的回应。"); }
  };

  return <details className="response-notebook">
    <summary>留下自己的表达，再检查能否迁移</summary>
    <p>先不看台词，回应上面的情境。用你会的英语写下来，或把刚才说的话记下来；过几天再打开，试着换一种说法。开始书写时会暂停播放，草稿自动保存在当前浏览器。</p>
    <label htmlFor={`response-${dialogueId}`}>我的英语回应</label>
    <textarea id={`response-${dialogueId}`} lang="en" rows={5} maxLength={3000} value={text} placeholder="Start with what you want to say. Add a reason or an example." onFocus={onEdit} onChange={(event) => { setText(event.target.value); keepDraft(event.target.value, selected); }} />
    <div className="response-checks">{checks.map((label, index) => <label key={label}><input type="checkbox" checked={selected.includes(index)} onChange={(event) => { const flags = event.target.checked ? [...selected, index] : selected.filter((entry) => entry !== index); setSelected(flags); keepDraft(text, flags); }} />{label}</label>)}</div>
    <div className="response-save"><Button size="sm" onClick={save} disabled={!text.trim()}>保存这次表达</Button><span role="status">{notice || "这是自查记录；勾选项不计为能力评分。"}</span></div>
  </details>;
}
