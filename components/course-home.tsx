"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bookmark, BookOpen, Check, ChevronLeft, ChevronRight, Headphones, Mic, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogueResponse } from "@/components/dialogue-response";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEnglishPlayer, type PlaybackItem } from "@/hooks/use-english-player";
import { useDialogueProgress } from "@/hooks/use-dialogue-progress";
import type { CourseStage, DialogueLine, DialogueStatus, ImmersionLesson, LessonOutline, Speaker } from "@/data/immersion-types";

const speeds = ["0.7", "0.85", "1", "1.15", "1.3"];
const repeats = ["1", "2", "3", "5", "∞"];
type Mode = "listen" | "shadow" | "role";
type Captions = "en" | "zh" | "none";
type SavedSentence = DialogueLine & { lessonId: string; lessonTitle: string };
type Props = { initialLesson: ImmersionLesson; outline: LessonOutline[]; stages: CourseStage[]; stats: { weeks: number; lessons: number; dialogues: number; sentences: number } };
const voiceFor = (speaker: Speaker) => speaker === "A" ? "en-US-JennyNeural" : "en-US-GuyNeural";
const statusLabels: Record<DialogueStatus, string> = { listened: "听过了", revisit: "稍后复听", understood: "能独立理解" };
const playback = (line: DialogueLine): PlaybackItem => ({ id: line.id, text: line.en, speaker: line.speaker, voiceId: voiceFor(line.speaker) });

export function CourseHome({ initialLesson, outline, stages, stats }: Props) {
  const [lesson, setLesson] = useState(initialLesson);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("listen");
  const [captions, setCaptions] = useState<Captions>("en");
  const [role, setRole] = useState<Speaker>("A");
  const [speed, setSpeed] = useState("1");
  const [repeat, setRepeat] = useState("1");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<SavedSentence[]>([]);
  const [savedPage, setSavedPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const request = useRef<AbortController | null>(null);
  const requestedLesson = useRef(0);
  const session = useRef(0);
  const player = useEnglishPlayer();
  const { stop, play } = player;
  const { progress, ready, error, pending, mark, reload } = useDialogueProgress();
  const lessonIndex = outline.findIndex((entry) => entry.id === lesson.id);
  const dialogue = lesson.dialogues[sectionIndex] || lesson.dialogues[0];
  const heard = Object.values(progress).filter((entry) => entry.status !== "revisit").length;
  const review = Object.values(progress).filter((entry) => entry.status === "revisit");

  const stopSession = useCallback(() => {
    session.current += 1;
    request.current?.abort();
    stop();
  }, [stop]);

  const loadLesson = useCallback(async (index: number, scroll = true) => {
    if (!outline[index]) return null;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    requestedLesson.current = index;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/course/${outline[index].id}`, { signal: controller.signal });
      if (!response.ok) throw new Error("这节对话暂时无法打开，请重试。");
      const body = await response.json() as { lesson: ImmersionLesson };
      if (controller.signal.aborted) return null;
      if (body.lesson.id !== outline[index].id || !body.lesson.dialogues?.length) throw new Error("课程内容有误，请重新打开。");
      setLesson(body.lesson);
      setSectionIndex(0);
      setRevealed({});
      try { window.localStorage.setItem("english-dialogue-lesson", String(index)); } catch { /* Learning continues without storage. */ }
      if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
      return body.lesson;
    } catch (cause) {
      if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "课程暂时无法打开。");
      return null;
    } finally { if (request.current === controller) setLoading(false); }
  }, [outline]);

  useEffect(() => {
    let active = true;
    try {
      const savedIndex = Number(window.localStorage.getItem("english-dialogue-lesson"));
      const savedSpeed = window.localStorage.getItem("english-dialogue-speed");
      const savedRepeat = window.localStorage.getItem("english-dialogue-repeat");
      const sentences: unknown = JSON.parse(window.localStorage.getItem("english-immersion-sentences") || "[]");
      queueMicrotask(() => {
        if (!active) return;
        if (savedSpeed && speeds.includes(savedSpeed)) setSpeed(savedSpeed);
        if (savedRepeat && repeats.includes(savedRepeat)) setRepeat(savedRepeat);
        if (Array.isArray(sentences)) setSaved(sentences.filter((entry) => entry && typeof entry.id === "string" && typeof entry.en === "string" && typeof entry.zh === "string" && typeof entry.lessonId === "string" && typeof entry.lessonTitle === "string" && ["A", "B"].includes(entry.speaker)).slice(0, 200));
        if (Number.isInteger(savedIndex) && savedIndex > 0 && savedIndex < outline.length) void loadLesson(savedIndex, false);
      });
    } catch { /* Private browsing may disable preferences. */ }
    return () => { active = false; request.current?.abort(); session.current += 1; };
  }, [loadLesson, outline.length]);

  const changeLesson = (index: number) => { stopSession(); void loadLesson(index); };
  const changeSection = (index: number) => { stopSession(); setSectionIndex(index); setRevealed({}); };
  const toggleSaved = (line: DialogueLine) => {
    const next = saved.some((entry) => entry.id === line.id) ? saved.filter((entry) => entry.id !== line.id) : [{ ...line, lessonId: lesson.id, lessonTitle: lesson.title }, ...saved].slice(0, 200);
    setSaved(next);
    setSavedPage(0);
    try { window.localStorage.setItem("english-immersion-sentences", JSON.stringify(next)); } catch { /* This session's collection still works. */ }
  };
  const start = async (wholeLesson: boolean) => {
    stopSession();
    const run = session.current;
    let current = lesson;
    const startSection = sectionIndex;
    while (run === session.current) {
      const sections = wholeLesson ? current.dialogues : [current.dialogues[startSection]];
      const completed = await play(sections.flatMap((entry) => entry.lines.map(playback)), Number(speed), repeat === "∞" ? "∞" : Number(repeat), "sequence", {
        mode, role,
        onItem: (item) => {
          const section = current.dialogues.findIndex((entry) => item.id.startsWith(entry.id + "-"));
          if (run === session.current && section >= 0) setSectionIndex(section);
        },
      });
      if (!completed || run !== session.current || !wholeLesson || mode !== "listen") return;
      const nextIndex = outline.findIndex((entry) => entry.id === current.id) + 1;
      if (nextIndex >= outline.length) return;
      const next = await loadLesson(nextIndex, false);
      if (!next || run !== session.current) return;
      current = next;
    }
  };
  const playLine = (line: DialogueLine) => {
    stopSession();
    void play([playback(line)], Number(speed), repeat === "∞" ? "∞" : Number(repeat), "sequence", { mode: "listen" });
  };
  const revisit = () => {
    const next = review[0];
    if (!next) return;
    const index = outline.findIndex((entry) => entry.id === next.dialogueId.split("-s")[0]);
    stopSession();
    void loadLesson(index).then((loaded) => { if (loaded) setSectionIndex(Math.max(0, loaded.dialogues.findIndex((entry) => entry.id === next.dialogueId))); });
  };
  const activeLine = dialogue.lines.find((line) => line.id === player.activeId);

  return <div className="app-shell immersion-shell">
    <header className="site-header">
      <div className="brand-mark" aria-hidden="true">Aa</div>
      <div className="brand-copy"><strong>英语生活剧场</strong><span>在对话里听懂，在新情境里说出来</span></div>
      <div className="header-progress"><span>{stats.weeks} 周沉浸路线</span><strong>第 {lesson.week} 周</strong></div>
    </header>
    <div className="workspace">
      <aside className="course-nav" aria-label="半年学习路线">
        <div className="nav-heading"><BookOpen size={18} /><span>半年学习路线</span></div>
        <p className="nav-intro">从日常接话到深入讨论。每周 5 天新对话，另外 2 天重听与迁移。</p>
        <div className="week-list">{Array.from({ length: 26 }, (_, index) => index + 1).map((week) => {
          const first = outline.findIndex((entry) => entry.week === week);
          return <button key={week} className={`week-item${week === lesson.week ? " active" : ""}`} aria-current={week === lesson.week ? "step" : undefined} disabled={loading} onClick={() => changeLesson(first)}>
            <span className="week-number">{String(week).padStart(2, "0")}</span><span className="week-label">第 {week} 周<small>{outline[first]?.weekTitle}</small></span>{week === lesson.week && <span className="current-dot" />}
          </button>;
        })}</div>
      </aside>
      <main className="lesson-main" aria-busy={loading}>
        <div className="immersion-overview"><span><Headphones size={16} />{stats.dialogues} 段对话 · {stats.sentences.toLocaleString()} 句语境表达</span><span>{ready ? `已听 ${heard} 段` : "听懂 · 重听 · 自己说"}</span>{review.length > 0 && <button type="button" onClick={revisit}><RotateCcw size={14} />复听 {review.length} 段</button>}</div>
        <div className="lesson-topline"><span>第 {lesson.week} 周 · 第 {lesson.day} 天</span><span>本课 {lesson.dialogues.length} 段 · {lesson.dialogues.reduce((sum, entry) => sum + entry.lines.length, 0)} 句</span></div>
        <div className="lesson-title-row"><div><p className="eyebrow">DAY {String(lessonIndex + 1).padStart(3, "0")} · {lesson.stage.title}</p><h1>{lesson.title}</h1><p className="lesson-scene">{lesson.scene}</p></div><div className="lesson-art" aria-hidden="true"><span>A</span><span>B</span></div></div>
        <div className="lesson-objective"><strong>今天要表达的意思</strong><p>{lesson.objective}</p></div>
        <nav className="day-nav" aria-label="本周对话">{outline.filter((entry) => entry.week === lesson.week).map((entry) => <button key={entry.id} className={`day-item${entry.id === lesson.id ? " active" : ""}`} aria-current={entry.id === lesson.id ? "page" : undefined} disabled={loading} onClick={() => changeLesson(outline.findIndex((item) => item.id === entry.id))}>第 {entry.day} 天<span>{entry.title}</span></button>)}</nav>
        {loadError && <div className="progress-error" role="alert">{loadError}<Button variant="outline" size="sm" onClick={() => changeLesson(requestedLesson.current)}>重新打开</Button></div>}
        {loading && <p className="loading-course" role="status">正在打开下一段生活……</p>}
        <div className="immersion-modes" role="group" aria-label="学习方式">{([
          ["listen", "连续听", "跟着故事往下听", Headphones], ["shadow", "逐句跟读", "每句之后留时间开口", Volume2], ["role", "角色接话", "轮到你时先自己回答", Mic],
        ] as const).map(([value, title, subtitle, Icon]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { stopSession(); setMode(value); setRevealed({}); }}><Icon size={20} /><span><strong>{title}</strong><small>{subtitle}</small></span></button>)}</div>
        <nav className="dialogue-tabs" aria-label="本课对话">{lesson.dialogues.map((entry, index) => <button type="button" key={entry.id} aria-pressed={sectionIndex === index} onClick={() => changeSection(index)}><span>{String(index + 1).padStart(2, "0")} · {entry.title}</span><small>{entry.lines.length} 句{progress[entry.id] ? ` · ${statusLabels[progress[entry.id].status]}` : ""}</small></button>)}</nav>
        <section className="player-bar" aria-label="对话播放">
          <div className="player-identity"><div className="player-label"><Headphones size={20} /><span>{mode === "listen" ? "走进这段对话" : mode === "shadow" ? "听一句，跟着说一句" : `你来演角色 ${role}`}</span></div><div className="voice-legend"><span>A · Jenny</span><span>B · Guy</span></div></div>
          <div className="player-controls"><label>语速<Select value={speed} onValueChange={(value) => { stopSession(); setSpeed(value); try { window.localStorage.setItem("english-dialogue-speed", value); } catch {} }}><SelectTrigger className="control-select"><SelectValue /></SelectTrigger><SelectContent>{speeds.map((value) => <SelectItem key={value} value={value}>{value}×</SelectItem>)}</SelectContent></Select></label>
            <label>重复<Select value={repeat} onValueChange={(value) => { stopSession(); setRepeat(value); try { window.localStorage.setItem("english-dialogue-repeat", value); } catch {} }}><SelectTrigger className="control-select"><SelectValue /></SelectTrigger><SelectContent>{repeats.map((value) => <SelectItem key={value} value={value}>{value === "∞" ? "循环" : `${value} 次`}</SelectItem>)}</SelectContent></Select></label>
            <Button className="play-all" disabled={loading} onClick={() => void start(false)}><Play size={17} fill="currentColor" />播放本段</Button><Button className="play-all" disabled={loading} onClick={() => void start(true)}><ArrowRight size={17} />{mode === "listen" ? "连播本课及后续" : "练习本课"}</Button>
            {(player.playing || loading) && <Button className="stop-audio" variant="outline" onClick={stopSession}><Square size={15} />停止</Button>}
            {player.waiting && <Button className="continue-speaking" onClick={player.continuePlayback}>{mode === "role" ? "说好了，听参考" : "跟读好了，继续"}</Button>}
          </div><div className="audio-status" role="status">{player.status}</div>
        </section>
        <div className="caption-toolbar"><div className="caption-switch" role="group" aria-label="字幕方式">{([["en", "英文字幕"], ["zh", "中英字幕"], ["none", "纯听"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={captions === value} onClick={() => setCaptions(value)}>{label}</button>)}</div>{mode === "role" && <div className="role-switch" role="group" aria-label="选择你扮演的角色">{(["A", "B"] as const).map((speaker) => <button type="button" key={speaker} aria-pressed={role === speaker} onClick={() => { stopSession(); setRole(speaker); setRevealed({}); }}>我演 {speaker}</button>)}</div>}</div>
        <div className="dialogue-context"><span className="scene-label">这段发生了什么</span><h2>{dialogue.title}</h2><p>{dialogue.scene}</p><p className="dialogue-intent">{dialogue.intent}</p>{sectionIndex >= 3 && <div className="cast-labels"><span>A · {dialogue.roles.A}</span><span>B · {dialogue.roles.B}</span></div>}</div>
        {captions === "none" ? <section className="pure-listening" aria-label="纯听模式"><Headphones size={38} /><h3>{player.waiting ? "轮到你开口" : player.playing ? `正在听角色 ${activeLine?.speaker || "A"}` : "把注意力放在声音和意思上"}</h3><p>听听双方想做什么、哪里发生了变化。需要帮助时，随时打开字幕。</p><Button variant="outline" onClick={() => setCaptions("en")}>打开英文字幕</Button></section> : <section className="dialogue-list" aria-label="整句对话">{dialogue.lines.map((line, index) => {
          const hideRole = mode === "role" && line.speaker === role && !revealed[line.id];
          return <article key={line.id} className={`dialogue-line${player.activeId === line.id ? " active-line" : ""}`} aria-current={player.activeId === line.id ? "true" : undefined}>
            <div className={`speaker speaker-${line.speaker.toLowerCase()}`} aria-label={`角色 ${line.speaker}`}>{line.speaker}</div>
            <div className="line-body">{hideRole ? <div className="role-prompt"><span>轮到你：根据对方的话，用自己的方式回应。</span><button type="button" onClick={() => setRevealed((current) => ({ ...current, [line.id]: true }))}>看看参考表达</button></div> : <><p className="english-line" lang="en">{line.en}</p>{(captions === "zh" || revealed[line.id]) && <p className="chinese-line">{line.zh}</p>}{captions === "en" && <button className="sentence-meaning" type="button" aria-expanded={!!revealed[line.id]} onClick={() => setRevealed((current) => ({ ...current, [line.id]: !current[line.id] }))}>{revealed[line.id] ? "收起中文" : "看看整句意思"}</button>}</>}</div>
            <div className="sentence-actions"><Button variant="ghost" size="icon" className="line-play" aria-label={`重听第 ${index + 1} 句`} onClick={() => playLine(line)}><Volume2 size={18} /></Button><Button variant="ghost" size="icon" aria-label={`${saved.some((entry) => entry.id === line.id) ? "取消收藏" : "收藏"}第 ${index + 1} 句`} aria-pressed={saved.some((entry) => entry.id === line.id)} onClick={() => toggleSaved(line)}><Bookmark size={16} fill={saved.some((entry) => entry.id === line.id) ? "currentColor" : "none"} /></Button></div>
          </article>;
        })}</section>}
        <section className="conversation-check" aria-label="理解与自主表达"><div><span className="scene-label">先听懂意思</span><h3>{dialogue.question}</h3><details key={dialogue.id}><summary>听完再看参考理解</summary><p>{dialogue.answer}</p></details></div><div><span className="scene-label">现在换你来说</span><p>{dialogue.challenge}</p><small>可以直接开口，也可以用英语记下一段自己的回答。</small></div></section>
        <DialogueResponse key={dialogue.id} dialogueId={dialogue.id} onEdit={stopSession} />
        <section className="dialogue-progress" aria-label="记录对话进度"><span>{pending === dialogue.id ? "正在保存…" : progress[dialogue.id] ? `这段：${statusLabels[progress[dialogue.id].status]}` : "听完后，记下这段的状态"}</span><div>{(["listened", "revisit", "understood"] as const).map((value) => <Button key={value} size="sm" variant={progress[dialogue.id]?.status === value ? "default" : "outline"} disabled={!ready || !!pending} onClick={() => void mark(dialogue.id, value)}>{value === "revisit" ? <RotateCcw size={14} /> : <Check size={14} />}{statusLabels[value]}</Button>)}</div></section>
        {error && <div className="progress-error" role="alert">{error}{error.includes("登录") ? <a href="/signin-with-chatgpt?return_to=%2F" target="_top">登录保存</a> : <Button size="sm" variant="outline" onClick={() => void reload()}>重新读取</Button>}</div>}
        <details className="sentence-library"><summary><Bookmark size={17} />我的句子 · {saved.length}<span>保存在当前浏览器</span></summary>{!saved.length ? <p>收藏你想再次听见、想在生活中用出来的完整句子。</p> : <><div className="saved-sentences">{saved.slice(Math.min(savedPage, Math.max(0, Math.ceil(saved.length / 12) - 1)) * 12, (Math.min(savedPage, Math.max(0, Math.ceil(saved.length / 12) - 1)) + 1) * 12).map((line) => <article key={line.id}><p lang="en">{line.en}</p><p>{line.zh}</p><div><span>{line.lessonTitle}</span><Button variant="ghost" size="sm" onClick={() => playLine(line)}><Volume2 size={15} />重听</Button><Button variant="ghost" size="sm" onClick={() => toggleSaved(line)}>移出收藏</Button></div></article>)}</div>{saved.length > 12 && <div className="saved-navigation"><Button size="sm" variant="outline" disabled={savedPage === 0} onClick={() => setSavedPage(savedPage - 1)}>上一页</Button><span>每页 12 句</span><Button size="sm" variant="outline" disabled={(savedPage + 1) * 12 >= saved.length} onClick={() => setSavedPage(savedPage + 1)}>下一页</Button></div>}</>}</details>
        <details className="week-plan"><summary>半年怎样逐步深入</summary><p>以接近雅思 7.0 所描述的实际语言能力为方向：理解较复杂的交流，连贯展开意思，准确表达并灵活改述。建议每天安排 90–120 分钟，可分两次：重听熟悉内容，听新对话，跟读或接话，再把同样的意思用于自己的经历。每周 5 天新课，2 天复听、阅读和自主表达；按理解速度调整进度。</p><ol className="stage-roadmap">{stages.map((stage) => <li key={stage.id} className={stage.id === lesson.stage.id ? "current-stage" : ""}><strong>第 {stage.weeks[0]}–{stage.weeks[1]} 周 · {stage.title}</strong><p>{stage.goal}</p><span>能力检查：{stage.checkpoint}</span></li>)}</ol><p className="ability-note">路线完成与能力达成分别记录。每周挑一个没练过的新情境，看看能否独立听懂、解释和回应；进阶取决于实际练习与反馈。</p></details>
        <div className="lesson-footer"><div className="lesson-hint">听懂一件事，跟着说，再换个情境自己回应。</div><div className="lesson-switch"><Button variant="outline" disabled={loading || lessonIndex === 0} onClick={() => changeLesson(lessonIndex - 1)}><ChevronLeft size={17} />上一天</Button><Button disabled={loading || lessonIndex >= outline.length - 1} onClick={() => changeLesson(lessonIndex + 1)}>下一天<ChevronRight size={17} /></Button></div></div>
      </main>
    </div>
  </div>;
}
