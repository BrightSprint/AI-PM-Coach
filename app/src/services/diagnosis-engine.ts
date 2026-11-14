/**
 * diagnosis-engine.ts — 弱点诊断 + 学习资源推荐引擎（纯本地规则拼装）
 *
 * 运行时页面加载的是本文件的转译版：assets/diagnosis.js（数据在
 * assets/diagnosis-data.js）。全程无网络、无 LLM，可直接移植到
 * Windows 独立应用中运行。
 *
 * 规则要点（Suzuki 定版，依据《弱点诊断与资源推荐-非AI实现提示词》）：
 * - 薄弱点区块 = 该维每道答错题一块：标题 = 子考点；证据 = 测评序号 +
 *   题干摘要（≤40 字）；错因 = 所选选项的干扰项解析（题库原文逐字引用）
 *   + 难点摘录 + 模式句（跳过 / 低难度 / 用时 <15 秒 / 高难度 / 默认）。
 * - 一句话总结 = 预写句式库按「维度 × 主要薄弱子考点」填空，≤30 字，
 *   黑名单词（有潜力 / 提升空间 / 多学习…）命中即换备用句。
 * - 鼓励 = 该维最高难度答对题拼装；无则全卷最高难度答对题；再无则保底文案。
 * - 分层：答题数 ≤1 → 数据不足提示；分数 >90 → 已掌握 + 进阶挑战；
 *   有错题证据 → 个性化诊断；其余 → 维度 × 分数段基础诊断（24 段）。
 * - 资源推荐 = 预制资源库（每维 ≥4 条，无任何 URL）按标签包含匹配排序，
 *   不足时以该维通用资源补足到 3–5 条；理由命中时前缀具体子考点。
 */

export interface DiagRecord {
  questionId: number;
  dimension: string;
  correct: boolean;
  skipped: boolean;
  userAnswer: string | null;
  difficulty: number;
  timeSec: number;
  stem: string;
  sub_topic: string;
  exam_points: string[];
  difficulty_points: string[];
  /** 所选选项的干扰项解析（题库 distractor_analysis 原文）；跳过时为 null */
  selectedAnalysis: string | null;
}

export type DiagKind = 'personal' | 'base' | 'insufficient' | 'mastery';

export interface WeakBlock {
  title: string;
  seq: number;
  evidence: string;
  cause: string;
  pointIndex: number;
}

export interface ResourceRec {
  title: string;
  platform: string;
  type: '文章' | '视频' | '书' | '课程';
  minutes: number;
  keywords: string; // 3–6 个词，仅供用户自行搜索，库内不存 URL
  reason: string;
}

export interface DimensionDiagnosis {
  dimension: string;
  score: number;
  kind: DiagKind;
  summary: string;
  baseText?: string;
  blocks?: WeakBlock[];
  encouragement: string;
  challenge?: { subs: string[]; pointIndex: number };
  resources: ResourceRec[];
}

/* 具体拼装逻辑与 assets/diagnosis.js 一一对应，此处保留类型与契约；
   内容库（24 段基础诊断 / 句式库 / 30 条资源）在 assets/diagnosis-data.js。 */
