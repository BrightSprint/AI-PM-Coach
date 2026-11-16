# -*- coding: utf-8 -*-
"""
AI PM Coach 题库生成脚本（批次 8 · 三-3 补齐）：quiz-bank.json → assets/quiz-bank.js

背景：此前 quiz-bank.js 的生成方式没有留档脚本，导出包内无法再生成。
本脚本按应用实际消费的字段投影（丢弃源 JSON 的 pool 标记字段，键序与现行
quiz-bank.js 完全一致）打包为一行 JS，产出与现行文件逐字一致（已校验）。

布局感知（与知识搜索生成脚本同口径）：
- 开发布局：源在 ~/workspace/ai-pm-coach-app/quiz-bank.json，
  产出到 ~/workspace/ts-spaces/ai-pm-coach/assets/quiz-bank.js。
- 导出包布局：源在 <包根>/data/quiz-bank.json，产出到 <包根>/app/assets/quiz-bank.js。
在脚本所在目录的上级/同级自动探测，找不到时回退开发布局路径。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)

# 字段投影：与应用内 quiz-bank.js 的键序逐字一致（源 JSON 多一个 pool 字段，不进应用）
KEYS = ['id', 'src', 'stem', 'options', 'answer', 'dimension', 'difficulty',
        'sub_topic', 'exam_points', 'difficulty_points', 'distractor_analysis']


def find_src():
    cands = [
        os.path.join(HERE, 'quiz-bank.json'),          # 开发布局（ai-pm-coach-app/）
        os.path.join(HERE, '..', 'data', 'quiz-bank.json'),
        os.path.join(HERE, 'data', 'quiz-bank.json'),
        os.path.join(WS, 'ai-pm-coach-app', 'quiz-bank.json'),
    ]
    for c in cands:
        if os.path.exists(c):
            return os.path.normpath(c)
    return cands[0]


def find_out():
    cands = [
        os.path.join(WS, 'ts-spaces', 'ai-pm-coach', 'assets', 'quiz-bank.js'),  # 开发布局
        os.path.join(HERE, '..', 'app', 'assets', 'quiz-bank.js'),               # 导出包布局
        os.path.join(HERE, 'app', 'assets', 'quiz-bank.js'),
    ]
    for c in cands:
        if os.path.exists(os.path.dirname(c)):
            return os.path.normpath(c)
    return cands[0]


def main():
    src, out = find_src(), find_out()
    with open(src, encoding='utf-8') as f:
        data = json.load(f)
    proj = [{k: e.get(k) for k in KEYS} for e in data]
    text = 'var QUIZ_BANK=' + json.dumps(proj, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text)
    print('OK 写出', out)
    print('条目数', len(proj), '（源', src, '）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
