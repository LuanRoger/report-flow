# Water Quality Simulator

A simulator for generating water quality measurements for aquaculture ponds. This tool sends realistic water quality data to the ingest service for testing and development purposes.

## Installation

```bash
cd apps/simulator
npm install
```

## Usage

The simulator can run in two modes: constant (real-time) or pre-calculated (historical data).

### Basic Usage

```bash
# Set the ingest service URL
export INGEST_URL=http://localhost:3000/ingest/manual

# Run in constant mode (default)
node src/index.js
```

### Command Line Arguments

| Argument | Description | Default | Required |
|----------|-------------|---------|----------|
| `--mode` | Running mode: `constant` or `precalc` | `constant` | No |
| `--scenario` | Water quality scenario: `ideal`, `normal`, `alerta`, `critico`, or `misto` | `normal` | No |
| `--rate` | Measurements per minute (constant mode) | `60` | No |
| `--from` | Start date/time (precalc mode) | - | Yes for precalc |
| `--to` | End date/time (precalc mode) | - | Yes for precalc |
| `--step-minutes` | Time step between measurements (precalc mode) | `30` | No |
| `--pond-id` | Pond ID to simulate | `1` | No |
| `--cycle-id` | Cycle ID to simulate | `1` | No |
| `--enable-logs` | Enable console logging: `true` or `false` | `false` | No |

### Examples

#### Constant Mode (Real-time Simulation)

```bash
# Simulate normal conditions at 30 measurements per minute
export INGEST_URL=http://localhost:3000/ingest/manual
node src/index.js --mode constant --scenario normal --rate 30 --enable-logs true

# Simulate alert conditions for pond 2, cycle 3
export INGEST_URL=http://localhost:3000/ingest/manual
node src/index.js --mode constant --scenario alerta --pond-id 2 --cycle-id 3 --rate 10
```

#### Pre-calculated Mode (Historical Data)

```bash
# Generate historical data for a specific date range
export INGEST_URL=http://localhost:3000/ingest/manual
node src/index.js --mode precalc --scenario ideal \
  --from "2026-01-01T00:00:00" \
  --to "2026-01-01T23:59:59" \
  --step-minutes 15 \
  --pond-id 1 \
  --cycle-id 1 \
  --enable-logs true

# Generate mixed scenario data for pond 3, cycle 2
export INGEST_URL=http://localhost:3000/ingest/manual
node src/index.js --mode precalc --scenario misto \
  --from "2026-06-01T00:00:00" \
  --to "2026-06-07T23:59:59" \
  --step-minutes 30 \
  --pond-id 3 \
  --cycle-id 2
```

## Scenarios

The simulator supports different water quality scenarios:

### Ideal Conditions
- Temperature: 27-30°C
- pH: 7.5-8.3
- Salinity: 15-25 ppt
- Turbidity: 5-20 NTU
- Dissolved Oxygen: 6-9 mg/L

### Normal Conditions
- Temperature: 26-31°C
- pH: 7.2-8.6
- Salinity: 10-30 ppt
- Turbidity: 10-40 NTU
- Dissolved Oxygen: 5-7 mg/L

### Alert Conditions
- Temperature: 24-33°C
- pH: 6.8-9.0
- Salinity: 5-35 ppt
- Turbidity: 30-80 NTU
- Dissolved Oxygen: 3.5-5 mg/L

### Critical Conditions
- Temperature: 20-36°C
- pH: 6.2-9.5
- Salinity: 0-40 ppt
- Turbidity: 60-200 NTU
- Dissolved Oxygen: 1-3.5 mg/L

### Mixed Conditions
- Randomly selects from all scenarios for each measurement

## Parameters Measured

The simulator generates data for these water quality parameters:

- **Temperature** (°C) - Water temperature
- **pH** (pH units) - Acidity/alkalinity
- **Salinity** (ppt) - Salt concentration
- **Turbidity** (NTU) - Water clarity
- **Dissolved Oxygen** (mg/L) - Oxygen levels

## Data Format

Each measurement sent to the ingest service has this structure:

```json
{
  "pondId": 1,
  "cycleId": 1,
  "recordedAt": "2026-06-07T12:34:56.789Z",
  "parameterCode": "temperature",
  "value": "28.5",
  "unit": "°C",
  "sourceType": "simulator"
}
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `INGEST_URL` | URL of the ingest service endpoint | `http://localhost:3000/ingest/manual` |

## Notes

- The simulator automatically handles unique constraint violations by adding small time offsets to measurements
- All timestamps are in ISO 8601 format with UTC timezone
- Values are sent as strings to match the ingest service schema
- The simulator will run indefinitely in constant mode until manually stopped (Ctrl+C)

## Error Handling

The simulator will log errors to the console if:
- The ingest service URL is not set
- The ingest service is unavailable
- Invalid date ranges are provided
- Network errors occur

Errors do not stop the simulation in constant mode, allowing for robust long-running simulations.
