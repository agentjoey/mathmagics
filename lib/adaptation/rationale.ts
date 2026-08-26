import type { EffectiveLesson } from './effective-lesson';
import type { AdaptiveDecision, AdaptiveRationaleCode } from './types';
import type { LessonIntent } from '@/lib/planning';

export interface ParentAdaptiveRationale {
  code: AdaptiveRationaleCode;
  title: string;
  explanation: string;
}

export interface NextLessonView {
  lessonId: string;
  intent: LessonIntent;
  objectiveIds: string[];
  adapted: boolean;
  originalLessonId?: string;
  rationale: ParentAdaptiveRationale[];
  targetMistakeId?: string;
}

export const ADAPTIVE_RATIONALE_TEXT: Record<AdaptiveRationaleCode, { title: string; explanation: string }> = {
  BLOCKING_MISTAKE: {
    title: '需要先解决一个关键错误',
    explanation: '这个尚未解决的问题可能影响接下来的学习。',
  },
  RECURRENT_MISTAKE: {
    title: '同类错误再次出现',
    explanation: '这个问题之前已经处理过，但最近再次出现，因此需要优先巩固。',
  },
  PREREQUISITE_GAP: {
    title: '先补齐前置知识',
    explanation: '接下来的内容依赖一个尚未稳固的前置目标。',
  },
  URGENT_REVIEW: {
    title: '需要及时复习',
    explanation: '近期表现显示这个已学目标出现明显不稳定。',
  },
  REVIEW_DUE: {
    title: '到了复习时间',
    explanation: '已有掌握证据，但后续表现提示需要再次巩固。',
  },
  PERFORMANCE_STRUGGLING: {
    title: '近期练习需要支持',
    explanation: '最近的独立作答表现暂时不稳定，需要更多有针对性的练习。',
  },
  STRATEGY_DEVELOPMENT_NEEDED: {
    title: '继续练习解题策略',
    explanation: '已经观察到这项策略的使用，但还需要在更多情境中独立应用。',
  },
  CURRENT_OBJECTIVE_NOT_MASTERED: {
    title: '继续当前学习目标',
    explanation: '当前目标还没有达到稳定掌握，继续学习或练习最合适。',
  },
  NEXT_OBJECTIVE_READY: {
    title: '可以进入下一个目标',
    explanation: '当前进度和前置知识支持继续向前学习。',
  },
  STARVATION_GUARD_FORWARD_PROGRESS: {
    title: '恢复向前学习',
    explanation: '已经连续安排了补救或复习，本节在没有关键阻塞时恢复正常进度。',
  },
  NO_HIGHER_PRIORITY_NEED: {
    title: '保持原计划',
    explanation: '当前没有更高优先级的学习事实需要改变这节课。',
  },
  SOURCE_LESSON_ALREADY_STARTED: {
    title: '保持已开始的课程',
    explanation: '课程已经开始，本轮不会在中途替换学习目标。',
  },
  REPLACEMENT_LESSON_IMMUTABLE: {
    title: '保持已调整的课程',
    explanation: '这节课已经由一次受控调整产生，不会再次形成替换链。',
  },
};

export function toParentNextLessonView(input: {
  effectiveLesson: EffectiveLesson;
  decision?: AdaptiveDecision;
}): NextLessonView {
  const { effectiveLesson, decision } = input;
  const lesson = effectiveLesson.lesson;
  return {
    lessonId: lesson.id,
    intent: lesson.intent,
    objectiveIds: [...lesson.objectiveIds],
    adapted: effectiveLesson.adapted,
    ...(effectiveLesson.adapted ? { originalLessonId: effectiveLesson.originalLessonId } : {}),
    rationale: (decision?.rationaleCodes ?? []).map((code) => ({ code, ...ADAPTIVE_RATIONALE_TEXT[code] })),
    ...(decision?.targetMistakeId ? { targetMistakeId: decision.targetMistakeId } : {}),
  };
}
