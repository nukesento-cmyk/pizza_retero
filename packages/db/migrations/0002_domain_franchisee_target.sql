DROP INDEX "domains_one_primary_uq";--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "franchisee_id" uuid;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_franchisee_brand_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_one_primary_v2_uq" ON "domains" USING btree ("brand_id",coalesce("franchisee_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "domains"."is_primary";--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_single_target" CHECK ("domains"."franchisee_id" IS NULL OR "domains"."branch_id" IS NULL);--> statement-breakpoint
-- Policies must account for franchisee-targeted domains.
DROP POLICY domains_select ON domains;
--> statement-breakpoint
DROP POLICY domains_write ON domains;
--> statement-breakpoint
CREATE POLICY domains_select ON domains FOR SELECT TO retero_app USING (
  verified_at IS NOT NULL OR app.has_permission('domain.manage', brand_id, franchisee_id, branch_id)
);
--> statement-breakpoint
CREATE POLICY domains_write ON domains FOR ALL TO retero_app
  USING (app.has_permission('domain.manage', brand_id, franchisee_id, branch_id))
  WITH CHECK (app.has_permission('domain.manage', brand_id, franchisee_id, branch_id));
