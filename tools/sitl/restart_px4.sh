#!/bin/bash
# Restart PX4 SITL with the differential rover, headless, with a fresh log directory and default parameters
# SITL_DIR: the host directory mounted in the container as /sitl
set -e
: "${SITL_DIR:?set SITL_DIR to the host directory mounted as /sitl}"
CONTAINER="${CONTAINER:-px4sitl}"
docker exec "$CONTAINER" bash -c 'pkill -f "bin/px4"; pkill -f "gz sim"; sleep 3' || true
rm -f "$SITL_DIR/px4.log"
# -d: without the interactive shell, which floods the log when stdin is not a terminal
docker exec -d "$CONTAINER" bash -c 'cd /sitl/PX4-Autopilot && rm -rf build/px4_sitl_default/rootfs/log build/px4_sitl_default/rootfs/parameters*.bson && HEADLESS=1 PX4_GZ_WORLD=default PX4_SYS_AUTOSTART=50000 PX4_SIM_MODEL=gz_rover_differential ./build/px4_sitl_default/bin/px4 -d > /sitl/px4.log 2>&1'
until grep -q "Startup script returned" "$SITL_DIR/px4.log" 2>/dev/null; do sleep 2; done
until grep -q "home set" "$SITL_DIR/px4.log" 2>/dev/null; do sleep 2; done
echo "px4 up"
