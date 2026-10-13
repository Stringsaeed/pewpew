# usage: window_stats.py <start_epoch_s> <end_epoch_s> <label>...
# stats over ps samples and top samples inside [start,end) across the given labels (top's first sample per file dropped: no delta)
import sys, csv, time, statistics as st
d='/Users/saeed/.t3/projects/pewpew/.audit/baseline/raw/'
a,b=float(sys.argv[1]),float(sys.argv[2])
rows=[];tops=[];load=[]
for label in sys.argv[3:]:
    rows+=[r for r in csv.DictReader(open(d+label+'.ps.csv')) if a<=int(r['epoch'])<b]
    t=None;first=True
    for l in open(d+label+'.top.txt'):
        if l[:2]=='20' and l[4]=='/': t=time.mktime(time.strptime(l.strip(),'%Y/%m/%d %H:%M:%S'))
        elif l.startswith('Load Avg') and t and a<=t<b: load.append(float(l.split()[2].rstrip(',')))
        else:
            f=l.split()
            if len(f)>=5 and f[0].isdigit():
                if not first and a<=t<b: tops.append((float(f[1]),f[2],f[3]))
                first=False
rss=[int(r['rss_kb'])/1024 for r in rows]; cpu=[float(r['pcpu']) for r in rows]; th=[int(r['threads']) for r in rows]
f=lambda xs:f"{min(xs):.1f} / {st.mean(xs):.1f} / {max(xs):.1f}"
tc=[x[0] for x in tops]
print(f"n_ps={len(rows)} RSS MB {f(rss)} | ps %CPU {f(cpu)} | threads {min(th)}-{max(th)} || n_top={len(tops)} top %CPU {f(tc)} | top #TH {sorted(set(x[1] for x in tops))} | top MEM {tops[0][2]}..{tops[-1][2]} | host load1 {f(load) if load else 'n/a'}")
