export type AuthoredRow = ["A" | "B", string, string];
export type Practice = {
  speaking: string;
  writing: string;
  listening: { question: string; answer: string };
  review: string;
};
export type AuthoredLesson = {
  week: number;
  day: number;
  weekTitle: string;
  title: string;
  scene: string;
  level: string;
  objective: string;
  grammar: string;
  sections: { title: string; rows: AuthoredRow[] }[];
  vocab: { en: string; zh: string; pos: string; collocation: string; example: number }[];
  practice: Practice;
};
export type VocabularyEntry = {
  id: string;
  en: string;
  zh: string;
  pos: string;
  collocation: string;
  example: string;
  exampleZh: string;
  lessonId: string;
  week: number;
  day: number;
};

export type CurriculumLine = {
  id: string;
  speaker: "A" | "B";
  en: string;
  zh: string;
  words: { text: string; start: number; end: number; meaning: string; note?: string }[];
  chunks?: string[];
};
export type CurriculumLesson = Omit<AuthoredLesson, "sections" | "vocab"> & {
  id: string;
  lines: CurriculumLine[];
  sections: { label: string; lines: CurriculumLine[] }[];
  vocabulary: VocabularyEntry[];
};
