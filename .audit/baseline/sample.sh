#!/bin/zsh
# usage: sample.sh <pid> <label> [seconds]
# ps every 1 s (rss KB, %cpu decaying avg, %mem, thread count via ps -M) plus top -l in parallel (instantaneous %cpu, #th, mem footprint)
pid=$1; label=$2; n=${3:-20}
out=/Users/saeed/.t3/projects/pewpew/.audit/baseline/raw
top -l $((n+1)) -s 1 -pid $pid -stats pid,cpu,th,mem,command > $out/$label.top.txt 2>&1 &
tp=$!
echo "epoch,rss_kb,pcpu,pmem,threads" > $out/$label.ps.csv
for i in $(seq 1 $n); do
  line=$(ps -o rss=,%cpu=,%mem= -p $pid)
  th=$(( $(ps -M -p $pid | wc -l) - 1 ))
  echo "$(date +%s),$(echo $line | awk '{print $1","$2","$3}'),$th" >> $out/$label.ps.csv
  sleep 1
done
wait $tp
