# usage: drill_timeprofile.py <raw_cpu.xml> <pid> <thread-substring> <frame-regex> [top]
# inclusive counts of frames matching regex on threads matching substring (one count per sample per frame)
import sys, re, collections, xml.etree.ElementTree as ET
path, pid, thsub, rx = sys.argv[1:5]; top = int(sys.argv[5]) if len(sys.argv) > 5 else 30
rx = re.compile(rx); ids = {}
def reg(el, v):
    if el.get('id'): ids[el.get('id')] = v
    return v
def res(el, fn): return ids[el.get('ref')] if el.get('ref') else reg(el, fn(el))
def fv(el):
    b = el.find('binary'); return (el.get('name') or el.get('addr'), res(b, lambda e: e.get('name')) if b is not None else '?')
def bv(el): return [res(f, fv) for f in el.findall('frame')]
c = collections.Counter(); n = 0
for ev, el in ET.iterparse(path, events=('end',)):
    if el.tag != 'row': continue
    th = el.find('thread'); t = res(th, lambda e: e.get('fmt'))
    for s in th.iter():
        if s.get('id') and s.get('id') not in ids: ids[s.get('id')] = s.get('fmt')
    bt = el.find('tagged-backtrace')
    if bt is None: bt = el.find('backtrace')
    fr = res(bt, bv) if bt is not None else []
    if f'pid: {pid})' in (t or '') and thsub.lower() in t.lower():
        n += 1
        for f in set(f"{a} [{b}]" for a, b in fr if rx.search(f"{a} [{b}]")): c[f] += 1
    el.clear()
print(f"thread~'{thsub}' samples={n}")
for f, k in c.most_common(top): print(f"{k:6d} {100*k/max(n,1):5.1f}%  {f[:200]}")
