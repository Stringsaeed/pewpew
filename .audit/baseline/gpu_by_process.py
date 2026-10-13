# usage: gpu_by_process.py <metal-gpu-intervals.xml> ; sums depth-0 GPU interval busy time per process and channel
import sys, collections, xml.etree.ElementTree as ET
ids = {}; busy = collections.Counter(); cnt = collections.Counter(); t0 = None; t1 = 0
def val(el):
    fmt, text = ids[el.get('ref')] if el.get('ref') else (el.get('fmt'), el.text)
    return fmt if el.tag in ('process', 'gpu-channel-name', 'metal-nesting-level') else text
for ev, el in ET.iterparse(sys.argv[1], events=('end',)):
    if el.tag != 'row': continue
    for s_ in el.iter():
        if s_.get('id'): ids[s_.get('id')] = (s_.get('fmt'), s_.text)
    ch = list(el)
    start = int(val(ch[0])); dur = int(val(ch[1])); chan = val(ch[2]); depth = val(ch[5])
    proc = next((val(c) for c in ch if c.tag == 'process'), '?')
    if str(depth) == '0':
        busy[(proc, chan)] += dur; cnt[(proc, chan)] += 1
    t0 = start if t0 is None else min(t0, start); t1 = max(t1, start + dur)
    el.clear()
span = (t1 - t0) / 1e9
print(f"trace span {span:.2f} s; depth-0 GPU busy time by process/channel (sum of interval durations; channels can overlap)")
for (p, c), b in busy.most_common(25): print(f"  {b/1e6:9.1f} ms  {100*b/1e9/span:5.1f}%  n={cnt[(p,c)]:6d}  {c:10s} {p}")
