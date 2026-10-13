import sys, csv, re, statistics as st
d='/Users/saeed/.t3/projects/pewpew/.audit/baseline/raw/'
for label in sys.argv[1:]:
    rows=list(csv.DictReader(open(d+label+'.ps.csv')))
    rss=[int(r['rss_kb'])/1024 for r in rows]; cpu=[float(r['pcpu']) for r in rows]; th=[int(r['threads']) for r in rows]
    tc=[];tth=[];tm=[]
    for l in open(d+label+'.top.txt'):
        f=l.split()
        if len(f)>=5 and f[0].isdigit():
            tc.append(float(f[1])); tth.append(f[2]); tm.append(f[3])
    tc=tc[1:]  # first top sample has no delta
    f=lambda xs:f"{min(xs):.1f} / {st.mean(xs):.1f} / {max(xs):.1f}"
    print(f"{label}: n={len(rows)} RSS MB {f(rss)} | ps %CPU {f(cpu)} | top %CPU {f(tc) if tc else 'n/a'} | threads {min(th)}-{max(th)} | top th {sorted(set(tth))} | top mem {tm[1] if len(tm)>1 else ''}..{tm[-1] if tm else ''}")
