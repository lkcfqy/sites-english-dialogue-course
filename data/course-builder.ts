import type { AuthoredLesson, CurriculumLesson, CurriculumLine } from "./curriculum-types";
import glossary from "./course-glossary.json";
import { wordMeanings } from "./word-meanings";
import { extraWordMeanings } from "./word-meanings-extra";
import { topicWordMeanings } from "./word-meanings-topics";

const dictionary: Record<string, string> = {
  ...wordMeanings, ...extraWordMeanings, ...topicWordMeanings, ...glossary.entries,
  "she'll": "she will 的缩写；她将会",
  inspectable: "可供检查的；可核验的",
  underrepresent: "使……的代表性不足；未充分反映",
  caregiving: "照护；照料工作",
  nonwork: "非工作的；工作以外的",
  repurposed: "改作他用的；重新利用的",
};
for (const word of "a an the i you he she it we they am is are was were be been being my your his her our their me him us them do does did can could will would should may might must this that these those if and or but as at by for from in of on to with".split(" ")) {
  const cue = wordMeanings[word] || extraWordMeanings[word] || topicWordMeanings[word];
  if (cue) dictionary[word] = cue;
}
const tokenPattern = /[A-Za-z]+(?:['’][A-Za-z]+)?|[0-9]+(?:\.[0-9]+)?/g;

function makeChunks(en: string, words: CurriculumLine["words"]) {
  if (words.length < 12) return undefined;
  const punctuation = [...en.matchAll(/[,;:]/g)].find((match) => match.index > en.length * .25 && match.index < en.length * .75);
  const split = punctuation ? punctuation.index + 1 : words[Math.ceil(words.length / 2)].start;
  return [en.slice(0, split).trim(), en.slice(split).trim()];
}

function meaningFor(word: string) {
  if (/^\d/.test(word)) return `数字 ${word}`;
  const normalized = word.toLowerCase().replace("’", "'");
  if (dictionary[normalized]) return dictionary[normalized];
  if (normalized.endsWith("'s") && dictionary[normalized.slice(0, -2)]) return dictionary[normalized.slice(0, -2)] + "（此处为所有格或缩写，结合句意）";
  return "暂未收录；请参照句子译文";
}

function vocabularyId(en: string, zh: string) {
  // Keep different senses separate when the same word returns in a later lesson.
  let hash = 2166136261;
  for (const character of zh.trim()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${en.toLowerCase().trim().replaceAll("’", "'")}/${(hash >>> 0).toString(16)}`;
}

/** Each section is authored separately: no shared dialogue frames or slot replacement. */
export function buildCourse(authored: AuthoredLesson[]): CurriculumLesson[] {
  return authored.map((source) => {
    const id = `w${String(source.week).padStart(2, "0")}d${source.day}`;
    let position = 0;
    const sections = source.sections.map((section) => ({
      label: section.title,
      lines: section.rows.map(([speaker, en, zh]): CurriculumLine => {
        const lineId = `${id}-${++position}`;
        const words = [...en.matchAll(tokenPattern)].map((match) => {
          const text = match[0];
          const key = text.toLowerCase().replace("’", "'");
          const exact = source.vocab.find((entry) => entry.en.toLowerCase() === key);
          const phrase = source.vocab.find((entry) => {
            if (!/[ -]/.test(entry.en)) return false;
            const start = en.toLowerCase().indexOf(entry.en.toLowerCase());
            return start >= 0 && match.index >= start && match.index + text.length <= start + entry.en.length;
          });
          return { text, start: match.index, end: match.index + text.length,
            meaning: exact?.zh || meaningFor(text),
            note: phrase ? `${phrase.en}＝${phrase.zh}` : undefined };
        });
        return { id: lineId, speaker, en, zh, words, chunks: makeChunks(en, words) };
      }),
    }));
    const lines = sections.flatMap((section) => section.lines);
    const vocabulary = source.vocab.map((entry) => ({
      id: vocabularyId(entry.en, entry.zh), en: entry.en, zh: entry.zh, pos: entry.pos,
      collocation: entry.collocation, example: lines[entry.example]?.en || "",
      exampleZh: lines[entry.example]?.zh || "", lessonId: id, week: source.week, day: source.day,
    }));
    return { ...source, id, sections, lines, vocabulary };
  });
}
