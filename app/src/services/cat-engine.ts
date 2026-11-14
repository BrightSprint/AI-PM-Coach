/**
 * cat-engine.ts — 简化版 CAT（计算机自适应测评）引擎
 *
 * 纯 TypeScript 实现，无 UI / DOM / 网络 / LLM 依赖，可直接移植到
 * Windows 独立应用（Tauri / Electron）中运行。
 *
 * 运行时页面加载的是本文件的转译版：assets/cat-engine.js
 * （经典脚本，暴露全局 CatEngine；逻辑与本文件一一对应。）
 *
 * 算法口径（Suzuki 定版）：
 * - 每个维度维护「当前难度」（初始 3，范围 1–5）与「能力分」（初始 50）。
 * - 选维：按维度固定顺序轮询，跳过已答满 perDimensionCap（3）题的维度。
 * - 选题：在该维度内按当前难度档随机抽一道未用过的题；目标档无题时，
 *   按偏移 0, +1, -1, +2, -2, … 在 1–5 内找最近的有题难度档（兜底）。
 *   贡献与日志以题目真实难度 actualDifficulty 为准。
 * - 答题后：答对难度 +1（封顶 5），答错 / 跳过难度 −1（封底 1）。
 * - 贡献查表（用户区间落成的确定值，随难度单调）：
 *     答对：1→50, 2→60, 3→75, 4→90, 5→100
 *     答错：1→20, 2→30, 3→45, 4→50, 5→60
 * - 分数更新：新分 = 旧分 × 0.55 + 本题贡献 × 0.45（从该维第一题起套用）。
 * - 终止：总题数达到 totalQuestions（默认 18，本产品主测评传入 18）。
 * - 结果：维度分 = 各维 CAT 分取整；总分 = 六维 CAT 分平均取整。
 * - 全部决策与分数变化通过 console 以 [CAT] 前缀输出。
 */

export interface CatQuestion {
  id: number;
  src: string;
  dimension: string;
  difficulty: number; // 1–5，题目真实难度
  [key: string]: unknown;
}

export interface CatConfig {
  /** 维度名，按轮询固定顺序排列 */
  dimensions: string[];
  /** 题库（题目需含 dimension 与 difficulty） */
  bank: CatQuestion[];
  totalQuestions?: number;   // 默认 18
  perDimensionCap?: number;  // 默认 3
  initialDifficulty?: number; // 默认 3
  initialScore?: number;      // 默认 50
  /** 可注入的随机源（测试用），默认 Math.random */
  rng?: () => number;
  /** 复测避旧题：历史已答题 id 集合，抽题时优先未答过的题 */
  avoidIds?: Record<number, boolean>;
  /** scope='wrongfirst'：历史答错题 id 集合（应与 avoidIds 互斥） */
  wrongIds?: Record<number, boolean>;
  /** scope='wrongfirst' 时开启错题优先层 */
  wrongFirst?: boolean;
  /** 计划自动匹配：返回 >0 表示题目命中当前学习计划知识点，同层同难度内优先 */
  planMatchFn?: (q: CatQuestion) => number;
}

export interface DrawDecision {
  step: number;
  dimension: string;
  targetDifficulty: number;
  actualDifficulty: number;
  fallback: boolean;
  poolSize: number;
  reused: boolean;
  wrongPreferred: boolean;
  planMatch: boolean;
  questionId: number;
  src: string;
  question: CatQuestion;
}

export interface AnswerOutcome {
  step: number;
  dimension: string;
  correct: boolean;
  skipped: boolean;
  actualDifficulty: number;
  targetDifficulty: number;
  difficultyBefore: number;
  difficultyAfter: number;
  contribution: number;
  scoreBefore: number;
  scoreAfter: number;
}

export interface CatResult {
  dimScores: number[]; // 与 dimensions 同序，取整
  totalScore: number;  // 六维平均，取整
}

/** 贡献常量表：键为题目真实难度 1–5 */
export const CONTRIBUTION_CORRECT: Record<number, number> = { 1: 50, 2: 60, 3: 75, 4: 90, 5: 100 };
export const CONTRIBUTION_WRONG: Record<number, number> = { 1: 20, 2: 30, 3: 45, 4: 50, 5: 60 };

/** 难度兜底偏移顺序：0, +1, -1, +2, -2, +3, -3, +4, -4 */
const FALLBACK_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4];

interface DimState {
  name: string;
  currentDifficulty: number;
  score: number;
  answered: number;
}

export class CatSession {
  private dims: DimState[];
  private byDim: Map<string, CatQuestion[]>;
  private usedIds = new Set<number>();
  private cursor = 0; // 轮询指针
  private stepCount = 0;
  private pending: DrawDecision | null = null;
  private readonly totalQuestions: number;
  private readonly perDimensionCap: number;
  private readonly rng: () => number;
  private readonly avoidIds: Record<number, boolean>;
  private readonly wrongIds: Record<number, boolean>;
  private readonly wrongFirst: boolean;
  private readonly planMatchFn: ((q: CatQuestion) => number) | null;

  constructor(config: CatConfig) {
    this.totalQuestions = config.totalQuestions ?? 18;
    this.perDimensionCap = config.perDimensionCap ?? 3;
    this.rng = config.rng ?? Math.random;
    this.avoidIds = config.avoidIds ?? {};
    this.wrongIds = config.wrongIds ?? {};
    this.wrongFirst = !!config.wrongFirst;
    this.planMatchFn = config.planMatchFn ?? null;
    const initDiff = config.initialDifficulty ?? 3;
    const initScore = config.initialScore ?? 50;
    this.dims = config.dimensions.map((name) => ({
      name,
      currentDifficulty: initDiff,
      score: initScore,
      answered: 0,
    }));
    this.byDim = new Map();
    for (const q of config.bank) {
      const list = this.byDim.get(q.dimension) ?? [];
      list.push(q);
      this.byDim.set(q.dimension, list);
    }
  }

  /** 终止判断：总题数达到上限 */
  isFinished(): boolean {
    return this.stepCount >= this.totalQuestions || this.pending === null && !this.hasAnyAvailable();
  }

  get answeredCount(): number {
    return this.stepCount;
  }

  private hasAnyAvailable(): boolean {
    return this.dims.some(
      (d) => d.answered < this.perDimensionCap && this.unusedInDim(d.name).length > 0,
    );
  }

  private unusedInDim(dimension: string): CatQuestion[] {
    return (this.byDim.get(dimension) ?? []).filter((q) => !this.usedIds.has(q.id));
  }

  /**
   * 选下一题：轮询选维（固定顺序，跳过已答满的维度）→
   * 在该维度内按当前难度抽题，目标档无题时按偏移顺序兜底。
   * 无题可抽时返回 null。
   */
  nextQuestion(): DrawDecision | null {
    if (this.stepCount >= this.totalQuestions) return null;
    const n = this.dims.length;
    for (let scan = 0; scan < n; scan++) {
      const idx = (this.cursor + scan) % n;
      const dim = this.dims[idx];
      if (dim.answered >= this.perDimensionCap) continue;
      const unused = this.unusedInDim(dim.name);
      if (unused.length === 0) continue;

      const target = dim.currentDifficulty;
      const unseen = unused.filter((q) => !this.avoidIds[q.id]);
      /* 候选层：wrongFirst 时历史错题层在最前；其后未答题层；最后全部未用题。
         层内先目标难度再按偏移兜底；同层同难度候选内优先计划匹配题。 */
      const tiers: { list: CatQuestion[]; wrong: boolean }[] = [];
      if (this.wrongFirst) tiers.push({ list: unused.filter((q) => !!this.wrongIds[q.id]), wrong: true });
      tiers.push({ list: unseen, wrong: false });
      tiers.push({ list: unused, wrong: false });
      let chosen: CatQuestion | null = null;
      let poolSize = 0;
      let wrongPreferred = false;
      let planMatch = false;
      for (const tier of tiers) {
        if (chosen || !tier.list.length) continue;
        for (const off of FALLBACK_OFFSETS) {
          const lvl = target + off;
          if (lvl < 1 || lvl > 5) continue;
          const pool = tier.list.filter((q) => q.difficulty === lvl);
          if (pool.length > 0) {
            poolSize = pool.length;
            let pickPool = pool;
            if (this.planMatchFn) {
              const pm = pool.filter((q) => this.planMatchFn!(q) > 0);
              if (pm.length > 0) { pickPool = pm; planMatch = true; }
            }
            chosen = pickPool[Math.floor(this.rng() * pickPool.length)];
            wrongPreferred = tier.wrong;
            break;
          }
        }
      }
      if (!chosen) continue;

      this.usedIds.add(chosen.id);
      this.cursor = (idx + 1) % n;
      const decision: DrawDecision = {
        step: this.stepCount + 1,
        dimension: dim.name,
        targetDifficulty: target,
        actualDifficulty: chosen.difficulty,
        fallback: chosen.difficulty !== target,
        poolSize,
        reused: !!this.avoidIds[chosen.id] && !wrongPreferred,
        wrongPreferred,
        planMatch,
        questionId: chosen.id,
        src: chosen.src,
        question: chosen,
      };
      this.pending = decision;
      console.log('[CAT] 抽题决策', {
        step: decision.step,
        dimension: decision.dimension,
        targetDifficulty: decision.targetDifficulty,
        actualDifficulty: decision.actualDifficulty,
        fallback: decision.fallback,
        poolSize: decision.poolSize,
        reused: decision.reused,
        wrongPreferred: decision.wrongPreferred,
        planMatch: decision.planMatch,
        questionId: decision.questionId,
        src: decision.src,
      });
      return decision;
    }
    return null;
  }

  /**
   * 提交当前题答案并更新状态。跳过按答错处理（skipped=true, correct=false）。
   * 难度升降基准为该维当前难度（抽题时的 targetDifficulty）；
   * 贡献查表以题目真实难度 actualDifficulty 为准。
   */
  answerCurrent(correct: boolean, skipped = false): AnswerOutcome | null {
    if (!this.pending) return null;
    const decision = this.pending;
    this.pending = null;
    const dim = this.dims.find((d) => d.name === decision.dimension)!;
    const isCorrect = skipped ? false : correct;

    const difficultyBefore = dim.currentDifficulty;
    const difficultyAfter = Math.min(
      5,
      Math.max(1, difficultyBefore + (isCorrect ? 1 : -1)),
    );
    const contribution = (isCorrect ? CONTRIBUTION_CORRECT : CONTRIBUTION_WRONG)[
      decision.actualDifficulty
    ];
    const scoreBefore = dim.score;
    const scoreAfter = scoreBefore * 0.55 + contribution * 0.45;

    dim.currentDifficulty = difficultyAfter;
    dim.score = scoreAfter;
    dim.answered += 1;
    this.stepCount += 1;

    const outcome: AnswerOutcome = {
      step: decision.step,
      dimension: dim.name,
      correct: isCorrect,
      skipped,
      actualDifficulty: decision.actualDifficulty,
      targetDifficulty: decision.targetDifficulty,
      difficultyBefore,
      difficultyAfter,
      contribution,
      scoreBefore: Math.round(scoreBefore * 10) / 10,
      scoreAfter: Math.round(scoreAfter * 10) / 10,
    };
    console.log('[CAT] 答题更新', { ...outcome });
    return outcome;
  }

  /** 当前各维状态快照（难度 / 分数 / 已答题数） */
  getState(): DimState[] {
    return this.dims.map((d) => ({ ...d }));
  }

  /** 结算：维度分取整，总分 = 六维平均取整，并输出日志 */
  getResult(): CatResult {
    const dimScores = this.dims.map((d) => Math.round(d.score));
    const totalScore = Math.round(
      dimScores.reduce((a, b) => a + b, 0) / dimScores.length,
    );
    const byName: Record<string, number> = {};
    this.dims.forEach((d, i) => { byName[d.name] = dimScores[i]; });
    console.log('[CAT] 测评结束', { dimScores: byName, totalScore });
    return { dimScores, totalScore };
  }
}

/** 工厂函数：页面侧只需 createCatSession({...}) 即可开始一轮测评 */
export function createCatSession(config: CatConfig): CatSession {
  return new CatSession(config);
}
