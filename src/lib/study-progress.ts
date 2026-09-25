import { localDate, studyStreak, addDays } from "@/lib/study-stats";

export interface ProgressSummary {
  streakCount: number;
  averageAccuracy: number;
  completedSessions: number;
  questionsAnswered: number;
  correctAnswers: number;
  dailyActivity: { date: string; sessionCount: number; questionCount: number }[];
  weakPacks: {
    packId: string;
    title: string;
    averageScore: number;
    attemptsCount: number;
  }[];
}

export interface SessionRow {
  id: string;
  pack_id: string;
  score: number;
  correct_count: number;
  question_count: number;
  completed_at: string;
}

export interface PackRow {
  id: string;
  title: string;
}

export function computeProgressSummary(
  sessions: SessionRow[],
  packs: PackRow[] = []
): ProgressSummary {
  const packMap = new Map(packs.map((p) => [p.id, p.title]));

  // Convert sessions for streak calculation
  const attemptsForStreak = sessions.map((s) => ({
    completedAt: s.completed_at,
  }));
  const streakCount = studyStreak(attemptsForStreak);

  const completedSessions = sessions.length;
  const questionsAnswered = sessions.reduce((sum, s) => sum + s.question_count, 0);
  const correctAnswers = sessions.reduce((sum, s) => sum + s.correct_count, 0);

  const averageAccuracy = completedSessions
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / completedSessions)
    : 0;

  // 7-day daily activity
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const dailyActivity = days.map((d) => {
    const dateStr = localDate(d);
    const daySessions = sessions.filter(
      (s) => localDate(new Date(s.completed_at)) === dateStr
    );
    return {
      date: dateStr,
      sessionCount: daySessions.length,
      questionCount: daySessions.reduce((sum, s) => sum + s.question_count, 0),
    };
  });

  // Weak packs: group by pack_id and identify packs with averageScore < 70%
  const packStats = new Map<string, { totalScore: number; count: number }>();
  for (const s of sessions) {
    if (!s.pack_id) continue;
    const current = packStats.get(s.pack_id) || { totalScore: 0, count: 0 };
    current.totalScore += s.score;
    current.count += 1;
    packStats.set(s.pack_id, current);
  }

  const weakPacks: ProgressSummary["weakPacks"] = [];
  for (const [packId, stats] of packStats.entries()) {
    const avgScore = Math.round(stats.totalScore / stats.count);
    if (avgScore < 70) {
      weakPacks.push({
        packId,
        title: packMap.get(packId) || "StudyPack",
        averageScore: avgScore,
        attemptsCount: stats.count,
      });
    }
  }

  // Sort weak packs by average score ascending (lowest score first)
  weakPacks.sort((a, b) => a.averageScore - b.averageScore);

  return {
    streakCount,
    averageAccuracy,
    completedSessions,
    questionsAnswered,
    correctAnswers,
    dailyActivity,
    weakPacks,
  };
}
