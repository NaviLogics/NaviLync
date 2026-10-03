# SITL PX4 v1.17.0: проверка миссий NaviLync

Скрипты прогоняют в PX4 SITL съёмочную миссию, сгенерированную кодом NaviLync. Затем по ulog проверяется:

1. `DO_CHANGE_SPEED` меняет скорость;
2. во время `NAV_DELAY` аппарат стоит;
3. остановка происходит в пределах `NAV_ACC_RAD`, затем разворот на месте;
4. последняя точка принимается с первого захода;
5. какой радиус приёма использует навигатор.

Модель — колёсный `gz_rover_differential`, а не лодка. Поэтому выводы касаются только логики миссии, не инерции.

## Что нужно

- Docker и Python 3 на хосте.
- Python-пакеты: `pip install -r tools/sitl/requirements.txt`.
- Образ `px4io/px4-dev-ros2-gazebo:main-jazzy` (Gazebo Harmonic). В `px4io/px4-dev:v1.17.0` Gazebo нет.

## Подготовка

Все исходники лежат в одном каталоге хоста `SITL_DIR`. Контейнер видит его как `/sitl`.

```bash
# Из корня репозитория NaviLync
export NAVILYNC="$PWD" SITL_DIR=~/sitl
mkdir -p "$SITL_DIR/mirrors/eProsima" && cd "$SITL_DIR"
git clone --depth 1 --branch v1.17.0 --recurse-submodules --shallow-submodules https://github.com/PX4/PX4-Autopilot.git
```

### PX4-OpticalFlow и Micro-CDR — локально

Сборка `px4_sitl` скачивает эти два репозитория из контейнера. Если git в контейнере не может выйти в сеть (например, не доверяет сертификату прокси), клонируйте их на хосте и отдайте контейнеру локально. Доверие TLS в контейнере при этом менять не нужно.

```bash
cd "$SITL_DIR"
git clone https://github.com/PX4/PX4-OpticalFlow.git
git -C PX4-OpticalFlow submodule update --init --recursive
git clone --mirror https://github.com/eProsima/Micro-CDR.git mirrors/eProsima/Micro-CDR.git
# Плагин оптического потока собирается из /sitl/PX4-OpticalFlow вместо скачивания
git -C PX4-Autopilot apply "$NAVILYNC/tools/sitl/px4-optical-flow-local.patch"
```

Патч меняет только `optical_flow.cmake`: `GIT_REPOSITORY` заменён на `SOURCE_DIR`. Это сборка плагина симуляции, на навигатор и ровер он не влияет.

Если git в контейнере выходит в сеть, этот шаг не нужен.

### Контейнер и сборка

```bash
docker run -d --name px4sitl --network host -v "$SITL_DIR":/sitl -w /sitl/PX4-Autopilot \
  px4io/px4-dev-ros2-gazebo:main-jazzy sleep infinity
# Micro-CDR из локального зеркала вместо github.com
docker exec px4sitl bash -c 'git config --global --add safe.directory "*" &&
  git config --global url."/sitl/mirrors/".insteadOf "https://github.com/"'
docker exec px4sitl bash -c 'cd /sitl/PX4-Autopilot && make px4_sitl > /sitl/build.log 2>&1'
```

## Прогон

Из корня репозитория NaviLync:

```bash
# 1. Миссии ровно в том виде, в каком их отдаёт конвертер NaviLync: s5 (галсы через 5 м) и s1 (через 1 м)
SITL_MISSIONS_DIR="$SITL_DIR/missions" yarn vitest run tools/sitl

# 2. PX4 с чистыми параметрами и логами (стирает прежние ulog: сначала скопируйте нужные)
tools/sitl/restart_px4.sh

# 3. Параметры USV, загрузка, ARM, MAV_CMD_MISSION_START(0), журнал событий до «Mission finished»
python3 tools/sitl/run_mission.py "$SITL_DIR/missions/s5.json" "$SITL_DIR/events-s5.json"

# 4. Проверки 1–5 и графики по ulog последнего прогона
ULOG=$(ls -t "$SITL_DIR"/PX4-Autopilot/build/px4_sitl_default/rootfs/log/*/*.ulg | head -1)
python3 tools/sitl/checks.py "$ULOG" "$SITL_DIR/missions/s5.json" "$SITL_DIR/checks-s5.json"
python3 tools/sitl/plots.py "$ULOG" "$SITL_DIR/missions/s5.json" s5 "$SITL_DIR/track-s5.png"
```

- Без переменной `SITL_MISSIONS_DIR` экспорт миссий пропускается, поэтому в CI он не выполняется.
- `run_mission.py ... mode` включает Mission сменой режима, без `MISSION_START`. Так делает пульт или смена режима в QGC. С этим ключом видно, с какого пункта PX4 начинает новую миссию.
- Параметры, которые `run_mission.py` задаёт перед прогоном и подтверждает по `PARAM_VALUE`:
  - `NAV_ACC_RAD = 1.0`;
  - `RO_SPEED_LIM = 2.5`, `RO_DECEL_LIM = 5`, `RO_JERK_LIM = 10`;
  - `RD_TRANS_DRV_TRN = 0.1745`, `RD_TRANS_TRN_DRV = 0.0873`;
  - `PP_LOOKAHD_MIN = 3`, `PP_LOOKAHD_MAX = 5`.

  Значения взяты из параметров испытанной лодки.
- Параметры съёмки в экспорте:
  - `v_line = 1.5`, `v_brake = 0.3`, `t_hold = 3`, `v_transit = 2.0`;
  - дом — точка SITL по умолчанию; другую задают через `HOME_LAT`/`HOME_LON`.
