# UAV Telemetry Analysis MVP

MVP for ArduPilot DataFlash `.BIN` log parsing, flight metric calculation, and 3D mission preview.

## Why This Stack

- `FastAPI` gives a fast upload API and a simple way to serve the MVP preview from the same backend.
- `pybind11 + C++` is used for binary ArduPilot log parsing and GPS-to-ENU conversion, where native code is a good fit for throughput and low-level binary decoding.
- `CesiumJS` gives an interactive 3D mission view with camera controls out of the box.
- `Chart.js` is enough for lightweight mission charts inside the single MVP preview file.

## Implemented MVP

- Upload ArduPilot `.BIN` logs.
- Parse available log messages from the binary stream.
- Convert GPS coordinates from WGS-84 into local ENU coordinates relative to takeoff.
- Compute mission metrics:
  - total distance via `haversine`
  - flight duration
  - max altitude gain
  - max horizontal speed from IMU acceleration using trapezoidal integration
  - max vertical speed from IMU acceleration using trapezoidal integration
  - max acceleration
- Show one-file MVP dashboard at `/static/viewer.html`:
  - 3D trajectory
  - trajectory coloring by speed or time
  - metric cards
  - altitude, speed, and acceleration charts
  - warnings / anomalies

## Project Structure

- `backend/src/native/main.cpp` — ArduPilot binary parser and WGS-84 → ENU conversion.
- `backend/src/services/flight_analysis.py` — mission metrics and normalized analysis payload.
- `backend/src/api/router.py` — upload, analyze, and log-preview endpoints.
- `backend/src/static/viewer.html` — single-file MVP preview UI.

## Requirements

### System packages

```bash
sudo apt-get update
sudo apt-get install python3-dev cmake build-essential
```

### Python

- Python 3.12+ is recommended.

## Build Native Module

```bash
cd backend/src/native
cmake -S . -B build
cmake --build build
cd ../../..
```

This produces the `flight_parser` Python extension used by the backend.

## Install Python Dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Optional AI Setup

AI summary is optional. The backend starts without AI credentials.

```bash
cp backend/.env.example backend/.env
```

Set:

```env
GEMINI_MODEL=gemini-2.0-flash
GEMINI_API_KEY=your_key_here
```

## Run

```bash
cd backend/src
python main.py
```

Open:

- API docs: `http://localhost:8000/docs`
- MVP preview: `http://localhost:8000/static/viewer.html`

## Main API

### `POST /api/analyze`

Accepts a `.BIN` file upload and returns:

- `sampling` — estimated GPS / IMU sampling rate
- `metrics` — mission summary values
- `trajectory` — origin, ENU points, and speed series
- `series` — altitude, IMU speed, IMU acceleration
- `summary` — warnings and detected anomalies

### `POST /api/upload`

Low-level parser endpoint that returns available message types and stores parsed data for browsing.

### `GET /api/logs/{filename}/messages`

Preview paginated message data after upload.

## Math Notes

### Distance

Total mission distance is calculated from GPS latitude / longitude pairs with the haversine formula, which is more appropriate than flat-Earth distance for geodetic coordinates.

### Speed From IMU

Velocity is reconstructed from IMU acceleration using trapezoidal integration:

```text
v_i = v_(i-1) + 0.5 * (a_(i-1) + a_i) * dt
```

This is numerically more stable than naive rectangular integration, but IMU-derived velocity still drifts over time because accelerometer bias and attitude errors accumulate.

### WGS-84 → ENU

The pipeline is:

1. Geodetic coordinates `(lat, lon, alt)` on WGS-84
2. Conversion to ECEF
3. Rotation into a local ENU frame relative to the takeoff point

This gives trajectory coordinates in meters from the start point, which is convenient for kinematic analysis and local 3D interpretation.
