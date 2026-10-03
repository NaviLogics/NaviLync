"""Track and speed plots of a PX4 SITL ulog of a NaviLync survey mission.

Usage: python3 plots.py <ulog> <mission json> <title> <png>
"""
import json, math, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from pyulog import ULog
ulog_file, mission_file, title, out = sys.argv[1:5]
u = ULog(ulog_file); items = json.load(open(mission_file))['items']
def topic(n):
    d=[x for x in u.data_list if x.name==n]; return d[0].data if d else None
lp=topic('vehicle_local_position'); t=lp['timestamp']/1e6; x,y=lp['x'],lp['y']; v=np.hypot(lp['vx'],lp['vy'])
ref=(lp['ref_lat'][-1], lp['ref_lon'][-1])
def local(lat,lon): return ((lat-ref[0])*math.pi/180*6371000, (lon-ref[1])*math.pi/180*6371000*math.cos(math.radians(ref[0])))
nmi=topic('navigator_mission_item'); started={}
for ti,s in zip(nmi['timestamp']/1e6,nmi['sequence_current']): started.setdefault(int(s),ti)
t_start=min(started.values()); t_end=t_start+max(started.values())-t_start+8
w=(t>=t_start)&(t<=t_end)
sp=topic('rover_speed_setpoint'); ts=sp['timestamp']/1e6
fig,(ax,ax2)=plt.subplots(1,2,figsize=(16,7),gridspec_kw={'width_ratios':[1.15,1]})
pts=np.array([y[w],x[w]]).T.reshape(-1,1,2); segs=np.concatenate([pts[:-1],pts[1:]],axis=1)
lc=LineCollection(segs,cmap='viridis',norm=plt.Normalize(0,2.0)); lc.set_array(v[w][:-1]); lc.set_linewidth(2.2); ax.add_collection(lc)
fig.colorbar(lc,ax=ax,label='speed, m/s',fraction=0.04)
colors={'approach':'#888888','runInStart':'#E07B00','lineStart':'#1f5fbf','lineEnd':'#1f5fbf','runOutEnd':'#E07B00'}
plan=[]
for it in items:
    if it['command']!='MAV_CMD_NAV_WAYPOINT': continue
    n,e=local(it['x']/1e7,it['y']/1e7); plan.append((e,n))
    ax.plot(e,n,'o',color=colors[it['kind']],ms=5,zorder=3)
    if it['kind'] in ('runInStart','runOutEnd'):
        ax.add_patch(plt.Circle((e,n),1.0,fill=False,ls='--',lw=0.8,color='#E07B00'))
pe,pn=zip(*plan); ax.plot(pe,pn,':',color='#999999',lw=0.8,zorder=1)
ax.set_aspect('equal'); ax.set_xlabel('east, m'); ax.set_ylabel('north, m'); ax.grid(alpha=0.3)
ax.set_title(f'{title}: track (colour = speed); planned points: R/T orange with NAV_ACC_RAD 1 m, S/E blue, A0 grey',fontsize=9)
m=(ts>=t_start)&(ts<=t_end)
ax2.plot(ts[m]-t_start,sp['speed_body_x'][m],lw=1,label='rover_speed_setpoint',color='#1f5fbf')
ax2.plot(t[w]-t_start,v[w],lw=1,label='measured speed',color='#2a9d8f')
seqs=sorted(started)
for i,s in enumerate(seqs):
    if items[s]['command']=='MAV_CMD_NAV_DELAY':
        a=started[s]-t_start; b=(started[seqs[i+1]] if i+1<len(seqs) else started[s]+3)-t_start
        ax2.axvspan(a,b,color='#E07B00',alpha=0.25,lw=0)
ax2.axhline(0.1,color='#c0392b',lw=0.6,ls='--'); ax2.set_xlabel('time from mission start, s'); ax2.set_ylabel('m/s')
ax2.set_title('speed: setpoint and measured; orange = NAV_DELAY; red dashed = 0.1 m/s',fontsize=9); ax2.legend(fontsize=8); ax2.grid(alpha=0.3)
fig.tight_layout(); fig.savefig(out,dpi=110)
print('saved',out)
