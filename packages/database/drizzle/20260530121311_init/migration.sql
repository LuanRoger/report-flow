-- Custom SQL migration file, put your code below! --

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TYPE parameter_code AS ENUM (
    'temperature',
    'ph',
    'salinity',
    'turbidity',
    'dissolvedOxygen'
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

-- Analysis embeddings table for RAG (Retrieval-Augmented Generation)
-- Stores embeddings of analysis results to enable conversational interaction
CREATE TABLE analysis_embeddings (
    id SERIAL PRIMARY KEY,
    pond_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    embedding vector(1024) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create HNSW index for efficient vector similarity search
-- This enables fast nearest-neighbor searches for RAG
CREATE INDEX analysis_embeddings_hnsw_idx ON analysis_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create standard B-tree indexes for filtering
CREATE INDEX analysis_embeddings_pond_idx ON analysis_embeddings (pond_id);
CREATE INDEX analysis_embeddings_analysis_idx ON analysis_embeddings (analysis_id);
CREATE INDEX analysis_embeddings_created_idx ON analysis_embeddings (created_at);
