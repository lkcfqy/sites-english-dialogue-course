import early from "../data/immersion-dialogues-early.json";
import late from "../data/immersion-dialogues-late.json";
import earlyChecks from "../data/immersion-checks-early.json";
import lateChecks from "../data/immersion-checks-late.json";
import rewrittenCore from "../data/immersion-core-late.json";
import { courseStats, immersionLessons, stages } from "../data/immersion";
import type { DialogueExtension } from "../data/immersion-types";

const errors: string[] = [];
const assert = (condition: unknown, message: string) => { if (!condition) errors.push(message); };
const normalize = (text: string) => text.toLowerCase().replaceAll("’", "'").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
const lessons = new Set<string>();
const dialogues = new Set<string>();
const lines = new Set<string>();
const sentences = new Set<string>();
const authoredContent = new Map<string, string>();
const extensions = [...early, ...late] as DialogueExtension[];
const extensionKeys = new Set<string>();
const examPattern = /雅思|IELTS|\bPart\s*[123]\b|\bTask\s*(?:[12]|One|Two)\b|考生|口语模拟|题目字数|字数限制|无效答案|至少\s*(?:150|250)\s*词/i;
const checks = [...earlyChecks, ...lateChecks, ...rewrittenCore];
const checkKeys = new Set<string>();
assert(checks.length === 130, `Expected 130 standalone listening checks, received ${checks.length}`);
assert(rewrittenCore.length === 12, `Expected 12 rewritten core lessons, received ${rewrittenCore.length}`);
for (const entry of checks) {
  const key = `${entry.week}-${entry.day}`;
  assert(!checkKeys.has(key), `Duplicate first-dialogue check: ${key}`);
  checkKeys.add(key);
  assert(entry.question && entry.answer, `Incomplete first-dialogue check: ${key}`);
}
for (const entry of rewrittenCore) assert(entry.rows.map((rows) => rows.length).join(",") === "8,4,4", `Wrong rewritten core shape: ${entry.week}-${entry.day}`);

assert(immersionLessons.length === 130, `Expected 130 lessons, received ${immersionLessons.length}`);
assert(courseStats.dialogues === 650, `Expected 650 dialogues, received ${courseStats.dialogues}`);
assert(extensions.length === 130, `Expected 130 authored extension sets, received ${extensions.length}`);
for (const entry of extensions) {
  const key = `${entry.week}-${entry.day}`;
  assert(!extensionKeys.has(key), `Duplicate extension set: ${key}`);
  extensionKeys.add(key);
  assert(entry.week >= 1 && entry.week <= 26 && entry.day >= 1 && entry.day <= 5, `Invalid extension key: ${key}`);
  assert(entry.dialogues.length === 2, `Expected two authored dialogues: ${key}`);
  for (const [index, dialogue] of entry.dialogues.entries()) {
    assert(dialogue.rows.length >= 8 && dialogue.rows.length <= 12, `Authored dialogue must have 8–12 turns: ${key}/${index + 1}`);
    assert(dialogue.roles.A && dialogue.roles.B, `Missing roles: ${key}/${index + 1}`);
    const content = dialogue.rows.map(([, en]) => normalize(en)).join("|");
    assert(!authoredContent.has(content), `Repeated entire authored dialogue: ${key}/${index + 1} / ${authoredContent.get(content)}`);
    authoredContent.set(content, `${key}/${index + 1}`);
  }
}
for (const [index, lesson] of immersionLessons.entries()) {
  assert(lesson.week === Math.floor(index / 5) + 1 && lesson.day === index % 5 + 1, `Broken lesson sequence: ${lesson.id}`);
  assert(!lessons.has(lesson.id), `Duplicate lesson ID: ${lesson.id}`);
  lessons.add(lesson.id);
  assert(lesson.dialogues.length === 5, `Expected 5 dialogue segments: ${lesson.id}`);
  assert(checkKeys.has(`${lesson.week}-${lesson.day}`), `Missing standalone listening check: ${lesson.id}`);
  assert(lesson.stage.weeks[0] <= lesson.week && lesson.stage.weeks[1] >= lesson.week, `Stage mismatch: ${lesson.id}`);
  assert(lesson.title && lesson.scene && lesson.objective && lesson.weekTitle, `Missing lesson context: ${lesson.id}`);
  assert(!examPattern.test([lesson.title, lesson.scene, lesson.objective, lesson.weekTitle].join(" ")), `Exam framing remains in context: ${lesson.id}`);
  for (const [section, dialogue] of lesson.dialogues.entries()) {
    assert(dialogue.id === `${lesson.id}-s${section + 1}` && /^w(?:0[1-9]|1[0-9]|2[0-6])d[1-5]-s[1-5]$/.test(dialogue.id), `Invalid progress ID: ${dialogue.id}`);
    assert(!dialogues.has(dialogue.id), `Duplicate dialogue ID: ${dialogue.id}`);
    dialogues.add(dialogue.id);
    assert(dialogue.lines.length >= 4, `Incomplete dialogue: ${dialogue.id}`);
    assert(dialogue.title && dialogue.scene && dialogue.intent && dialogue.question && dialogue.answer && dialogue.challenge, `Missing understanding/expression prompt: ${dialogue.id}`);
    assert(!examPattern.test([dialogue.title, dialogue.scene, dialogue.intent, dialogue.question, dialogue.answer, dialogue.challenge].join(" ")), `Exam framing remains in prompt: ${dialogue.id}`);
    assert(new Set(dialogue.lines.map((line) => line.speaker)).size === 2, `Dialogue must include both speakers: ${dialogue.id}`);
    for (const [row, line] of dialogue.lines.entries()) {
      assert(line.id === `${dialogue.id}-${row + 1}` && !lines.has(line.id), `Duplicate/invalid sentence ID: ${line.id}`);
      lines.add(line.id);
      assert(["A", "B"].includes(line.speaker), `Unknown speaker: ${line.id}`);
      assert(/[a-z]/i.test(line.en) && /[\u4e00-\u9fff]/.test(line.zh), `Missing bilingual sentence: ${line.id}`);
      assert(line.en.length <= 300, `Sentence exceeds speech input limit: ${line.id}`);
      assert(!/\{\{|\}\}|TODO|待补|待编写/.test(line.en + line.zh), `Unfinished content: ${line.id}`);
      assert(!examPattern.test(line.en + line.zh), `Exam framing remains in sentence: ${line.id}`);
      sentences.add(normalize(line.en));
    }
  }
}
const stageMeans = stages.map((stage) => {
  const selected = immersionLessons.filter((lesson) => lesson.stage.id === stage.id).flatMap((lesson) => lesson.dialogues.flatMap((dialogue) => dialogue.lines));
  return {
    weeks: stage.weeks.join("–"), sentences: selected.length,
    meanWords: +(selected.reduce((sum, line) => sum + line.en.trim().split(/\s+/).length, 0) / selected.length).toFixed(1),
  };
});
console.log(JSON.stringify({ ...courseStats, distinctSentences: sentences.size, authoredExtensionDialogues: authoredContent.size, standaloneListeningChecks: checks.length, rewrittenCoreLessons: rewrittenCore.length, stageMeans, errors: errors.length }, null, 2));
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
