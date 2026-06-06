-- Custom SQL migration file, put your code below! --

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create ENUM types
CREATE TYPE parameter_code AS ENUM (
    'temperature',
    'ph',
    'salinity',
    'turbidity',
    'dissolvedOxygen'
);

CREATE TYPE unit_code AS ENUM (
    '°C',
    'pH',
    'ppt',
    'NTU',
    'mg/L'
);

-- Create ponds table
CREATE TABLE ponds (
    id SERIAL PRIMARY KEY,
    cycle INTEGER
);

-- Create pond_cycles table
CREATE TABLE pond_cycles (
    id SERIAL PRIMARY KEY,
    pond_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    harvest_date DATE
);

-- Create measurements table as a hypertable for TimescaleDB
CREATE TABLE measurements (
    id SERIAL,
    pond_id INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    parameter_code parameter_code NOT NULL,
    value NUMERIC(12, 4) NOT NULL,
    unit unit_code NOT NULL,
    source_type TEXT NOT NULL,
    source_file TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, recorded_at)
) WITH (
    timescaledb.hypertable,
    timescaledb.partition_column = 'recorded_at'
);

-- Create analysis_results table
CREATE TABLE analysis_results (
    id SERIAL PRIMARY KEY,
    pond_id INTEGER NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    final_score REAL NOT NULL,
    temperature_score REAL NOT NULL,
    ph_score REAL NOT NULL,
    salinity_score REAL NOT NULL,
    dissolved_oxygen_score REAL NOT NULL,
    turbidity_score REAL NOT NULL,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create analysis_embeddings table for RAG (Retrieval-Augmented Generation)
CREATE TABLE analysis_embeddings (
    id SERIAL PRIMARY KEY,
    analysis_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR MEASUREMENTS TABLE (TimescaleDB)
-- ============================================

-- Unique indexes for measurements
CREATE UNIQUE INDEX measurements_pond_time_idx ON measurements (pond_id, recorded_at);
CREATE UNIQUE INDEX measurements_param_time_idx ON measurements (parameter_code, recorded_at);

-- Performance indexes for common query patterns
CREATE INDEX measurements_pond_idx ON measurements (pond_id);
CREATE INDEX measurements_parameter_idx ON measurements (parameter_code);
CREATE INDEX measurements_source_type_idx ON measurements (source_type);
CREATE INDEX measurements_created_at_idx ON measurements (created_at);

-- Composite indexes for common query patterns
CREATE INDEX measurements_pond_parameter_idx ON measurements (pond_id, parameter_code);
CREATE INDEX measurements_pond_recorded_at_idx ON measurements (pond_id, recorded_at);
CREATE INDEX measurements_parameter_recorded_at_idx ON measurements (parameter_code, recorded_at);

-- ============================================
-- INDEXES FOR PONDS TABLE
-- ============================================
CREATE INDEX ponds_cycle_idx ON ponds (cycle);

-- ============================================
-- INDEXES FOR POND_CYCLES TABLE
-- ============================================
CREATE INDEX pond_cycles_pond_idx ON pond_cycles (pond_id);
CREATE INDEX pond_cycles_start_date_idx ON pond_cycles (start_date);
CREATE INDEX pond_cycles_end_date_idx ON pond_cycles (end_date);
CREATE INDEX pond_cycles_harvest_date_idx ON pond_cycles (harvest_date);

-- Composite index for date range queries
CREATE INDEX pond_cycles_date_range_idx ON pond_cycles (pond_id, start_date, end_date);

-- ============================================
-- INDEXES FOR ANALYSIS_RESULTS TABLE
-- ============================================
CREATE INDEX analysis_results_pond_idx ON analysis_results (pond_id);
CREATE INDEX analysis_results_start_time_idx ON analysis_results (start_time);
CREATE INDEX analysis_results_end_time_idx ON analysis_results (end_time);
CREATE INDEX analysis_results_created_at_idx ON analysis_results (created_at);

-- Composite indexes for time-based queries
CREATE INDEX analysis_results_pond_time_idx ON analysis_results (pond_id, start_time, end_time);
CREATE INDEX analysis_results_time_range_idx ON analysis_results (start_time, end_time);

-- Indexes for score-based queries
CREATE INDEX analysis_results_final_score_idx ON analysis_results (final_score);

-- ============================================
-- INDEXES FOR ANALYSIS_EMBEDDINGS TABLE
-- ============================================

-- HNSW index for efficient vector similarity search (for RAG)
CREATE INDEX analysis_embeddings_hnsw_idx ON analysis_embeddings USING hnsw (embedding vector_cosine_ops);

-- Standard B-tree indexes for filtering
CREATE INDEX analysis_embeddings_analysis_idx ON analysis_embeddings (analysis_id);
CREATE INDEX analysis_embeddings_created_at_idx ON analysis_embeddings (created_at);

-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================

-- Add foreign keys after all tables are created
ALTER TABLE measurements ADD CONSTRAINT fk_measurements_pond 
    FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE CASCADE;

ALTER TABLE pond_cycles ADD CONSTRAINT fk_pond_cycles_pond 
    FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE CASCADE;

ALTER TABLE analysis_results ADD CONSTRAINT fk_analysis_results_pond 
    FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE CASCADE;

ALTER TABLE analysis_embeddings ADD CONSTRAINT fk_analysis_embeddings_analysis 
    FOREIGN KEY (analysis_id) REFERENCES analysis_results(id) ON DELETE CASCADE;
