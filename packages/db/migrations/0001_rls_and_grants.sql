-- ============================================================================
-- 0001 — Row Level Security, helper functions, grants
--
-- Model (docs/ARCHITECTURE.md §5, B5):
--   * retero_owner owns everything and bypasses RLS (no FORCE). Migrations only.
--   * retero_app is the runtime role. It is subject to every policy below.
--   * withActor() sets app.user_id per transaction from a server-verified session.
--   * Helpers are SECURITY DEFINER (run as owner) so they can read memberships
--     without recursing into memberships' own policies.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO retero_app;
--> statement-breakpoint

-- One active membership per (user, role, scope target).
CREATE UNIQUE INDEX memberships_active_uq
  ON memberships (user_id, role_id, brand_id, franchisee_id, branch_id) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Does the current user hold `p_key` at a scope covering the target?
-- Target = most specific non-null of (branch, franchisee, brand); ancestors are
-- resolved from the database when the row exists, so callers cannot lie about
-- them. For INSERTs (row not yet visible) the supplied ancestors are used; the
-- composite foreign keys guarantee they are consistent.
CREATE OR REPLACE FUNCTION app.has_permission(p_key text, p_brand uuid, p_franchisee uuid, p_branch uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_brand uuid := p_brand;
  v_fr    uuid := p_franchisee;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF p_branch IS NOT NULL THEN
    SELECT b.brand_id, b.franchisee_id INTO v_brand, v_fr FROM branches b WHERE b.id = p_branch;
    IF NOT FOUND THEN
      v_brand := p_brand;
      v_fr := p_franchisee;
    END IF;
  ELSIF p_franchisee IS NOT NULL THEN
    SELECT f.brand_id INTO v_brand FROM franchisees f WHERE f.id = p_franchisee;
    IF NOT FOUND THEN
      v_brand := p_brand;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM memberships m
    JOIN role_permissions rp ON rp.role_id = m.role_id
    WHERE m.user_id = v_uid
      AND m.revoked_at IS NULL
      AND rp.permission_key = p_key
      AND (
           m.scope_type = 'platform'
        OR (m.scope_type = 'brand'      AND v_brand IS NOT NULL AND m.brand_id = v_brand)
        OR (m.scope_type = 'franchisee' AND v_fr    IS NOT NULL AND m.franchisee_id = v_fr)
        OR (m.scope_type = 'branch'     AND p_branch IS NOT NULL AND m.branch_id = p_branch)
      )
  );
END;
$$;
--> statement-breakpoint

-- Highest role rank the current user holds at a scope covering the target.
CREATE OR REPLACE FUNCTION app.max_rank_covering(p_brand uuid, p_franchisee uuid, p_branch uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid   uuid := app.current_user_id();
  v_brand uuid := p_brand;
  v_fr    uuid := p_franchisee;
  v_rank  integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;
  IF p_branch IS NOT NULL THEN
    SELECT b.brand_id, b.franchisee_id INTO v_brand, v_fr FROM branches b WHERE b.id = p_branch;
  ELSIF p_franchisee IS NOT NULL THEN
    SELECT f.brand_id INTO v_brand FROM franchisees f WHERE f.id = p_franchisee;
  END IF;

  SELECT coalesce(max(r.rank), 0) INTO v_rank
  FROM memberships m
  JOIN roles r ON r.id = m.role_id
  WHERE m.user_id = v_uid
    AND m.revoked_at IS NULL
    AND (
         m.scope_type = 'platform'
      OR (m.scope_type = 'brand'      AND v_brand IS NOT NULL AND m.brand_id = v_brand)
      OR (m.scope_type = 'franchisee' AND v_fr    IS NOT NULL AND m.franchisee_id = v_fr)
      OR (m.scope_type = 'branch'     AND p_branch IS NOT NULL AND m.branch_id = p_branch)
    );
  RETURN v_rank;
END;
$$;
--> statement-breakpoint

-- May the current user grant/revoke `p_role` at the target scope?
-- Requires staff.invite there AND a strictly higher rank (no escalation, no peers).
CREATE OR REPLACE FUNCTION app.can_grant(p_role uuid, p_brand uuid, p_franchisee uuid, p_branch uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT app.has_permission('staff.invite', p_brand, p_franchisee, p_branch)
     AND (SELECT r.rank FROM roles r WHERE r.id = p_role) < app.max_rank_covering(p_brand, p_franchisee, p_branch)
$$;
--> statement-breakpoint

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO retero_app;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Grants (least privilege). No hard deletes on tenant/identity tables.
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON users, brands, brand_settings, franchisees, branches, memberships TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON domains TO retero_app;
--> statement-breakpoint
GRANT SELECT ON permissions, roles, role_permissions TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO retero_app;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brands           ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brand_settings   ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE franchisees      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches         ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE domains          ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE permissions      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE roles            ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships      ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- users: yourself, or people whose membership you are allowed to see.
CREATE POLICY users_select ON users FOR SELECT TO retero_app USING (
  id = app.current_user_id()
  OR EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = users.id
      AND app.has_permission('staff.read', m.brand_id, m.franchisee_id, m.branch_id)
  )
);
--> statement-breakpoint
CREATE POLICY users_insert_self ON users FOR INSERT TO retero_app WITH CHECK (id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY users_update_self ON users FOR UPDATE TO retero_app
  USING (id = app.current_user_id()) WITH CHECK (id = app.current_user_id());
--> statement-breakpoint

-- Reference data: readable by everyone using the app role.
CREATE POLICY permissions_read ON permissions FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY roles_read ON roles FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT TO retero_app USING (true);
--> statement-breakpoint

-- brands: active brands are public storefront data; others need membership.
CREATE POLICY brands_select ON brands FOR SELECT TO retero_app USING (
  status = 'active' OR app.has_permission('brand.read', id, NULL, NULL)
);
--> statement-breakpoint
CREATE POLICY brands_insert ON brands FOR INSERT TO retero_app
  WITH CHECK (app.has_permission('brand.create', NULL, NULL, NULL));
--> statement-breakpoint
CREATE POLICY brands_update ON brands FOR UPDATE TO retero_app
  USING (app.has_permission('brand.update', id, NULL, NULL))
  WITH CHECK (app.has_permission('brand.update', id, NULL, NULL));
--> statement-breakpoint

-- brand_settings: public read (theme, WhatsApp number shown on storefront).
CREATE POLICY brand_settings_select ON brand_settings FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY brand_settings_insert ON brand_settings FOR INSERT TO retero_app
  WITH CHECK (app.has_permission('brand.settings.update', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY brand_settings_update ON brand_settings FOR UPDATE TO retero_app
  USING (app.has_permission('brand.settings.update', brand_id, NULL, NULL))
  WITH CHECK (app.has_permission('brand.settings.update', brand_id, NULL, NULL));
--> statement-breakpoint

-- franchisees: private business records. Never public.
CREATE POLICY franchisees_select ON franchisees FOR SELECT TO retero_app
  USING (app.has_permission('franchisee.read', brand_id, id, NULL));
--> statement-breakpoint
CREATE POLICY franchisees_insert ON franchisees FOR INSERT TO retero_app
  WITH CHECK (app.has_permission('franchisee.create', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY franchisees_update ON franchisees FOR UPDATE TO retero_app
  USING (app.has_permission('franchisee.update', brand_id, id, NULL))
  WITH CHECK (app.has_permission('franchisee.update', brand_id, id, NULL));
--> statement-breakpoint

-- branches: active branches are public (address, phone); others need membership.
CREATE POLICY branches_select ON branches FOR SELECT TO retero_app USING (
  status = 'active' OR app.has_permission('branch.read', brand_id, franchisee_id, id)
);
--> statement-breakpoint
CREATE POLICY branches_insert ON branches FOR INSERT TO retero_app
  WITH CHECK (app.has_permission('branch.create', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY branches_update ON branches FOR UPDATE TO retero_app
  USING (app.has_permission('branch.update', brand_id, franchisee_id, id))
  WITH CHECK (app.has_permission('branch.update', brand_id, franchisee_id, id));
--> statement-breakpoint

-- domains: verified domains are public routing data.
CREATE POLICY domains_select ON domains FOR SELECT TO retero_app USING (
  verified_at IS NOT NULL OR app.has_permission('domain.manage', brand_id, NULL, branch_id)
);
--> statement-breakpoint
CREATE POLICY domains_write ON domains FOR ALL TO retero_app
  USING (app.has_permission('domain.manage', brand_id, NULL, branch_id))
  WITH CHECK (app.has_permission('domain.manage', brand_id, NULL, branch_id));
--> statement-breakpoint

-- memberships: your own, plus those you may administer.
CREATE POLICY memberships_select ON memberships FOR SELECT TO retero_app USING (
  user_id = app.current_user_id()
  OR app.has_permission('staff.read', brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint
CREATE POLICY memberships_insert ON memberships FOR INSERT TO retero_app WITH CHECK (
  revoked_at IS NULL
  AND granted_by = app.current_user_id()
  AND app.can_grant(role_id, brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint
-- Only revocation is an allowed update; scope/role changes require a new grant.
CREATE POLICY memberships_revoke ON memberships FOR UPDATE TO retero_app
  USING (app.can_grant(role_id, brand_id, franchisee_id, branch_id))
  WITH CHECK (
    revoked_by = app.current_user_id()
    AND app.can_grant(role_id, brand_id, franchisee_id, branch_id)
  );
--> statement-breakpoint

-- audit_logs: insert as yourself (or system = NULL); read with audit.read.
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO retero_app WITH CHECK (
  actor_user_id IS NULL OR actor_user_id = app.current_user_id()
);
--> statement-breakpoint
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO retero_app USING (
  app.has_permission('audit.read', brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint

-- Immutable scope on memberships (defence against UPDATE ... SET branch_id = ...).
CREATE OR REPLACE FUNCTION app.memberships_immutable_scope() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.user_id       IS DISTINCT FROM OLD.user_id
  OR NEW.role_id       IS DISTINCT FROM OLD.role_id
  OR NEW.scope_type    IS DISTINCT FROM OLD.scope_type
  OR NEW.brand_id      IS DISTINCT FROM OLD.brand_id
  OR NEW.franchisee_id IS DISTINCT FROM OLD.franchisee_id
  OR NEW.branch_id     IS DISTINCT FROM OLD.branch_id
  OR NEW.granted_by    IS DISTINCT FROM OLD.granted_by
  OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'memberships are immutable except for a single revocation'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER memberships_immutable_scope
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION app.memberships_immutable_scope();
--> statement-breakpoint

-- Branch tenancy keys are immutable (moving a branch between franchisees is a
-- business process, not an UPDATE).
CREATE OR REPLACE FUNCTION app.branches_immutable_tenancy() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.brand_id IS DISTINCT FROM OLD.brand_id OR NEW.franchisee_id IS DISTINCT FROM OLD.franchisee_id THEN
    RAISE EXCEPTION 'branch brand/franchisee cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER branches_immutable_tenancy
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION app.branches_immutable_tenancy();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.franchisees_immutable_brand() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.brand_id IS DISTINCT FROM OLD.brand_id THEN
    RAISE EXCEPTION 'franchisee brand cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER franchisees_immutable_brand
  BEFORE UPDATE ON franchisees
  FOR EACH ROW EXECUTE FUNCTION app.franchisees_immutable_brand();
