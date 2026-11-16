import re, json, sys, os

# 批次 8（三-2/三-3）布局感知：源文件与产出路径在开发布局与导出包布局下都能解析——
# 开发布局：源在 ~/workspace/ai-pm-coach-question-bank/ 等处，产出到 ts-spaces 真源；
# 导出包布局：源在 <包根>/data/（与本脚本同级），产出到 <包根>/app/assets/。
HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.dirname(HERE)

def _first_existing(cands):
    for c in cands:
        if os.path.exists(c):
            return os.path.normpath(c)
    return os.path.normpath(cands[0])

EXPANSION_MD = _first_existing([
    os.path.join(WS, 'ai-pm-coach-question-bank', 'expansion', '完整扩写版.md'),
    os.path.join(HERE, '完整扩写版.md'),
    os.path.join(HERE, 'expansion', '完整扩写版.md'),
])
QUIZBANK_JS = _first_existing([
    os.path.join(WS, 'ts-spaces', 'ai-pm-coach', 'assets', 'quiz-bank.js'),
    os.path.join(HERE, '..', 'app', 'assets', 'quiz-bank.js'),
])
QUESTIONS_JSON = _first_existing([
    os.path.join(WS, 'ai-pm-coach-question-bank', 'output', 'questions.json'),
    os.path.join(HERE, 'questions.json'),
])
COMPLETE_JSON = _first_existing([
    os.path.join(WS, 'pm-knowledge-bank', 'output', 'complete-questions.json'),
    os.path.join(HERE, 'complete-questions.json'),
])
DRILL_OUT = _first_existing([
    os.path.join(WS, 'ts-spaces', 'ai-pm-coach', 'assets', 'drill-bank.js'),
    os.path.join(HERE, '..', 'app', 'assets', 'drill-bank.js'),
])

src = open(EXPANSION_MD, encoding='utf-8').read()
lines = src.split('\n')
# split by ## headers
entries_raw = []
cur = None
for ln in lines:
    if ln.startswith('## '):
        if cur: entries_raw.append(cur)
        cur = {'header': ln[3:].strip(), 'body': []}
    elif cur is not None:
        cur['body'].append(ln)
if cur: entries_raw.append(cur)

entry_re1 = re.compile(r'^第\s*\d+\s*题｜(.+?)（原 50 题版第\s*(\d+)\s*题 · (?:对应\s*(G\d+)|无对应原题)）\s*$')
entry_re2 = re.compile(r'^\[(G\d+)\]\s*第\s*\d+\s*题｜(.+?)\s*$')
entries = []
nonentry = []
for e in entries_raw:
    h = e['header']
    m1 = entry_re1.match(h); m2 = entry_re2.match(h)
    if m1:
        entries.append({'header':h,'title':m1.group(1).strip(),'orig50':int(m1.group(2)),'gid':m1.group(3),'body':'\n'.join(e['body'])})
    elif m2:
        entries.append({'header':h,'title':m2.group(2).strip(),'orig50':None,'gid':m2.group(1),'body':'\n'.join(e['body'])})
    else:
        nonentry.append(h)
print('total ## blocks:', len(entries_raw), 'entries:', len(entries), 'non-entry headers:', len(nonentry))
for h in nonentry: print('NONENTRY:', h)

SEG_KEYS = ['ask','explain','case','pitfalls','followup']
def parse_sections(body):
    # find **题目** line
    qm = re.search(r'\*\*题目\*\*[：:]\s*(.+)', body)
    question = qm.group(1).strip() if qm else None
    # split by ### headers
    parts = re.split(r'^###\s+(.+)$', body, flags=re.M)
    secs = {}
    order = []
    for i in range(1, len(parts), 2):
        name = parts[i].strip(); content = parts[i+1] if i+1 < len(parts) else ''
        order.append(name)
        secs[name] = content
    return question, secs, order

def classify(name):
    if name.startswith('一、') and '问什么' in name: return 'ask'
    if name.startswith('二、') and '拆解' in name: return 'explain'
    if name.startswith('三、') and ('案例' in name or '实机' in name): return 'case'
    if name.startswith('四、') and '坑' in name: return 'pitfalls'
    if name.startswith('五、') and '追问' in name: return 'followup'
    return None

missing = []
extra_secs = {}
for e in entries:
    q, secs, order = parse_sections(e['body'])
    e['question'] = q
    e['sections'] = {}
    for name, content in secs.items():
        k = classify(name)
        if k: e['sections'][k] = content.strip()
        else:
            extra_secs.setdefault(name, 0); extra_secs[name]+=1
            # append extra section content to previous known section if any (keep in explain?) - record separately
            e.setdefault('extra', {})[name] = content.strip()
    # 一-10 定点修复：G543 为源文件最后一条，其 followup 末尾漏入收尾附录标题块
    # （第二个分隔线 + 「# 📌 收尾：复习建议与面试策略」标题行，其后无正文），解析时剔除；
    # 仅处理 G543 这一处已确认伪影，不改动任何其他条目的解析结果。
    if e.get('gid') == 'G543' and 'followup' in e['sections']:
        e['sections']['followup'] = re.sub(
            r'\n\n---\n\n# 📌 收尾：复习建议与面试策略$', '', e['sections']['followup'])
    miss = [k for k in SEG_KEYS if k not in e['sections'] or len(e['sections'].get(k,''))<10]
    if q is None: miss.append('question')
    if miss: missing.append((e['gid'], e['orig50'], e['title'], miss))
print('entries missing segments/question:', len(missing))
for m in missing: print('MISSING:', m)
print('extra section names:', extra_secs)
from collections import Counter
gids = Counter(e['gid'] for e in entries if e['gid'])
dups = {g:c for g,c in gids.items() if c>1}
print('gid dups:', dups)
print('no-gid entries:', [(e['orig50'], e['title']) for e in entries if not e['gid']])
# 中间文件放系统临时目录并自动建目录（批次 8 净室验收发现：原写死 /tmp/drill/ 在全新环境下因目录不存在而崩溃）
import tempfile
_TMPDIR = os.path.join(tempfile.gettempdir(), 'aipm-drill')
os.makedirs(_TMPDIR, exist_ok=True)
_PARSED = os.path.join(_TMPDIR, 'parsed.json')
json.dump({'entries':entries,'missing':missing,'dups':dups}, open(_PARSED,'w'), ensure_ascii=False)
import re, json
d = json.load(open(_PARSED))
entries = d['entries']

# dimension/difficulty sources
qb_src = open(QUIZBANK_JS, encoding='utf-8').read()
qb = json.loads(qb_src[qb_src.index('['):qb_src.rindex(']')+1])
dim = {}
for q in qb:
    dim.setdefault(q['src'], (q['dimension'], q['difficulty']))
q543 = json.load(open(QUESTIONS_JSON))
for q in q543:
    dim.setdefault('G%d' % q['id'], (q['dimension'], q['difficulty_level']))
try:
    cq = json.load(open(COMPLETE_JSON))
    items = cq if isinstance(cq, list) else cq.get('questions', [])
    for q in items:
        s = q.get('src') or q.get('source_id') or ''
        if s and s not in dim and q.get('dimension'):
            dim[s] = (q['dimension'], q.get('difficulty') or q.get('difficulty_level'))
except Exception as ex:
    print('complete bank load note:', ex)

used = {}
out = []
nodim = []
for e in entries:
    gid = e['gid']
    if gid:
        base = gid
        if base in used:
            used[base] += 1
            key = '%s-%d' % (base, used[base])
        else:
            used[base] = 1
            key = base
    else:
        key = 'E%d' % e['orig50']  # 原50题版无对应原题：以原版题号为键
    dm = dim.get(gid) if gid else None
    if gid and not dm: nodim.append(gid)
    secs = dict(e['sections'])
    if e.get('extra'):
        for name, content in e['extra'].items():
            if name.startswith('三、') and 'case' not in secs:
                secs['case'] = content  # G39 变体标题，其实机案例内容在此段（解析报告注明）
    out.append({
        'gid': key,
        'srcGid': gid,
        'title': e['title'],
        'question': e['question'],
        'dimension': dm[0] if dm else None,
        'difficulty': dm[1] if dm else None,
        'sections': {k: secs.get(k, '') for k in ['ask','explain','case','pitfalls','followup']},
    })
print('built:', len(out), 'no-dimension gids:', nodim)
miss = [(o['gid'], [k for k,v in o['sections'].items() if len(v)<10]) for o in out]
miss = [m for m in miss if m[1]]
print('entries with short/missing sections after build:', miss)
noq = [o['gid'] for o in out if not o['question']]
print('entries missing question:', noq)
nod = [o['gid'] for o in out if not o['dimension']]
print('entries missing dimension:', nod)
js = 'var DRILL_BANK=' + json.dumps(out, ensure_ascii=False) + ';\n'
open(DRILL_OUT,'w',encoding='utf-8').write(js)
print('drill-bank.js bytes:', len(js.encode('utf-8')))
