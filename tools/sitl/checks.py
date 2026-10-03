"""Mission logic checks (1)-(5) on a PX4 SITL ulog of a NaviLync survey mission.

Usage: python3 checks.py <ulog> <mission json> <result json>
"""
import json, math, sys
import numpy as np
from pyulog import ULog
ulog_file, mission_file, out_json = sys.argv[1:4]
NAV_ACC_RAD = 1.0
u = ULog(ulog_file); items = json.load(open(mission_file))['items']
def topic(n):
    d=[x for x in u.data_list if x.name==n]; return d[0].data if d else None
lp=topic('vehicle_local_position'); t=lp['timestamp']/1e6; x,y=lp['x'],lp['y']; v=np.hypot(lp['vx'],lp['vy'])
ref=(lp['ref_lat'][-1], lp['ref_lon'][-1])
def local(lat,lon): return ((lat-ref[0])*math.pi/180*6371000, (lon-ref[1])*math.pi/180*6371000*math.cos(math.radians(ref[0])))
att=topic('vehicle_attitude'); ta=att['timestamp']/1e6
yaw=np.unwrap(np.arctan2(2*(att['q[0]']*att['q[3]']+att['q[1]']*att['q[2]']),1-2*(att['q[2]']**2+att['q[3]']**2)))
sp=topic('rover_speed_setpoint'); ts=sp['timestamp']/1e6; vs=sp['speed_body_x']
rps=topic('rover_position_setpoint'); tr=rps['timestamp']/1e6
nmi=topic('navigator_mission_item'); mres=topic('mission_result')
started={}
for ti,s in zip(nmi['timestamp']/1e6,nmi['sequence_current']): started.setdefault(int(s),ti)
seqs=sorted(started)
t_fin=float(mres['timestamp'][np.argmax(mres['finished']>0)]/1e6) if (mres['finished']>0).any() else float(t[-1])
end_of={s:(started[seqs[i+1]] if i+1<len(seqs) else t_fin) for i,s in enumerate(seqs)}
def at(a_t,a,ti): return a[min(np.searchsorted(a_t,ti),len(a)-1)]
wp_of={}; cur=None; speed_for={}; v_now=None
for it in items:
    if it['command']=='MAV_CMD_DO_CHANGE_SPEED': v_now=it['params'][1]
    if it['command']=='MAV_CMD_NAV_WAYPOINT':
        cur=local(it['x']/1e7,it['y']/1e7); speed_for[it['seq']]=v_now
    wp_of[it['seq']]=cur
r={}
# (1) cruising speed of every leg = the last DO_CHANGE_SPEED before it
legs=[]
for s,v_exp in speed_for.items():
    if s not in started: continue
    m=(tr>=started[s])&(tr<end_of[s])
    got=sorted({round(float(c),3) for c in rps['cruising_speed'][m]})
    ms=(ts>=started[s])&(ts<end_of[s])
    legs.append({'seq':s,'point':items[s]['kind'],'expected':v_exp,'cruising_speed':got,
                 'max_speed_setpoint':round(float(vs[ms].max()),3) if ms.any() else None})
r['1_speed']={'legs':legs,'pass':all(l['cruising_speed']==[l['expected']] for l in legs)}
# (2) NAV_DELAY stands still: after the first 0.5 s (braking from v_brake) speed < 0.1 m/s, within NAV_ACC_RAD of the point
delays=[]; stops=[]
for s in seqs:
    it=items[s]
    if it['command']!='MAV_CMD_NAV_DELAY': continue
    t0,t1=started[s],end_of[s]; wx,wy=wp_of[s]
    w=(t>=t0)&(t<t1); w2=(t>=t0+0.5)&(t<t1)
    dist=np.hypot(x[w]-wx,y[w]-wy)
    # The leg through the point: straight on (no stop expected by the controller) or a turn
    nav_before=[j for j in items[:s] if j['command']=='MAV_CMD_NAV_WAYPOINT']
    nav_after=[j for j in items[s:] if j['command']=='MAV_CMD_NAV_WAYPOINT']
    angle=None
    if len(nav_before)>=2 and nav_after:
        a=local(nav_before[-2]['x']/1e7,nav_before[-2]['y']/1e7); b=wp_of[s]; c=local(nav_after[0]['x']/1e7,nav_after[0]['y']/1e7)
        h1=math.atan2(b[1]-a[1],b[0]-a[0]); h2=math.atan2(c[1]-b[1],c[0]-b[0])
        angle=round(abs(math.degrees((h2-h1+math.pi)%(2*math.pi)-math.pi)),1)
    d={'seq':s,'point':it['kind'],'turn_at_point_deg':angle,'duration_s':round(t1-t0,2),
       'dist_at_accept_m':round(float(dist[0]),3),'max_dist_m':round(float(dist.max()),3),
       'max_speed_after_0_5s':round(float(v[w2].max()),3) if w2.any() else None}
    d['stands']=d['max_speed_after_0_5s'] is not None and d['max_speed_after_0_5s']<0.1 and d['max_dist_m']<=NAV_ACC_RAD+0.1
    delays.append(d)
    # (3) stop within NAV_ACC_RAD, then a spot turn (speed setpoint 0) before driving on
    if s in end_of and seqs.index(s)+1<len(seqs):
        k=np.searchsorted(ts,t1)
        while k<len(ts) and abs(vs[k])<1e-6 and ts[k]<t1+20: k+=1
        te=ts[k] if k<len(ts) else t1
        wt=(t>=t1)&(t<=te)
        stops.append({'seq':s,'point':it['kind'],'dist_at_accept_m':d['dist_at_accept_m'],'spot_turn_s':round(te-t1,2),
                      'spot_turn_deg':round(math.degrees(abs(at(ta,yaw,te)-at(ta,yaw,t1))),1),
                      'displacement_in_turn_m':round(float(np.hypot(x[wt]-x[wt][0],y[wt]-y[wt][0]).max()),3) if wt.sum()>1 else 0.0})
r['2_delay']={'delays':delays,'pass_all':all(d['stands'] for d in delays)}
r['3_stop_turn']={'stops':stops,'max_dist_at_accept_m':max(d['dist_at_accept_m'] for d in delays)}
# (4) last waypoint accepted on the first approach
last=[it for it in items if it['command']=='MAV_CMD_NAV_WAYPOINT'][-1]
t0,t1=started[last['seq']],end_of[last['seq']]; w=(t>=t0)&(t<=t1)
lx,ly=local(last['x']/1e7,last['y']/1e7); dd=np.hypot(x[w]-lx,y[w]-ly)
r['4_last']={'seq':last['seq'],'dist_at_accept_m':round(float(dd[-1]),3),'min_dist_m':round(float(dd.min()),3),
             'distance_rose_after_closest_m':round(float(np.max(dd[np.argmin(dd):]-dd.min())),3),
             'mission_finished':bool((mres['finished']>0).any())}
# (5) acceptance radius
pcs=topic('position_controller_status'); pst=topic('position_setpoint_triplet')
r['5_acceptance_radius']={'position_controller_status_msgs':0 if pcs is None else int(len(pcs['timestamp'])),
    'setpoint_current_acceptance_radius':sorted({round(float(a),3) for a in pst['current.acceptance_radius']}),
    'max_dist_at_accept_m':max([d['dist_at_accept_m'] for d in delays]+[r['4_last']['dist_at_accept_m']])}
json.dump(r,open(out_json,'w'),indent=1)
print(json.dumps({k:(v if k in('4_last','5_acceptance_radius') else {kk:vv for kk,vv in v.items() if kk not in('legs','delays','stops')}) for k,v in r.items()},indent=1))
for d in delays: print('delay',d)
for s in stops: print('stop',s)
bad=[l for l in legs if l['cruising_speed']!=[l['expected']]]
print('legs with unexpected cruise:',bad[:4])
