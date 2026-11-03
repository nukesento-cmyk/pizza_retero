CREATE TABLE "branch_closures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_closures_range" CHECK ("branch_closures"."ends_at" > "branch_closures"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "branch_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_hours_dow" CHECK ("branch_hours"."day_of_week" BETWEEN 0 AND 6),
	CONSTRAINT "branch_hours_nonzero" CHECK ("branch_hours"."opens_at" <> "branch_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "brand_flags" (
	"brand_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"brand_id" uuid,
	"franchisee_id" uuid,
	"branch_id" uuid,
	"token_hash" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_email_lower" CHECK ("staff_invitations"."email" = lower("staff_invitations"."email")),
	CONSTRAINT "staff_invitations_scope_shape" CHECK (CASE "staff_invitations"."scope_type"
        WHEN 'platform'   THEN "staff_invitations"."brand_id" IS NULL AND "staff_invitations"."franchisee_id" IS NULL AND "staff_invitations"."branch_id" IS NULL
        WHEN 'brand'      THEN "staff_invitations"."brand_id" IS NOT NULL AND "staff_invitations"."franchisee_id" IS NULL AND "staff_invitations"."branch_id" IS NULL
        WHEN 'franchisee' THEN "staff_invitations"."brand_id" IS NOT NULL AND "staff_invitations"."franchisee_id" IS NOT NULL AND "staff_invitations"."branch_id" IS NULL
        WHEN 'branch'     THEN "staff_invitations"."brand_id" IS NOT NULL AND "staff_invitations"."franchisee_id" IS NULL AND "staff_invitations"."branch_id" IS NOT NULL
      END)
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "verification_token" text;--> statement-breakpoint
ALTER TABLE "branch_closures" ADD CONSTRAINT "branch_closures_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_flags" ADD CONSTRAINT "brand_flags_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_role_scope_fk" FOREIGN KEY ("role_id","scope_type") REFERENCES "public"."roles"("id","scope_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_closures_branch_idx" ON "branch_closures" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_hours_slot_uq" ON "branch_hours" USING btree ("branch_id","day_of_week","opens_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_flags_uq" ON "brand_flags" USING btree ("brand_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_uq" ON "staff_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_invitations_email_idx" ON "staff_invitations" USING btree (lower("email"));--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON branch_hours, branch_closures, brand_flags TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON staff_invitations TO retero_app;
--> statement-breakpoint
-- System role: trusted server paths without an end-user (D-016). No DELETE on audit.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO retero_system;
--> statement-breakpoint
REVOKE UPDATE ON audit_logs FROM retero_system;
--> statement-breakpoint
ALTER TABLE branch_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_closures ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brand_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Hours and closures are public storefront data.
CREATE POLICY branch_hours_select ON branch_hours FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY branch_hours_write ON branch_hours FOR ALL TO retero_app
  USING (app.has_permission('branch.update', brand_id, NULL, branch_id))
  WITH CHECK (app.has_permission('branch.update', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY branch_closures_select ON branch_closures FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY branch_closures_write ON branch_closures FOR ALL TO retero_app
  USING (app.has_permission('branch.update', brand_id, NULL, branch_id))
  WITH CHECK (app.has_permission('branch.update', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY brand_flags_select ON brand_flags FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY brand_flags_write ON brand_flags FOR ALL TO retero_app
  USING (app.has_permission('brand.settings.update', brand_id, NULL, NULL))
  WITH CHECK (app.has_permission('brand.settings.update', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY staff_invitations_select ON staff_invitations FOR SELECT TO retero_app USING (
  invited_by = app.current_user_id()
  OR app.has_permission('staff.read', brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint
CREATE POLICY staff_invitations_insert ON staff_invitations FOR INSERT TO retero_app WITH CHECK (
  invited_by = app.current_user_id()
  AND accepted_at IS NULL AND revoked_at IS NULL
  AND app.can_grant(role_id, brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint
CREATE POLICY staff_invitations_revoke ON staff_invitations FOR UPDATE TO retero_app
  USING (accepted_at IS NULL AND app.can_grant(role_id, brand_id, franchisee_id, branch_id))
  WITH CHECK (app.can_grant(role_id, brand_id, franchisee_id, branch_id));
--> statement-breakpoint
-- Accept an invitation as the current user. Runs as owner, re-checks that the
-- INVITER may still grant the role (they may have been demoted since), that
-- the accepting user's email matches, and that the invite is live.
CREATE OR REPLACE FUNCTION app.accept_invitation(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := app.current_user_id();
  v_inv staff_invitations%ROWTYPE;
  v_email text;
  v_ok boolean;
  v_membership uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_inv FROM staff_invitations
   WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found or expired' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT lower(email) INTO v_email FROM users WHERE id = v_uid;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'invitation is for a different email' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('app.user_id', v_inv.invited_by::text, true);
  v_ok := app.can_grant(v_inv.role_id, v_inv.brand_id, v_inv.franchisee_id, v_inv.branch_id);
  PERFORM set_config('app.user_id', v_uid::text, true);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'inviter can no longer grant this role' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO memberships (id, user_id, role_id, scope_type, brand_id, franchisee_id, branch_id, granted_by)
  VALUES (gen_random_uuid(), v_uid, v_inv.role_id, v_inv.scope_type, v_inv.brand_id, v_inv.franchisee_id, v_inv.branch_id, v_inv.invited_by)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_membership;

  UPDATE staff_invitations SET accepted_at = now(), accepted_by = v_uid, updated_at = now() WHERE id = v_inv.id;
  INSERT INTO audit_logs (id, actor_user_id, action, brand_id, franchisee_id, branch_id, target_type, target_id, metadata)
  VALUES (gen_random_uuid(), v_uid, 'invitation.accept', v_inv.brand_id, v_inv.franchisee_id, v_inv.branch_id,
          'membership', v_membership::text, jsonb_build_object('invitationId', v_inv.id, 'invitedBy', v_inv.invited_by));
  RETURN v_membership;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.accept_invitation(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.accept_invitation(text) TO retero_app;
