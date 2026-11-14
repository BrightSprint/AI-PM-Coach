# -*- coding: utf-8 -*-
"""
数据生成脚本 · 知识搜索（glossary）
运行：python3 数据生成脚本-知识搜索-glossary.py
输入：
  - glossary-frag-1.json / glossary-frag-2.json（知识库 104 条 + 补强篇 20 条的三段式拆分，共 124 条）
  - ~/workspace/pm-knowledge-bank/supplement2/补遗条目.md（补遗 23 条，正文为单段叙述，
    本脚本按下方 SPLITS 逐句归属表切成三段——逐句索引、每句恰用一次，文本逐字来自原文、零转写）
输出：
  - ~/workspace/ts-spaces/ai-pm-coach/assets/glossary.js（var GLOSSARY_BANK = [...]，共 147 条）
口径：三段只能由原文拆分重组；原文缺段时的通用补写已在 frag 数据中以 supp 字段标注；
补遗 23 条三段均有原文材料，supp 一律为空，另加 batch:"supplement2" 标记。
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WS = HERE.parent
FRAG1 = HERE / 'glossary-frag-1.json'
FRAG2 = HERE / 'glossary-frag-2.json'
SUPP2_MD = WS / 'pm-knowledge-bank' / 'supplement2' / '补遗条目.md'
OUT = WS / 'ts-spaces' / 'ai-pm-coach' / 'assets' / 'glossary.js'

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


def fail(msg):
    print('FAIL:', msg)
    sys.exit(1)


def main():
    entries = []
    for f in (FRAG1, FRAG2):
        entries += json.loads(f.read_text(encoding='utf-8'))
    if len(entries) != 124:
        fail(f'frag 合计应为 124，实际 {len(entries)}')
    for i, e in enumerate(entries, 1):
        if e['id'] != f'KB-{i:03d}':
            fail(f'frag id 不连续：{e["id"]} != KB-{i:03d}')

    # ---- 补遗解析 ----
    md = SUPP2_MD.read_text(encoding='utf-8')
    parts = re.split(r'### \*\*(.+?)\*\*', md)
    raw = []
    for i in range(1, len(parts), 2):
        title = parts[i].strip().rstrip('：:')
        body = parts[i + 1]
        body = re.sub(r'^# .*', '', body, flags=re.M).split('### ')[0].strip().replace('\n', '')
        sents = [s for s in re.split(r'(?<=。)', body) if s.strip()]
        raw.append((title, body, sents))
    if len(raw) != 23:
        fail(f'补遗条目应为 23，实际 {len(raw)}')

    supp2 = []
    for n, (title, body, sents) in enumerate(raw, 1):
        sp = SPLITS[n]
        used = sorted(sp['c'] + sp['u'] + sp['n'])
        if used != list(range(len(sents))):
            fail(f'补遗第 {n} 条《{title}》句归属不完整：used={used} total={len(sents)}')
        join = lambda idxs: ''.join(sents[i] for i in idxs)
        cat = next(c for lo, hi, c in CATS_BY_CHAPTER if lo <= n <= hi)
        kw, kp = META[n - 1]
        e = {
            'id': f'KB-{124 + n:03d}',
            'term': title,
            'cat': cat,
            'concept': join(sp['c']),
            'usage': join(sp['u']),
            'notes': join(sp['n']),
            'supp': [],
            'kw': kw,
            'kp': kp,
            'batch': 'supplement2',
        }
        # 逐字校验：三段拼接（按概念/使用/注意的归属重组后）字符多重集与原文一致
        from collections import Counter
        if Counter(e['concept'] + e['usage'] + e['notes']) != Counter(body):
            fail(f'补遗第 {n} 条《{title}》三段与原文字符不一致')
        supp2.append(e)

    all_entries = entries + supp2

    # ---- 全量校验 ----
    ids = [e['id'] for e in all_entries]
    if len(all_entries) != 147 or len(set(ids)) != 147:
        fail(f'总数/id 唯一性异常：{len(all_entries)} / {len(set(ids))}')
    for e in all_entries:
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
        '/* glossary.js — 知识搜索词条数据（共 147 条）\n'
        ' * 由 ai-pm-coach-app/数据生成脚本-知识搜索-glossary.py 生成，勿手改。\n'
        ' * 来源：知识库 104 条 + 补强篇 20 条（原文三段式拆分，缺段补写以 supp 字段标注）\n'
        ' *       + supplement2 补遗 23 条（batch:"supplement2"，逐句切分、文本逐字来自原文）。 */\n'
        'var GLOSSARY_BANK=' + payload + ';\n',
        encoding='utf-8')

    from collections import Counter
    print('OK 写出', OUT)
    print('总数', len(all_entries), '分类', dict(Counter(e['cat'] for e in all_entries)))
    print('补遗', len(supp2), '（batch=supplement2, KB-125..KB-147）')
    print('supp 非空', sum(1 for e in all_entries if e['supp']), '条；kp 非空', sum(1 for e in all_entries if e['kp'] is not None), '条')
    print('重名词条（保留为独立条目）:', dup if dup else '无')


if __name__ == '__main__':
    main()
