import { CourseHome } from "@/components/course-home";
import { courseStats, immersionLessons, outline, stages } from "@/data/immersion";

export default function Home() {
  return <CourseHome initialLesson={immersionLessons[0]} outline={outline} stages={stages} stats={courseStats} />;
}
