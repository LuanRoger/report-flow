-- Custom SQL migration file, put your code below! --

-- Seed data for ponds table
INSERT INTO ponds (id, cycle) VALUES (1, 1);

-- Seed data for pond_cycles table related to the pond
INSERT INTO pond_cycles (id, pond_id, start_date) VALUES
(1, 1, '2026-07-01');
