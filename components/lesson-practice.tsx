import { Headphones, Mic, PenLine, Target } from "lucide-react";
import type { Practice } from "@/data/curriculum-types";

export function LessonPractice({ practice, grammar }: { practice: Practice; grammar: string }) {
  return <section className="practice-workspace" aria-label="应用练习">
    <div className="practice-intro"><h2>从听懂，到独立表达</h2><p>完成对话和词汇后，离开原句，表达自己的意思。</p></div>
    <div className="language-focus"><strong>本课语言重点</strong><p>{grammar}</p></div>
    <div className="practice-grid">
      <article><Headphones size={22} /><h3>听出关键信息</h3><p>{practice.listening.question}</p><details><summary>核对参考答案</summary><p>{practice.listening.answer}</p></details></article>
      <article><Mic size={22} /><h3>开口表达</h3><p>{practice.speaking}</p></article>
      <article><PenLine size={22} /><h3>写下来</h3><p>{practice.writing}</p></article>
      <article><Target size={22} /><h3>检查掌握程度</h3><p>{practice.review}</p></article>
    </div>
    <p className="practice-note">可用手机录音或笔记完成任务。先独立作答，再对照本课用法；这里的练习不提供自动雅思评分。</p>
  </section>;
}
