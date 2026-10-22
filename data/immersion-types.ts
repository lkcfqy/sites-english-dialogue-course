export type Speaker = "A" | "B";
export type DialogueStatus = "listened" | "revisit" | "understood";
export type DialogueLine = { id: string; speaker: Speaker; en: string; zh: string };
export type AuthoredDialogue = {
  title: string;
  scene: string;
  roles: Record<Speaker, string>;
  intent: string;
  question: string;
  answer: string;
  challenge: string;
  rows: [Speaker, string, string][];
};
export type DialogueExtension = { week: number; day: number; dialogues: AuthoredDialogue[] };
export type ImmersionDialogue = Omit<AuthoredDialogue, "rows"> & { id: string; lines: DialogueLine[] };
export type CourseStage = {
  id: number; weeks: [number, number]; title: string; goal: string; checkpoint: string;
};
export type LessonOutline = {
  id: string; week: number; day: number; weekTitle: string; title: string; scene: string;
};
export type ImmersionLesson = LessonOutline & {
  objective: string; stage: CourseStage; dialogues: ImmersionDialogue[];
};
export type DialogueProgress = { dialogueId: string; status: DialogueStatus; updatedAt: string };
export type DialogueCheck = { week: number; day: number; question: string; answer: string };
export type CoreDialogueOverride = DialogueCheck & { rows: [Speaker, string, string][][] };
