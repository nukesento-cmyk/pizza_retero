-- Bootstrap roles (runs once, on an empty data volume).
-- Production: run the equivalent once per environment with real passwords
-- from the secrets manager. See docs/runbooks/database.md.

CREATE ROLE retero_owner LOGIN PASSWORD 'retero_owner_dev' NOBYPASSRLS;
CREATE ROLE retero_app   LOGIN PASSWORD 'retero_app_dev'   NOBYPASSRLS NOCREATEDB NOCREATEROLE;

ALTER DATABASE retero OWNER TO retero_owner;
GRANT CONNECT ON DATABASE retero TO retero_app;

\connect retero
ALTER SCHEMA public OWNER TO retero_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO retero_app;

-- Separate test database used by Vitest (same roles, wiped per run via migrations on a fresh schema).
CREATE DATABASE retero_test OWNER retero_owner;
GRANT CONNECT ON DATABASE retero_test TO retero_app;
\connect retero_test
ALTER SCHEMA public OWNER TO retero_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO retero_app;
