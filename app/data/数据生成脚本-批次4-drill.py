import re, json, sys
src = open('/home/hatch/workspace/ai-pm-coach-question-bank/expansion/完整扩写版.md', encoding='utf-8').read()
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
json.dump({'entries':entries,'missing':missing,'dups':dups}, open('/tmp/drill/parsed.json','w'), ensure_ascii=False)
import re, json
d = json.load(open('/tmp/drill/parsed.json'))
entries = d['entries']

# dimension/difficulty sources
qb_src = open('/home/hatch/workspace/ts-spaces/ai-pm-coach/assets/quiz-bank.js', encoding='utf-8').read()
qb = json.loads(qb_src[qb_src.index('['):qb_src.rindex(']')+1])
dim = {}
for q in qb:
    dim.setdefault(q['src'], (q['dimension'], q['difficulty']))
q543 = json.load(open('/home/hatch/workspace/ai-pm-coach-question-bank/output/questions.json'))
for q in q543:
    dim.setdefault('G%d' % q['id'], (q['dimension'], q['difficulty_level']))
try:
    cq = json.load(open('/home/hatch/workspace/pm-knowledge-bank/output/complete-questions.json'))
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
open('/home/hatch/workspace/ts-spaces/ai-pm-coach/assets/drill-bank.js','w',encoding='utf-8').write(js)
print('drill-bank.js bytes:', len(js.encode('utf-8')))
