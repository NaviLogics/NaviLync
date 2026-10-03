"""Upload a NaviLync-generated mission to PX4 SITL, set the USV parameters, run it in AUTO.MISSION and record events.

Usage: python3 run_mission.py <mission json> <events json> [start|mode] [stop after, s]
  start - MAV_CMD_MISSION_START(0), as the NaviLync button does (default)
  mode  - switch to Mission without MISSION_START, as the RC or a mode change does
"""
import json, sys, time
from pymavlink import mavutil

mission_file, events_file = sys.argv[1], sys.argv[2]
MODE_START = len(sys.argv) > 3 and sys.argv[3] == 'mode'
STOP_AFTER_S = float(sys.argv[4]) if len(sys.argv) > 4 else None
PARAMS = {  # usv_tested.params values that act on the mission
    'NAV_ACC_RAD': 1.0, 'RO_SPEED_LIM': 2.5, 'RO_DECEL_LIM': 5.0, 'RO_JERK_LIM': 10.0,
    'RD_TRANS_DRV_TRN': 0.1745, 'RD_TRANS_TRN_DRV': 0.0873, 'PP_LOOKAHD_MIN': 3.0, 'PP_LOOKAHD_MAX': 5.0,
}
mav = mavutil.mavlink_connection('udpin:0.0.0.0:14550', source_system=255)
mav.wait_heartbeat(timeout=60)
print('heartbeat from', mav.target_system, mav.target_component, flush=True)
events = []
t0 = time.time()

def log(kind, **kw):
    kw.update(kind=kind, t=round(time.time() - t0, 2))
    events.append(kw)
    print(json.dumps(kw), flush=True)

def gcs_heartbeat():
    mav.mav.heartbeat_send(mavutil.mavlink.MAV_TYPE_GCS, mavutil.mavlink.MAV_AUTOPILOT_INVALID, 0, 0, 0)

for name, value in PARAMS.items():
    for _ in range(5):
        mav.mav.param_set_send(mav.target_system, mav.target_component, name.encode(), value, mavutil.mavlink.MAV_PARAM_TYPE_REAL32)
        m = mav.recv_match(type='PARAM_VALUE', blocking=True, timeout=2)
        while m and m.param_id != name:
            m = mav.recv_match(type='PARAM_VALUE', blocking=True, timeout=2)
        if m and abs(m.param_value - value) < 1e-4:
            log('param', name=name, value=m.param_value)
            break
    else:
        sys.exit(f'param {name} not set')

mission = json.load(open(mission_file))
items = mission['items']
FRAMES = {'MAV_FRAME_MISSION': mavutil.mavlink.MAV_FRAME_MISSION, 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT': mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT}
mav.mav.mission_count_send(mav.target_system, mav.target_component, len(items), mavutil.mavlink.MAV_MISSION_TYPE_MISSION)
while True:
    m = mav.recv_match(type=['MISSION_REQUEST_INT', 'MISSION_REQUEST', 'MISSION_ACK'], blocking=True, timeout=10)
    if m is None:
        sys.exit('mission upload timed out')
    if m.get_type() == 'MISSION_ACK':
        log('mission_ack', result=m.type, count=len(items))
        if m.type != 0:
            sys.exit(f'mission rejected: {m.type}')
        break
    it = items[m.seq]
    mav.mav.mission_item_int_send(mav.target_system, mav.target_component, it['seq'], FRAMES[it['frame']],
                                  getattr(mavutil.mavlink, it['command']), it.get('current', 0), 1, *it['params'], it['x'], it['y'], it['z'],
                                  mavutil.mavlink.MAV_MISSION_TYPE_MISSION)

# Wait for a position, then arm and switch to AUTO.MISSION (custom main mode 4, sub mode 4)
while True:
    gcs_heartbeat()
    m = mav.recv_match(type='GLOBAL_POSITION_INT', blocking=True, timeout=2)
    if m and m.lat != 0:
        log('position', lat=m.lat / 1e7, lon=m.lon / 1e7)
        break
for _ in range(30):
    gcs_heartbeat()
    mav.mav.command_long_send(mav.target_system, mav.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
    hb = mav.recv_match(type='HEARTBEAT', blocking=True, timeout=2)
    if hb and hb.get_srcSystem() == mav.target_system and hb.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED:
        log('armed', custom_mode=hb.custom_mode)
        break
    time.sleep(1)
else:
    sys.exit('could not arm')

if MODE_START:
    for _ in range(5):
        mav.mav.command_long_send(mav.target_system, mav.target_component, mavutil.mavlink.MAV_CMD_DO_SET_MODE, 0,
                                  mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4, 4, 0, 0, 0, 0)
        hb = mav.recv_match(type='HEARTBEAT', blocking=True, timeout=2)
        if hb and hb.get_srcSystem() == mav.target_system and hb.custom_mode == 67371008:
            log('mode_mission', custom_mode=hb.custom_mode); break
else:
    mav.mav.command_long_send(mav.target_system, mav.target_component, mavutil.mavlink.MAV_CMD_MISSION_START, 0, 0, 0, 0, 0, 0, 0, 0)
    ack = mav.recv_match(type='COMMAND_ACK', condition='COMMAND_ACK.command==300', blocking=True, timeout=5)
    log('mission_start', result=None if ack is None else ack.result)
last_seq = len(items) - 1
deadline = time.time() + 1200
last_hb = 0
t_go = time.time()
while time.time() < deadline and (STOP_AFTER_S is None or time.time() - t_go < STOP_AFTER_S):
    if time.time() - last_hb > 1:
        gcs_heartbeat(); last_hb = time.time()
    m = mav.recv_match(type=['MISSION_ITEM_REACHED', 'MISSION_CURRENT', 'STATUSTEXT', 'HEARTBEAT'], blocking=True, timeout=1)
    if m is None:
        continue
    t = m.get_type()
    if t == 'MISSION_ITEM_REACHED':
        log('reached', seq=m.seq, item=items[m.seq]['command'], point=items[m.seq]['kind'])
    elif t == 'MISSION_CURRENT':
        if not events or events[-1].get('kind') != 'current' or events[-1]['seq'] != m.seq:
            log('current', seq=m.seq, state=getattr(m, 'mission_state', None))
        if getattr(m, 'mission_state', 0) == 5:  # MISSION_STATE_COMPLETE
            log('complete'); break
    elif t == 'STATUSTEXT':
        log('status', text=m.text)
    elif t == 'HEARTBEAT' and m.get_srcSystem() == mav.target_system and not (m.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED):
        log('disarmed'); break
time.sleep(3)
mav.mav.command_long_send(mav.target_system, mav.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 21196, 0, 0, 0, 0, 0)
json.dump(events, open(events_file, 'w'), indent=1)
