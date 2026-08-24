import type {
  DailyLesson,
  LessonBriefRecord,
  LessonExecutionEvent,
  WeeklyPlan,
} from './types';

export interface PlanningRepository {
  createWeeklyPlan(plan: WeeklyPlan, lessons: DailyLesson[]): Promise<void>;
  getWeeklyPlan(planId: string): Promise<WeeklyPlan | undefined>;
  findWeeklyPlan(studentId: string, weekStart: string): Promise<WeeklyPlan | undefined>;
  listWeeklyPlansForStudent(studentId: string): Promise<WeeklyPlan[]>;

  getDailyLesson(lessonId: string): Promise<DailyLesson | undefined>;
  listDailyLessonsForPlan(planId: string): Promise<DailyLesson[]>;

  appendExecutionEvent(event: LessonExecutionEvent): Promise<void>;
  listExecutionEvents(lessonId: string): Promise<LessonExecutionEvent[]>;

  appendLessonBrief(record: LessonBriefRecord): Promise<void>;
  listLessonBriefs(lessonId: string): Promise<LessonBriefRecord[]>;
}
