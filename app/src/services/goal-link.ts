/**
 * goal-link.ts — 「当前目标」共享逻辑（学习计划 ⇄ 测评设置 双向自动匹配）
 *
 * 纯 TypeScript 实现，无 UI / DOM / 存储 / 网络 / LLM 依赖，可直接移植到
 * Windows 独立应用中运行。运行时页面加载的是本文件的转译版：
 * assets/goal-link.js（经典脚本，暴露全局 GoalLink；逻辑与本文件一一对应）。
 *
 * 数据形状（Suzuki 定版）：
 * - 学习计划 plan（存入既有键 aipm.learn.v1 的 plan 字段，不新建键）：
 *     { mode:'all'|'weakest'|'custom', dims:[], pointIds:[], pinnedFirst:[] }
 * - 测评设置 quizcfg（新键 aipm.quizcfg.v1）：
 *     { count:12|18|24（默认 18）, dims:[六维子集，默认全选],
 *       startDiff:'adaptive'|'basic'|'advanced',
 *       scope:'unseen'|'wrongfirst'|'all' }
 *
 * 双向匹配：
 * - 计划 → 测评：quizCfgFromPlan 换算一键预设；CAT 抽题用 makePlanMatcher
 *   在同维同难度同层候选内优先计划知识点题（引擎侧 planMatch 标记）。
 * - 测评 → 计划：suggestionsFromAttempt 由最近一次 attempt 的错题映射出
 *   不在计划内的知识点，供一键加入 / 置顶。
 */

export interface LearnPlan {
  mode: 'all' | 'weakest' | 'custom';
  dims: string[];
  pointIds: number[];
  pinnedFirst: number[];
}

export interface QuizCfg {
  count: 12 | 18 | 24;
  dims: string[];
  startDiff: 'adaptive' | 'basic' | 'advanced';
  scope: 'unseen' | 'wrongfirst' | 'all';
  /* 批次 6：「只学最弱维」待生效状态（无测评记录时预选、首次完整测评后自动生效）。
     旧数据无此二字段，规整时默认 false / null，向后兼容。 */
  weakestPending?: boolean;
  weakestNotice?: { dim: string; score: number | null } | null;
}

/** 知识点下标按维度（= 阶段）分组，与 diagnosis 的 POINTS_BY_DIM 一致 */
export const POINTS_BY_DIM: number[][] = [
  [0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22],
  [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26],
];
export const QUIZ_COUNTS = [12, 18, 24];
export const START_DIFF_MAP = { adaptive: 3, basic: 2, advanced: 4 } as const;
const SCOPES = ['unseen', 'wrongfirst', 'all'];

function uniqNums(arr: number[] | undefined): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  /* 批次 8（G-07 衍生加固）：非数组入参按空数组处理，不抛错 */
  (Array.isArray(arr) ? arr : []).forEach((x) => { if (typeof x === 'number' && !seen.has(x)) { seen.add(x); out.push(x); } });
  return out;
}

export function defaultPlan(dimNames: string[], totalPoints: number): LearnPlan {
  const ids: number[] = [];
  for (let i = 0; i < totalPoints; i++) ids.push(i);
  return { mode: 'all', dims: dimNames.slice(), pointIds: ids, pinnedFirst: [] };
}

/** pointStages[i] = 知识点 i 的阶段（维度）下标 */
export function normalizePlan(raw: unknown, dimNames: string[], pointStages: number[]): LearnPlan {
  const total = pointStages.length;
  if (!raw || typeof raw !== 'object') return defaultPlan(dimNames, total);
  const r = raw as Partial<LearnPlan>;
  const mode = r.mode === 'weakest' || r.mode === 'custom' ? r.mode : 'all';
  if (mode === 'all') return defaultPlan(dimNames, total);
  const pointIds = uniqNums(r.pointIds).filter((i) => i >= 0 && i < total);
  const dimSet = new Set<number>();
  pointIds.forEach((pi) => dimSet.add(pointStages[pi]));
  const dims = dimNames.filter((_, di) => dimSet.has(di));
  const pinnedFirst = uniqNums(r.pinnedFirst).filter((i) => pointIds.includes(i));
  return { mode, dims, pointIds, pinnedFirst };
}

export function planFromWeakest(
  dimScores: number[] | null, dimNames: string[], pointStages: number[],
): (LearnPlan & { weakestIndex: number }) | null {
  if (!dimScores || !dimScores.length) return null;
  let wi = 0;
  dimScores.forEach((v, i) => { if (typeof v === 'number' && v < dimScores[wi]) wi = i; });
  const pointIds: number[] = [];
  pointStages.forEach((s, pi) => { if (s === wi) pointIds.push(pi); });
  return { mode: 'weakest', dims: [dimNames[wi]], pointIds, pinnedFirst: [], weakestIndex: wi };
}

export function orderedPlanPoints(plan: LearnPlan): number[] {
  const rest = plan.pointIds.filter((i) => !plan.pinnedFirst.includes(i));
  rest.sort((a, b) => a - b);
  return plan.pinnedFirst.slice().concat(rest);
}

/** 计划 → 测评一键预设：count = max(12, 维度数×3) 且 ≤24，并落到 12/18/24 合法档（向上取档保每维 ≥3） */
export function quizCfgFromPlan(plan: LearnPlan): QuizCfg {
  const dims = (plan.dims ?? []).slice();
  let count = Math.max(12, Math.min(24, dims.length * 3));
  if (!QUIZ_COUNTS.includes(count)) {
    for (const c of QUIZ_COUNTS) { if (c >= count) { count = c; break; } }
  }
  return { count: count as QuizCfg['count'], dims, startDiff: 'adaptive', scope: 'unseen' };
}

export function normalizeQuizCfg(raw: unknown, dimNames: string[]): QuizCfg {
  const cfg: QuizCfg = { count: 18, dims: dimNames.slice(), startDiff: 'adaptive', scope: 'unseen' };
  if (!raw || typeof raw !== 'object') return cfg;
  const r = raw as Partial<QuizCfg>;
  if (QUIZ_COUNTS.includes(r.count as number)) cfg.count = r.count as QuizCfg['count'];
  if (Array.isArray(r.dims) && r.dims.length) {
    const picked = dimNames.filter((n) => r.dims!.includes(n));
    if (picked.length) cfg.dims = picked;
  }
  if (r.startDiff && START_DIFF_MAP[r.startDiff] != null) cfg.startDiff = r.startDiff;
  if (r.scope && SCOPES.includes(r.scope)) cfg.scope = r.scope;
  /* 批次 6 字段：类型不合法一律回落默认，不因坏字段丢弃其余设置 */
  cfg.weakestPending = r.weakestPending === true;
  cfg.weakestNotice =
    r.weakestNotice && typeof r.weakestNotice === 'object' && typeof r.weakestNotice.dim === 'string' && dimNames.includes(r.weakestNotice.dim)
      ? { dim: r.weakestNotice.dim, score: typeof r.weakestNotice.score === 'number' ? r.weakestNotice.score : null }
      : null;
  return cfg;
}

export function startDifficulty(cfg: QuizCfg): number {
  return START_DIFF_MAP[cfg.startDiff] || 3;
}

export function perDimRange(cfg: QuizCfg): { min: number; max: number; cap: number } {
  const n = Math.max(1, cfg.dims.length);
  return { min: Math.floor(cfg.count / n), max: Math.ceil(cfg.count / n), cap: Math.ceil(cfg.count / n) };
}

export interface BankQuestionLike {
  id: number;
  dimension: string;
  difficulty: number;
  sub_topic?: string;
  exam_points?: string[];
  difficulty_points?: string[];
  stem?: string;
}

function questionText(q: BankQuestionLike): string {
  /* 批次 8（一-4）统一口径：匹配文本含 difficulty_points（与 JS 版同组成）。 */
  return `${q.sub_topic ?? ''} ${(q.exam_points ?? []).join(' ')} ${(q.difficulty_points ?? []).join(' ')} ${q.stem ?? ''}`.toLowerCase();
}

/** 题目 → 知识点：与 diagnosis.js 的 matchPointIndex 同口径（最长关键词优先） */
export function matchQuestionPoint(q: BankQuestionLike, dimIndex: number, pointKeywords: string[][]): number {
  const candidates = POINTS_BY_DIM[dimIndex] ?? [];
  if (!q || !candidates.length) return candidates.length ? candidates[0] : -1;
  const text = questionText(q);
  let bestIdx = candidates[0];
  let bestLen = 0;
  candidates.forEach((pi) => {
    (pointKeywords[pi] ?? []).forEach((kw) => {
      const k = String(kw).toLowerCase();
      if (k.length > bestLen && text.includes(k)) { bestLen = k.length; bestIdx = pi; }
    });
  });
  return bestIdx;
}

export interface AttemptRecordLike {
  questionId: number;
  correct: boolean;
  [key: string]: unknown;
}

/** 测评 → 计划建议：错题映射到、不在计划内的知识点（按错题数降序） */
export function suggestionsFromAttempt(
  records: AttemptRecordLike[],
  bankById: Record<number, BankQuestionLike>,
  dimIndexOf: (dimName: string) => number,
  pointKeywords: string[][],
  planPointIds: number[],
): { addPoints: { pointIndex: number; wrongCount: number }[] } {
  const inPlan = new Set(planPointIds ?? []);
  const wrongByPoint = new Map<number, number>();
  (records ?? []).forEach((r) => {
    if (r.correct) return;
    const q = bankById[r.questionId];
    if (!q) return;
    const di = dimIndexOf(q.dimension);
    if (di == null || di < 0) return;
    const pi = matchQuestionPoint(q, di, pointKeywords);
    if (pi >= 0 && !inPlan.has(pi)) wrongByPoint.set(pi, (wrongByPoint.get(pi) ?? 0) + 1);
  });
  const addPoints = Array.from(wrongByPoint.entries())
    .map(([pointIndex, wrongCount]) => ({ pointIndex, wrongCount }))
    .sort((a, b) => b.wrongCount - a.wrongCount || a.pointIndex - b.pointIndex);
  return { addPoints };
}

/** 快照资格：只有六维全选且题量 ≥10 的 attempt 才生成快照 / 参与复测对比 */
export function isSnapshotEligible(isFullDims: boolean, answered: number): boolean {
  return !!isFullDims && typeof answered === 'number' && answered >= 10;
}

/** 练习题相关度：子考点命中优先，其次命中关键词个数与总长度；同相关度内难度升序 */
export interface Relevance { subHit: boolean; hits: number; len: number }

export function relevanceOf(q: BankQuestionLike, kws: string[]): Relevance {
  const sub = (q.sub_topic ?? '').toLowerCase();
  const text = `${q.sub_topic ?? ''} ${(q.exam_points ?? []).join(' ')} ${(q.difficulty_points ?? []).join(' ')} ${q.stem ?? ''}`.toLowerCase();
  let hits = 0;
  let len = 0;
  let subHit = false;
  (kws ?? []).forEach((kw) => {
    const k = String(kw).toLowerCase();
    if (text.includes(k)) { hits++; len += k.length; if (sub.includes(k)) subHit = true; }
  });
  return { subHit, hits, len };
}

export function rankPracticeQuestions<T extends BankQuestionLike>(bank: T[], dimName: string, kws: string[]): T[] {
  const matched: { q: T; rel: Relevance }[] = [];
  (bank ?? []).forEach((q) => {
    if (q.dimension !== dimName) return;
    const rel = relevanceOf(q, kws);
    if (rel.hits > 0) matched.push({ q, rel });
  });
  matched.sort((a, b) => {
    if (a.rel.subHit !== b.rel.subHit) return a.rel.subHit ? -1 : 1;
    if (a.rel.hits !== b.rel.hits) return b.rel.hits - a.rel.hits;
    if (a.rel.len !== b.rel.len) return b.rel.len - a.rel.len;
    if (a.q.difficulty !== b.q.difficulty) return a.q.difficulty - b.q.difficulty;
    return a.q.id - b.q.id;
  });
  return matched.map((m) => m.q);
}

/** CAT 计划优先匹配器：题目映射到的知识点在计划内返回 1 */
export function makePlanMatcher(
  plan: LearnPlan,
  dimIndexOf: (dimName: string) => number,
  pointKeywords: string[][],
): (q: BankQuestionLike) => number {
  const inPlan = new Set(plan.pointIds ?? []);
  return (q) => {
    const di = dimIndexOf(q.dimension);
    if (di == null || di < 0) return 0;
    const pi = matchQuestionPoint(q, di, pointKeywords);
    return inPlan.has(pi) ? 1 : 0;
  };
}
