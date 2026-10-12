# usage: categorize_timeprofile.py <raw_cpu.xml> <pid> ; per-thread share of samples whose stack contains a frame from each category (first match in category order wins)
import sys, re, collections, xml.etree.ElementTree as ET
path, pid = sys.argv[1:3]
CATS = [('WebGPU (rnwgpu/Dawn)', r'rnwgpu::|dawn::'), ('Audio API (react-native-audio-api)', r'audioapi::'),
        ('Hermes GC', r'HadesGC'), ('React Fabric (UIManager/ShadowTree)', r'UIManagerBinding|ShadowTree|facebook::react::Scheduler::|YGNode|yoga::'),
        ('Metal/MTLSim/FramePacing', r'MTLSim|\[Metal\]|FramePacing|CAMetal'), ('Worklets/Reanimated', r'worklets::|reanimated::'),
        ('Hermes interpreter (JS code)', r'hermes::vm::Interpreter|hermesvm')]
CATS = [(n, re.compile(r)) for n, r in CATS]
ids = {}
def reg(el, v):
    if el.get('id'): ids[el.get('id')] = v
    return v
def res(el, fn): return ids[el.get('ref')] if el.get('ref') else reg(el, fn(el))
def fv(el):
    b = el.find('binary'); return f"{el.get('name') or el.get('addr')} [{res(b, lambda e: e.get('name')) if b is not None else '?'}]"
def bv(el): return [res(f, fv) for f in el.findall('frame')]
per = collections.defaultdict(collections.Counter); tot = collections.Counter()
for ev, el in ET.iterparse(path, events=('end',)):
    if el.tag != 'row': continue
    th = el.find('thread'); t = res(th, lambda e: e.get('fmt'))
    for s in th.iter():
        if s.get('id') and s.get('id') not in ids: ids[s.get('id')] = s.get('fmt')
    bt = el.find('tagged-backtrace')
    if bt is None: bt = el.find('backtrace')
    fr = res(bt, bv) if bt is not None else []
    if f'pid: {pid})' in (t or ''):
        name = re.sub(r' \(0x[0-9a-f]+\) \(PewPew, pid: \d+\)', '', t)
        if name == 'PewPew': name = 'PewPew (unnamed GCD/worker threads)'
        tot[name] += 1
        joined = '\n'.join(fr)
        for n, r in CATS:
            if r.search(joined): per[name][n] += 1; break
        else: per[name]['other'] += 1
    el.clear()
T = sum(tot.values())
for th, n in tot.most_common():
    print(f"{th}: {n} ms = {100*n/T:.1f}% of app CPU samples")
    for c, k in per[th].most_common(): print(f"    {k:5d} {100*k/n:5.1f}%  {c}")
