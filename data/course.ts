import authored from "./curriculum.json";
import type { AuthoredLesson, CurriculumLesson, CurriculumLine } from "./curriculum-types";
import { buildCourse } from "./course-builder";

export type Speaker = "A" | "B";
export type Line = CurriculumLine;
export type Word = CurriculumLine["words"][number];
export type Lesson = CurriculumLesson;
export const lessons = buildCourse(authored as AuthoredLesson[]);
export const vocabulary = lessons.flatMap((lesson) => lesson.vocabulary);
