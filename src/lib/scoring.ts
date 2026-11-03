/**
 * ============================================================================
 *  积分计算 & 学员排名 - 业务规则
 * ============================================================================
 *
 *  饮食积分 (dietScore):
 *    - 按日聚合，每日所有餐次（早餐/午餐/晚餐/加餐）的 dietitianScore 求和
 *    - 每日上限 6 分: min(Σ餐分, 6)
 *    - dietitianScore 取值: 2(较好) / 1(尚可) / 0(偏离计划) / null(未批注=0分)
 *    - 营养师控分：未批注的记录不计积分（0分），须营养师点评后才计分
 *    - 总分 = 各日积分之和
 *
 *  运动积分 (exerciseScore):
 *    - 每条运动记录: duration >= 40 分钟记 1 分（基础分）
 *    - 教练评分直接加分: coachScore=2 再 +2 分，coachScore=1 再 +1 分
 *    - 总分 = Σ 各条记录积分
 *
 *  总积分 (totalScore):
 *    dietScore + exerciseScore
 *
 *  排名规则:
 *    按 totalScore 降序，同分同名次（dense ranking，非跳跃式）
 * ============================================================================
 */
import type { DietRecord, ExerciseRecord, ManualScoreRecord } from '../types';

/**
 * 计算饮食积分
 *
 * 公式:
 *   1. 按 date (yyyy-MM-dd) 分组，每日 Σ dietitianScore
 *   2. 每日积分 = min(Σ, 6)（封顶 6 分）
 *   3. 未批注记录(dietitianScore=null/undefined)计 0 分，须营养师点评后才计分
 *   4. 总分 = Σ 各日积分
 *
 * @param records 当前学员的饮食记录
 * @returns 饮食总分
 */
export function calculateDietScore(records: DietRecord[]): number {
  const dailyScores: Record<string, number> = {};

  records.forEach(record => {
    const score = record.dietitianScore != null ? record.dietitianScore : 0;
    const day = record.date.substring(0, 10);
    dailyScores[day] = (dailyScores[day] || 0) + score;
  });

  let totalScore = 0;
  for (const date in dailyScores) {
    totalScore += Math.min(dailyScores[date], 6);
  }

  return totalScore;
}

/**
 * 计算运动积分
 *
 * 公式:
 *   1. 每条记录 duration >= 40 分钟 -> 基础 1 分
 *   2. 教练评分直接加分: coachScore=2 再 +2 分，coachScore=1 再 +1 分
 *
 * 每天最多 5 次运动打卡，每次有效运动（≥40min）均可计分。
 *
 * @param records 当前学员的运动记录
 * @returns 运动总分
 */
export function calculateExerciseScore(records: ExerciseRecord[]): number {
  let totalScore = 0;
  records.forEach(record => {
    if (record.duration >= 40) {
      totalScore += 1;
    }
    // 教练评分直接作为加分
    if (record.coachScore === 2) {
      totalScore += 2;
    } else if (record.coachScore === 1) {
      totalScore += 1;
    }
  });
  return totalScore;
}

/**
 * 计算手动加减分总和
 *
 * @param records 手动加减分记录（已按学员过滤）
 * @returns 手动积分（正数=加分，负数=减分）
 */
export function calculateManualScore(records: ManualScoreRecord[]): number {
  return records.reduce((sum, r) => sum + r.points, 0);
}

/**
 * 计算总积分 = 饮食积分 + 运动积分 + 手动积分
 */
export function calculateTotalScore(
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  manualScoreRecords?: ManualScoreRecord[]
): number {
  const manual = manualScoreRecords ? calculateManualScore(manualScoreRecords) : 0;
  // 总分不得为负（扣分再多也不显示负数）
  const total = calculateDietScore(dietRecords) + calculateExerciseScore(exerciseRecords) + manual;
  return Math.max(0, total);
}

export interface StudentScoreData {
  studentId: string;
  name: string;
  dietScore: number;
  exerciseScore: number;
  manualScore: number;
  totalScore: number;
}

export interface RankedStudent extends StudentScoreData {
  rank: number;
  /** 进步榜：本周积分 */
  thisWeek?: number;
  /** 进步榜：上周积分 */
  lastWeek?: number;
  /** 进步榜：本周增长量 */
  growth?: number;
}

/**
 * 学员排名计算
 *
 * 算法:
 *   1. 对每个学员计算 dietScore + exerciseScore = totalScore
 *   2. 按 totalScore 降序排序
 *   3. 同分同名次（dense ranking: 1,1,2,3... 而非 1,1,3,4...）
 *
 * @param students       学员列表
 * @param dietRecords    全部饮食记录（按 studentId 过滤）
 * @param exerciseRecords 全部运动记录（按 studentId 过滤）
 * @returns RankedStudent[] - 按 rank 升序
 */
export function rankStudents(
  students: { id: string, name: string }[],
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  manualScoreRecords?: ManualScoreRecord[]
): RankedStudent[] {
  const scoreDataList: StudentScoreData[] = students.map(student => {
    const studentDiet = dietRecords.filter(r => r.studentId === student.id);
    const studentExercise = exerciseRecords.filter(r => r.studentId === student.id);
    const studentManual = manualScoreRecords ? manualScoreRecords.filter(r => r.studentId === student.id) : [];
    const dietScore = calculateDietScore(studentDiet);
    const exerciseScore = calculateExerciseScore(studentExercise);
    const manualScore = calculateManualScore(studentManual);
    return {
      studentId: student.id,
      name: student.name,
      dietScore,
      exerciseScore,
      manualScore,
      totalScore: Math.max(0, dietScore + exerciseScore + manualScore)
    };
  });

  scoreDataList.sort((a, b) => b.totalScore - a.totalScore);

  const rankedStudents: RankedStudent[] = [];
  let currentRank = 1;

  for (let i = 0; i < scoreDataList.length; i++) {
    if (i > 0 && scoreDataList[i].totalScore < scoreDataList[i - 1].totalScore) {
      currentRank++;
    }
    rankedStudents.push({
      ...scoreDataList[i],
      rank: currentRank
    });
  }

  return rankedStudents;
}

/**
 * 本周（自然周，周一至周日）排名
 *
 * 仅用于"周榜"展示切换：计分规则与总榜完全一致，
 * 只是把记录过滤到本周之后再调用同一套积分函数。
 */
export function rankStudentsThisWeek(
  students: { id: string, name: string }[],
  dietRecords: DietRecord[],
  exerciseRecords: ExerciseRecord[],
  manualScoreRecords?: ManualScoreRecord[]
): RankedStudent[] {
  const { mondayStr, sundayStr } = getCurrentWeekRange();
  const weekDiet = dietRecords.filter(r => {
    const d = r.date.substring(0, 10);
    return d >= mondayStr && d <= sundayStr;
  });
  const weekExercise = exerciseRecords.filter(r => {
    const d = r.date.substring(0, 10);
    return d >= mondayStr && d <= sundayStr;
  });
  const weekManual = manualScoreRecords ? manualScoreRecords.filter(r => {
    const d = r.date;
    return d >= mondayStr && d <= sundayStr;
  }) : [];
  return rankStudents(students, weekDiet, weekExercise, weekManual);
}

/**
 * 获取当前自然周的周一~周日日期范围
 * @returns { mondayStr, sundayStr } 格式 yyyy-MM-dd
 */
export function getCurrentWeekRange(): { mondayStr: string; sundayStr: string } {
  const now = new Date();
  const day = now.getDay(); // 0=周日
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { mondayStr: fmt(monday), sundayStr: fmt(sunday) };
}
