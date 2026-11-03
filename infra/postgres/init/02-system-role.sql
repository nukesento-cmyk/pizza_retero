-- System role: used ONLY by trusted server paths that have no end-user
-- identity (payment callbacks, guest checkout engine, background worker).
-- BYPASSRLS, but no DDL and only the table grants given in migrations.
-- Production: create with a strong password from the secrets manager.
CREATE ROLE retero_system LOGIN PASSWORD 'retero_system_dev' BYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE retero TO retero_system;
GRANT CONNECT ON DATABASE retero_test TO retero_system;
\connect retero
GRANT USAGE ON SCHEMA public TO retero_system;
\connect retero_test
GRANT USAGE ON SCHEMA public TO retero_system;
