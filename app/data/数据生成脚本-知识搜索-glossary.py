# -*- coding: utf-8 -*-
"""
数据生成脚本 · 知识搜索（glossary）
运行：python3 数据生成脚本-知识搜索-glossary.py
输入：
  - glossary-frag-1.json / glossary-frag-2.json（知识库 104 条 + 补强篇 20 条的三段式拆分，共 124 条）
  - ~/workspace/pm-knowledge-bank/supplement2/补遗条目.md（补遗 23 条，正文为单段叙述，
    本脚本按下方 SPLITS 逐句归属表切成三段——逐句索引、每句恰用一次，文本逐字来自原文、零转写）
  - ~/workspace/pm-knowledge-bank/supplement3/补遗条目.md（补遗二期 13 条，同上，
    按 SPLITS3 逐句归属表切分；框架工具层 6 条为应用工具、基础根条目 7 条为技术术语）
  - ~/workspace/pm-knowledge-bank/supplement4/补遗条目.md（补遗三期 4 条，同上，
    按 SPLITS4 逐句归属表切分；4 条均为技术术语）
输出：
  - ~/workspace/ts-spaces/ai-pm-coach/assets/glossary.js（var GLOSSARY_BANK = [...]，共 164 条）
口径：三段只能由原文拆分重组；原文缺段时的通用补写已在 frag 数据中以 supp 字段标注；
补遗 23 条三段均有原文材料，supp 一律为空，另加 batch:"supplement2" 标记；
补遗二期 13 条同口径，supp 一律为空，另加 batch:"supplement3" 标记；
补遗三期 4 条同口径，supp 一律为空，另加 batch:"supplement4" 标记。
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WS = HERE.parent
FRAG1 = HERE / 'glossary-frag-1.json'
FRAG2 = HERE / 'glossary-frag-2.json'

# 批次 8（三-3）布局感知：补遗 MD 与产出路径在开发布局与导出包布局下都能解析——
# 开发布局：~/workspace/pm-knowledge-bank/supplementN/补遗条目.md，产出到 ts-spaces 真源；
# 导出包布局：<包根>/data/supplementN/补遗条目.md（与本脚本同级），产出到 <包根>/app/assets/。
def _first_existing(cands):
    for c in cands:
        if c.exists():
            return c
    return cands[0]

def _supp_md(n):
    return _first_existing([
        WS / 'pm-knowledge-bank' / f'supplement{n}' / '补遗条目.md',
        HERE / f'supplement{n}' / '补遗条目.md',
        HERE / '..' / 'data' / f'supplement{n}' / '补遗条目.md',
    ])

SUPP2_MD = _supp_md(2)
SUPP3_MD = _supp_md(3)
SUPP4_MD = _supp_md(4)
OUT = _first_existing([
    WS / 'ts-spaces' / 'ai-pm-coach' / 'assets' / 'glossary.js',
    HERE / '..' / 'app' / 'assets' / 'glossary.js',
])

# 补遗逐句归属表：c=概念介绍 u=使用方案 n=注意事项（0 基句序号，每句恰出现一次）
SPLITS = {
    1:  dict(c=[0, 1, 2], u=[3], n=[4]),
    2:  dict(c=[0, 1, 2], u=[4], n=[3]),
    3:  dict(c=[0, 1, 2], u=[4, 5], n=[3]),
    4:  dict(c=[0, 1, 2], u=[4], n=[3]),
    5:  dict(c=[0, 1, 2], u=[3], n=[4]),
    6:  dict(c=[0, 1], u=[3, 4, 5], n=[2]),
    7:  dict(c=[0, 1, 2], u=[3, 5], n=[4]),
    8:  dict(c=[0, 1, 2], u=[3, 5], n=[4]),
    9:  dict(c=[0, 1, 2, 3], u=[4], n=[5]),
    10: dict(c=[0, 1], u=[2], n=[3]),
    11: dict(c=[0, 1, 2], u=[3], n=[4]),
    12: dict(c=[0, 1, 2], u=[4, 5], n=[3]),
    13: dict(c=[0, 1, 2], u=[4], n=[3]),
    14: dict(c=[0, 1, 2], u=[3], n=[4]),
    15: dict(c=[0, 1, 2], u=[3], n=[4]),
    16: dict(c=[0, 1, 2, 3], u=[4], n=[5]),
    17: dict(c=[0, 1, 2], u=[3], n=[4]),
    18: dict(c=[0, 1, 2], u=[3], n=[4]),
    19: dict(c=[0, 1, 2], u=[3], n=[4]),
    20: dict(c=[0, 1, 2], u=[3, 5], n=[4]),
    21: dict(c=[0, 1, 2], u=[3], n=[4]),
    22: dict(c=[0, 1], u=[3], n=[2]),
    23: dict(c=[0, 1, 2], u=[3, 5], n=[4]),
}
# 补遗关键词与相关知识点（kp 为 27 个知识点下标，无明显对应为 None，不硬凑）
META = [
    (['Transformer', '注意力机制', '上下文', '并行训练'], 0),
    (['推理模型', '测试时计算', '思考过程', '任务分级'], 18),
    (['上下文工程', '提示词工程', '上下文管理', '信息筛选'], 6),
    (['MoE', '混合专家', '激活参数', '总参数'], 18),
    (['小语言模型', 'SLM', '端侧 AI', '任务分工'], 18),
    (['长上下文', '中间遗忘', 'Token', 'RAG'], 0),
    (['GraphRAG', '知识图谱', '社区聚类', '全局归纳'], 19),
    (['Agentic RAG', '多跳问题', '检索护栏', '智能体'], 19),
    (['KV 缓存', 'Prompt 缓存', '投机解码', '推理成本'], 13),
    (['结构化输出', 'JSON Schema', '函数调用', '格式约束'], 1),
    (['AI 网关', '模型路由', '分级用模型', '故障切换'], 25),
    (['数据合成', '合成数据', '人工抽检', '真实数据锚点'], 24),
    (['DPO', '偏好优化', 'RLHF', '偏好对'], 2),
    (['LoRA', 'PEFT', '参数高效微调', '适配器'], 2),
    (['护栏', '红队测试', '拦截率', '误伤率'], 11),
    (['A2A', '智能体协议', 'MCP', '互联互通'], 14),
    (['原生多模态', '语音对话', '模态融合', '拼接方案'], 18),
    (['扩散模型', '去噪', '采样步数', '随机种子'], None),
    (['世界模型', '预测与预演', '世界模拟器'], None),
    (['Computer Use', '计算机操作', '沙箱', '人工确认'], 14),
    (['Deep Research', '深度研究', '异步任务', '引用溯源'], 20),
    (['数字人', '形象授权', '口型驱动', '内容标识'], None),
    (['Vibe Coding', 'AI 编程', '原型验证', '技术债'], None),
]
CATS_BY_CHAPTER = [(1, 20, '技术术语'), (21, 22, '应用工具'), (23, 23, '产品名词')]

# 补遗二期逐句归属表：13 条均为「概念 3 句 / 使用 1 句 / 注意 1 句」的五句结构
SPLITS3 = {n: dict(c=[0, 1, 2], u=[3], n=[4]) for n in range(1, 14)}
# 补遗二期关键词与相关知识点（kp 口径同上：有真关联才链）
META3 = [
    (['LangGraph', '状态图', '图编排', '工作流编排', 'Agent 框架', '检查点'], 14),
    (['LangChain', '开发框架', '链式调用', '组件拼装', '应用开发'], 14),
    (['Dify', '低代码', '应用开发平台', '可视化编排', '快速原型'], 14),
    (['LlamaIndex', '数据框架', '数据接入', 'RAG', '索引构建'], 19),
    (['CrewAI', 'AutoGen', '多智能体框架', '角色分工', '智能体协作'], 14),
    (['vLLM', 'Ollama', '推理引擎', '本地部署', '模型服务'], 13),
    (['ReAct', '推理行动', '思考-行动-观察', 'Agent 范式', '工具调用循环'], 14),
    (['Planning', 'Reflection', '任务规划', '自我反思', '纠错机制'], 14),
    (['机器学习', '监督学习', '无监督学习', '半监督学习', '数据规律'], 0),
    (['SFT', '指令微调', '监督微调', '指令数据', '微调阶段'], 2),
    (['Temperature', '温度', 'Top-p', '采样参数', '随机性控制'], 0),
    (['Benchmark', '基准测试', '公开榜单', 'MMLU', '模型评测'], 18),
    (['可观测性', '链路追踪', 'Tracing', 'LangSmith', '日志监控'], 23),
]
CATS3_BY_CHAPTER = [(1, 6, '应用工具'), (7, 13, '技术术语')]

# 补遗三期逐句归属表：4 条均为「概念 3 句 / 使用 1 句 / 注意 1 句」的五句结构
SPLITS4 = {n: dict(c=[0, 1, 2], u=[3], n=[4]) for n in range(1, 5)}
# 补遗三期关键词与相关知识点（kp 口径同上：有真关联才链）
META4 = [
    (['精确率', '召回率', 'F1', '准确率', '混淆矩阵', '查准率', '查全率'], 9),
    (['AUC', 'ROC', '排序能力', '阈值无关'], 9),
    (['CNN', 'RNN', 'LSTM', 'GAN', 'BERT', '经典架构'], 0),
    (['Docker', 'Kubernetes', 'ONNX', '容器化', '部署格式'], 25),
]
CATS4_BY_CHAPTER = [(1, 4, '技术术语')]


def fail(msg):
    print('FAIL:', msg)
    sys.exit(1)


def parse_supp_md(path, expect, splits, meta, cats_by_chapter, id_base, batch):
    """解析补遗 MD：逐句归属切三段 + 字符多重集逐字校验，返回条目列表。"""
    from collections import Counter
    md = path.read_text(encoding='utf-8')
    parts = re.split(r'### \*\*(.+?)\*\*', md)
    raw = []
    for i in range(1, len(parts), 2):
        title = parts[i].strip().rstrip('：:')
        body = parts[i + 1]
        body = re.sub(r'^# .*', '', body, flags=re.M).split('### ')[0].strip().replace('\n', '')
        sents = [s for s in re.split(r'(?<=。)', body) if s.strip()]
        raw.append((title, body, sents))
    if len(raw) != expect:
        fail(f'{path.name} 条目应为 {expect}，实际 {len(raw)}')
    out = []
    for n, (title, body, sents) in enumerate(raw, 1):
        sp = splits[n]
        used = sorted(sp['c'] + sp['u'] + sp['n'])
        if used != list(range(len(sents))):
            fail(f'{batch} 第 {n} 条《{title}》句归属不完整：used={used} total={len(sents)}')
        join = lambda idxs: ''.join(sents[i] for i in idxs)
        cat = next(c for lo, hi, c in cats_by_chapter if lo <= n <= hi)
        kw, kp = meta[n - 1]
        e = {
            'id': f'KB-{id_base + n:03d}',
            'term': title,
            'cat': cat,
            'concept': join(sp['c']),
            'usage': join(sp['u']),
            'notes': join(sp['n']),
            'supp': [],
            'kw': kw,
            'kp': kp,
            'batch': batch,
        }
        # 逐字校验：三段拼接（按概念/使用/注意的归属重组后）字符多重集与原文一致
        if Counter(e['concept'] + e['usage'] + e['notes']) != Counter(body):
            fail(f'{batch} 第 {n} 条《{title}》三段与原文字符不一致')
        out.append(e)
    return out


def main():
    entries = []
    for f in (FRAG1, FRAG2):
        entries += json.loads(f.read_text(encoding='utf-8'))
    if len(entries) != 124:
        fail(f'frag 合计应为 124，实际 {len(entries)}')
    for i, e in enumerate(entries, 1):
        if e['id'] != f'KB-{i:03d}':
            fail(f'frag id 不连续：{e["id"]} != KB-{i:03d}')

    # ---- 补遗（一期）解析 ----
    supp2 = parse_supp_md(SUPP2_MD, 23, SPLITS, META, CATS_BY_CHAPTER, 124, 'supplement2')
    # ---- 补遗二期解析 ----
    supp3 = parse_supp_md(SUPP3_MD, 13, SPLITS3, META3, CATS3_BY_CHAPTER, 147, 'supplement3')
    # ---- 补遗三期解析 ----
    supp4 = parse_supp_md(SUPP4_MD, 4, SPLITS4, META4, CATS4_BY_CHAPTER, 160, 'supplement4')

    all_entries = entries + supp2 + supp3 + supp4

    # ---- 全量校验 ----
    ids = [e['id'] for e in all_entries]
    if len(all_entries) != 164 or len(set(ids)) != 164:
        fail(f'总数/id 唯一性异常：{len(all_entries)} / {len(set(ids))}')
    for pos, e in enumerate(all_entries, 1):
        if e['id'] != f'KB-{pos:03d}':
            fail(f'id 不连续：位置 {pos} 为 {e["id"]}')
        for sec in ('concept', 'usage', 'notes'):
            if not e[sec] or len(e[sec]) < 10:
                fail(f'{e["id"]} {sec} 段为空或过短')
        if e['cat'] not in ('技术术语', '应用工具', '产品名词', '补强'):
            fail(f'{e["id"]} 分类异常：{e["cat"]}')
        if not (1 <= len(e['kw']) <= 8):
            fail(f'{e["id"]} kw 数量异常')
        if e['kp'] is not None and not (0 <= e['kp'] <= 26):
            fail(f'{e["id"]} kp 越界')
    terms = [e['term'] for e in all_entries]
    dup = [t for t in set(terms) if terms.count(t) > 1]

    payload = json.dumps(all_entries, ensure_ascii=False)
    OUT.write_text(
        '/* glossary.js — 知识搜索词条数据（共 164 条）\n'
        ' * 由 ai-pm-coach-app/数据生成脚本-知识搜索-glossary.py 生成，勿手改。\n'
        ' * 来源：知识库 104 条 + 补强篇 20 条（原文三段式拆分，缺段补写以 supp 字段标注）\n'
        ' *       + supplement2 补遗 23 条（batch:"supplement2"，逐句切分、文本逐字来自原文）\n'
        ' *       + supplement3 补遗二期 13 条（batch:"supplement3"，框架工具层 6 + 基础根条目 7，同口径）\n'
        ' *       + supplement4 补遗三期 4 条（batch:"supplement4"，评测指标 2 + 经典架构 1 + 部署基础 1，同口径）。 */\n'
        'var GLOSSARY_BANK=' + payload + ';\n',
        encoding='utf-8')

    from collections import Counter
    print('OK 写出', OUT)
    print('总数', len(all_entries), '分类', dict(Counter(e['cat'] for e in all_entries)))
    print('补遗', len(supp2), '（batch=supplement2, KB-125..KB-147）')
    print('补遗二期', len(supp3), '（batch=supplement3, KB-148..KB-160）')
    print('补遗三期', len(supp4), '（batch=supplement4, KB-161..KB-164）')
    print('supp 非空', sum(1 for e in all_entries if e['supp']), '条；kp 非空', sum(1 for e in all_entries if e['kp'] is not None), '条')
    print('重名词条（保留为独立条目）:', dup if dup else '无')


if __name__ == '__main__':
    main()
