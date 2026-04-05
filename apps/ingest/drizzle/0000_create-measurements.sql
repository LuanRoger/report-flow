-- Custom SQL migration file, put your code below! --
CREATE TABLE measurements (
    recorded_at      TIMESTAMPTZ      NOT NULL,
    farm_id          TEXT             NOT NULL,
    pond_id          TEXT             NOT NULL,
    cycle_id         TEXT             NOT NULL,
    parameter_code   TEXT             NOT NULL,
    value            DOUBLE PRECISION NOT NULL,
    unit             TEXT             NOT NULL DEFAULT '',
    source_type      TEXT             NOT NULL,
    source_file      TEXT             NULL,
    id               TEXT             NOT NULL
) WITH (
    tsdb.hypertable,
    tsdb.segmentby = 'pond_id',
    tsdb.orderby = 'recorded_at DESC'
);

CREATE UNIQUE INDEX measurements_id_uidx
    ON measurements (id);

CREATE INDEX measurements_farm_time_idx
    ON measurements (farm_id, recorded_at DESC);

CREATE INDEX measurements_cycle_time_idx
    ON measurements (cycle_id, recorded_at DESC);

CREATE INDEX measurements_param_time_idx
    ON measurements (parameter_code, recorded_at DESC);
