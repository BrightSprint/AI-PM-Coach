/*
 * review-link.ts — 批次 3 纯逻辑：错题本推导 / 阶段小测抽题 / 间隔复习队列
 * 运行时加载的是同逻辑的经典脚本版 assets/review-link.js（全局 ReviewLink）。
 * 纯函数、无 DOM / 无存储 / 无网络 / 无 LLM：页面负责读写 localStorage 与渲染。
 *
 * 数据形状（Suzuki 定版）：
 * - 错题本状态 aipm.wrongbook.v1：{ mastered:{qid:ISO时间}, redo:{qid:{lastAt,lastCorrect}} }
 *   错题条目不落盘：每次打开都从 aipm.attempts.v1 实时推导（deriveWrongBook）。
 * - 阶段小测状态 aipm.stagequiz.v1：{ stageIdx:{plays,best,lastScore,passedAt,lastAt,seen:[qid]} }
 *   seen 为该阶段已出过的题（「优先未出现过的题」所需，规格字段之外的唯一扩展）。
 * - 复习队列 aipm.review.v1：{ qid:{stage,due:'YYYY-MM-DD',lastResult,source} }
 *   间隔阶梯：stage 0 → +1 天，之后 +3 / +7 / +14 / +30，stage 4 封顶仍 +30；日期按用户本地日期。
 */

export const POINTS_BY_DIM: number[][] = [
  [0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22],
  [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26]
];
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
export const STAGE_QUIZ_COUNT = 5;
export const STAGE_QUIZ_PASS = 3;

/* ---------- 本地日期工具 ---------- */
function pad2(n: number): string { return (n < 10 ? '0' : '') + n; }
export function localDateStr(d: Date = new Date()): string {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
export function todayStr(now?: Date): string { return localDateStr(now || new Date()); }
export function addDaysStr(dateStr: string, n: number): string {
  const p = String(dateStr).split('-');
  const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/* ---------- 题目 → 知识点映射（与 goal-link 同口径：最长关键词优先） ---------- */
interface BankQuestion { id: number; dimension: string; difficulty: number; stem: string; sub_topic?: string; exam_points?: string[]; }
function questionText(q: BankQuestion): string {
  return ((q.sub_topic || '') + ' ' + (q.exam_points || []).join(' ') + ' ' + (q.stem || '')).toLowerCase();
}
export function matchPointDetailed(q: BankQuestion, dimIndex: number, pointKeywords: string[][]): { pointIndex: number; bestLen: number } {
  const candidates = POINTS_BY_DIM[dimIndex] || [];
  const fallback = candidates.length ? candidates[0] : -1;
  if (!q || !candidates.length) return { pointIndex: fallback, bestLen: 0 };
  const text = questionText(q);
  let bestIdx = fallback, bestLen = 0;
  candidates.forEach((pi) => {
    (pointKeywords[pi] || []).forEach((kw) => {
      const k = String(kw).toLowerCase();
      if (k.length > bestLen && text.indexOf(k) >= 0) { bestLen = k.length; bestIdx = pi; }
    });
  });
  return { pointIndex: bestIdx, bestLen };
}

/* ================= 一、错题本 ================= */
export interface AttemptRecord {
  questionId?: number; dimension: string; difficulty?: number;
  userAnswer?: string | null; correct: boolean; skipped?: boolean; selectedAnalysis?: string | null;
}
export interface WrongEntry {
  questionId: number; dimension: string; difficulty: number; wrongCount: number;
  lastUserAnswer: string | null; lastSkipped: boolean; lastSelectedAnalysis: string | null; lastOrder: number;
}
export function deriveWrongBook(attempts: { records?: AttemptRecord[] }[]): WrongEntry[] {
  const byId: Record<number, WrongEntry> = {};
  let order = 0;
  (attempts || []).forEach((a) => {
    (a.records || []).forEach((r) => {
      order++;
      if (!r || r.correct || r.questionId == null) return;
      let e = byId[r.questionId];
      if (!e) {
        e = byId[r.questionId] = {
          questionId: r.questionId, dimension: r.dimension, difficulty: r.difficulty || 3,
          wrongCount: 0, lastUserAnswer: null, lastSkipped: false, lastSelectedAnalysis: null, lastOrder: 0
        };
      }
      e.wrongCount++;
      e.dimension = r.dimension;
      e.difficulty = r.difficulty || e.difficulty;
      e.lastUserAnswer = r.userAnswer || null;
      e.lastSkipped = !!r.skipped;
      e.lastSelectedAnalysis = r.selectedAnalysis || null;
      e.lastOrder = order;
    });
  });
  return Object.keys(byId).map((k) => byId[Number(k)]).sort((a, b) => b.lastOrder - a.lastOrder);
}

export function filterWrongEntries(entries: WrongEntry[], dimName: string | null): WrongEntry[] {
  if (!dimName || dimName === '全部') return (entries || []).slice();
  return (entries || []).filter((e) => e.dimension === dimName);
}

export interface WrongbookState {
  mastered: Record<string, string>;
  redo: Record<string, { lastAt: string | null; lastCorrect: boolean }>;
}
export function normalizeWrongbook(raw: any): WrongbookState {
  const wb: WrongbookState = { mastered: {}, redo: {} };
  if (!raw || typeof raw !== 'object') return wb;
  if (raw.mastered && typeof raw.mastered === 'object') {
    Object.keys(raw.mastered).forEach((k) => { if (typeof raw.mastered[k] === 'string') wb.mastered[k] = raw.mastered[k]; });
  }
  if (raw.redo && typeof raw.redo === 'object') {
    Object.keys(raw.redo).forEach((k) => {
      const v = raw.redo[k];
      if (v && typeof v === 'object') wb.redo[k] = { lastAt: v.lastAt || null, lastCorrect: !!v.lastCorrect };
    });
  }
  return wb;
}

export function wrongStats(entries: WrongEntry[], wrongbook: any) {
  const wb = normalizeWrongbook(wrongbook);
  let mastered = 0;
  const byDim: Record<string, { total: number; pending: number; mastered: number }> = {};
  (entries || []).forEach((e) => {
    const isM = !!wb.mastered[e.questionId];
    if (isM) mastered++;
    if (!byDim[e.dimension]) byDim[e.dimension] = { total: 0, pending: 0, mastered: 0 };
    byDim[e.dimension].total++;
    if (isM) byDim[e.dimension].mastered++; else byDim[e.dimension].pending++;
  });
  return { total: (entries || []).length, mastered, pending: (entries || []).length - mastered, byDim };
}

/* 重做流转：答对记 mastered（ISO 时间）；答错保持待巩固。只写 wrongbook，不回写 attempts。 */
export function applyRedo(wrongbook: any, qid: number, correct: boolean, isoTime: string): WrongbookState {
  const wb = normalizeWrongbook(wrongbook);
  if (correct) { wb.mastered[qid] = isoTime; } else { delete wb.mastered[qid]; }
  wb.redo[qid] = { lastAt: isoTime, lastCorrect: !!correct };
  return wb;
}

/* ================= 二、阶段小测 ================= */
export function stagePool(bank: BankQuestion[], stageIdx: number, dimNames: string[], pointKeywords: string[][]): BankQuestion[] {
  const dimName = dimNames[stageIdx];
  return (bank || []).filter((q) => q.dimension === dimName && matchPointDetailed(q, stageIdx, pointKeywords).bestLen > 0);
}

export function pickStageQuestions(pool: BankQuestion[], seenIds: number[], count: number = STAGE_QUIZ_COUNT) {
  const seen: Record<number, boolean> = {};
  (seenIds || []).forEach((id) => { seen[id] = true; });
  const byDiff = (a: BankQuestion, b: BankQuestion) => (a.difficulty - b.difficulty) || (a.id - b.id);
  const unseen = (pool || []).filter((q) => !seen[q.id]).sort(byDiff);
  const seenPool = (pool || []).filter((q) => seen[q.id]).sort(byDiff);
  let picked = unseen.slice(0, count);
  let fromSeen = 0;
  if (picked.length < count) {
    const extra = seenPool.slice(0, count - picked.length);
    fromSeen = extra.length;
    picked = picked.concat(extra);
  }
  picked.sort(byDiff);
  return { questions: picked, poolSize: (pool || []).length, fromSeen };
}

export function stageQuizPassed(score: number, total: number): boolean {
  return score >= Math.min(STAGE_QUIZ_PASS, total || STAGE_QUIZ_COUNT);
}

export interface StageQuizRecord {
  plays: number; best: number; lastScore: number | null;
  passedAt: string | null; lastAt: string | null; seen: number[];
}
export function normalizeStageQuiz(raw: any): Record<string, StageQuizRecord> {
  const out: Record<string, StageQuizRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach((k) => {
    const v = raw[k];
    if (!v || typeof v !== 'object') return;
    out[k] = {
      plays: v.plays || 0, best: v.best || 0,
      lastScore: v.lastScore == null ? null : v.lastScore,
      passedAt: v.passedAt || null, lastAt: v.lastAt || null,
      seen: Array.isArray(v.seen) ? v.seen.slice() : []
    };
  });
  return out;
}

export function applyStageQuizResult(all: any, stageIdx: number, score: number, total: number, qids: number[], isoTime: string) {
  const out = normalizeStageQuiz(all);
  const prev: StageQuizRecord = out[stageIdx] || { plays: 0, best: 0, lastScore: null, passedAt: null, lastAt: null, seen: [] };
  const seenSet: Record<number, boolean> = {};
  prev.seen.forEach((id) => { seenSet[id] = true; });
  (qids || []).forEach((id) => { seenSet[id] = true; });
  out[stageIdx] = {
    plays: prev.plays + 1,
    best: Math.max(prev.best, score),
    lastScore: score,
    passedAt: prev.passedAt || (stageQuizPassed(score, total) ? isoTime : null),
    lastAt: isoTime,
    seen: Object.keys(seenSet).map((x) => parseInt(x, 10)).sort((a, b) => a - b)
  };
  return out;
}

/* ================= 三、复习队列 ================= */
export interface ReviewEntry { stage: number; due: string; lastResult: string | null; source: string; }
export function normalizeReview(raw: any): Record<string, ReviewEntry> {
  const out: Record<string, ReviewEntry> = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).forEach((k) => {
    const v = raw[k];
    if (!v || typeof v !== 'object' || typeof v.due !== 'string') return;
    const stage = (typeof v.stage === 'number' && v.stage >= 0 && v.stage < REVIEW_INTERVALS.length) ? Math.floor(v.stage) : 0;
    out[k] = { stage, due: v.due, lastResult: v.lastResult || null, source: v.source || 'attempt' };
  });
  return out;
}

export function seedReview(review: any, qid: number, source: string, today: string) {
  const out = normalizeReview(review);
  if (out[qid]) return { review: out, added: false };
  out[qid] = { stage: 0, due: addDaysStr(today, REVIEW_INTERVALS[0]), lastResult: null, source: source || 'attempt' };
  return { review: out, added: true };
}

export function mergeSeeds(review: any, seeds: { qid: number; source: string }[], today: string) {
  const out = normalizeReview(review);
  let added = 0;
  (seeds || []).forEach((s) => {
    if (!s || s.qid == null || out[s.qid]) return;
    out[s.qid] = { stage: 0, due: addDaysStr(today, REVIEW_INTERVALS[0]), lastResult: null, source: s.source || 'attempt' };
    added++;
  });
  return { review: out, added };
}

/* 复习迁移：答对进一阶（封顶 stage 4，+30 天）；答错回 stage 0（+1 天）。 */
export function applyReviewResult(review: any, qid: number, correct: boolean, today: string) {
  const out = normalizeReview(review);
  const e = out[qid];
  if (!e) return out;
  if (correct) {
    e.stage = Math.min(e.stage + 1, REVIEW_INTERVALS.length - 1);
    e.due = addDaysStr(today, REVIEW_INTERVALS[e.stage]);
    e.lastResult = 'correct';
  } else {
    e.stage = 0;
    e.due = addDaysStr(today, REVIEW_INTERVALS[0]);
    e.lastResult = 'wrong';
  }
  out[qid] = e;
  return out;
}

export function dueQuestions(review: any, today: string) {
  const out = normalizeReview(review);
  return Object.keys(out)
    .filter((k) => out[k].due <= today)
    .map((k) => ({ qid: parseInt(k, 10), stage: out[k].stage, due: out[k].due, source: out[k].source }))
    .sort((a, b) => (a.due < b.due ? -1 : (a.due > b.due ? 1 : a.qid - b.qid)));
}
