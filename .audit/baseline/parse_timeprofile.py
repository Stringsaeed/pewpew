# usage: parse_timeprofile.py <raw_cpu.xml> <pid> ; prints per-thread self (leaf) and inclusive top symbols for one process
import sys, collections, xml.etree.ElementTree as ET
path, pid = sys.argv[1], sys.argv[2]
ids = {}   # id -> resolved value
def reg(el, val):
    i = el.get('id')
    if i: ids[i] = val
    return val
def resolve(el, fn):
    r = el.get('ref')
    return ids[r] if r else reg(el, fn(el))
def frame_val(el):
    b = el.find('binary')
    lib = resolve(b, lambda e: e.get('name')) if b is not None else '?'
    return (el.get('name') or el.get('addr'), lib)
def bt_val(el):
    return [resolve(f, frame_val) for f in el.findall('frame')]
selfc = collections.defaultdict(collections.Counter); incl = collections.defaultdict(collections.Counter)
libc = collections.defaultdict(collections.Counter); tot = collections.Counter(); times = []
for ev, el in ET.iterparse(path, events=('end',)):
    if el.tag != 'row': continue
    th_el = el.find('thread'); thread = resolve(th_el, lambda e: e.get('fmt'))
    # register nested ids inside thread/process so later refs resolve
    for sub in th_el.iter():
        if sub.get('id') and sub.get('id') not in ids: ids[sub.get('id')] = sub.get('fmt')
    st = el.find('time-sample') if el.find('sample-time') is None else el.find('sample-time')
    if st is not None: resolve(st, lambda e: e.text)
    for tag in ('process','core','thread-state','weight'):
        x = el.find(tag)
        if x is not None: resolve(x, lambda e: e.get('fmt'))
    bt = el.find('tagged-backtrace')
    if bt is None: bt = el.find('backtrace')
    frames = resolve(bt, bt_val) if bt is not None else []
    if f'pid: {pid})' not in (thread or ''):
        el.clear(); continue
    w = el.find('weight'); wv = 1.0
    name = thread.split(' (0x')[0]
    if 'Main Thread' in thread or name == 'PewPew' and False: pass
    tot[thread] += 1
    if st is not None: times.append(int(ids.get(st.get('ref'), st.text) if st.get('ref') else st.text))
    if frames:
        selfc[thread][f"{frames[0][0]} [{frames[0][1]}]"] += 1
        libc[thread][frames[0][1]] += 1
        for fr in set(f"{f[0]} [{f[1]}]" for f in frames): incl[thread][fr] += 1
    el.clear()
allt = sum(tot.values())
print(f"samples (1 ms each) for pid {pid}: {allt}; span {(max(times)-min(times))/1e9:.1f} s" if times else allt)
for th, n in tot.most_common(12):
    print(f"\n### {th}: {n} ms ({100*n/allt:.1f}%)")
    print("  self (leaf) top:"); [print(f"    {c:5d}  {s}") for s, c in selfc[th].most_common(12)]
    print("  leaf by library:"); [print(f"    {c:5d}  {s}") for s, c in libc[th].most_common(6)]
    print("  inclusive top:"); [print(f"    {c:5d}  {s[:160]}") for s, c in incl[th].most_common(40)]
