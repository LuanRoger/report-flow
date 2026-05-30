-- Custom SQL migration file, put your code below! --

CREATE TYPE parameter_code AS ENUM (
    'temperature',
    'ph',
    'salinity',
    'turbidity',
    'dissolved_oxygen'
);

CREATE TABLE measurements (
    id SERIAL,
    farm_id TEXT NOT NULL,
    pond_id TEXT NOT NULL,
    cycle_id TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    parameter_code parameter_code NOT NULL,
    value NUMERIC(12, 4) NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL,
    source_file TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) WITH (
    timescaledb.hypertable,
    timescaledb.partition_column = 'recorded_at'
);

CREATE UNIQUE INDEX measurements_pond_time_idx ON measurements (pond_id, recorded_at);
CREATE UNIQUE INDEX measurements_farm_time_idx ON measurements (farm_id, recorded_at);
CREATE UNIQUE INDEX measurements_param_time_idx ON measurements (parameter_code, recorded_at);
