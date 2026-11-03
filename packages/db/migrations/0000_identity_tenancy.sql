CREATE TYPE "public"."scope_type" AS ENUM('platform', 'brand', 'franchisee', 'branch');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164" CHECK ("users"."phone" IS NULL OR "users"."phone" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"franchisee_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"address_line" text,
	"area" text,
	"city" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"offers_delivery" boolean DEFAULT true NOT NULL,
	"offers_collection" boolean DEFAULT true NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "branches_slug_format" CHECK ("branches"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "branches_lat_range" CHECK ("branches"."latitude" IS NULL OR "branches"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "branches_lng_range" CHECK ("branches"."longitude" IS NULL OR "branches"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "brand_settings" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"currency" char(3) DEFAULT 'KES' NOT NULL,
	"timezone" text DEFAULT 'Africa/Nairobi' NOT NULL,
	"whatsapp_number" text,
	"support_email" text,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_settings_wa_e164" CHECK ("brand_settings"."whatsapp_number" IS NULL OR "brand_settings"."whatsapp_number" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_format" CHECK ("brands"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_hostname_format" CHECK ("domains"."hostname" = lower("domains"."hostname") AND "domains"."hostname" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$')
);
--> statement-breakpoint
CREATE TABLE "franchisees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text NOT NULL,
	"kra_pin" text,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchisees_id_brand_uq" UNIQUE("id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"brand_id" uuid,
	"franchisee_id" uuid,
	"branch_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"brand_id" uuid,
	"franchisee_id" uuid,
	"branch_id" uuid,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_scope_shape" CHECK (CASE "memberships"."scope_type"
        WHEN 'platform'   THEN "memberships"."brand_id" IS NULL AND "memberships"."franchisee_id" IS NULL AND "memberships"."branch_id" IS NULL
        WHEN 'brand'      THEN "memberships"."brand_id" IS NOT NULL AND "memberships"."franchisee_id" IS NULL AND "memberships"."branch_id" IS NULL
        WHEN 'franchisee' THEN "memberships"."brand_id" IS NOT NULL AND "memberships"."franchisee_id" IS NOT NULL AND "memberships"."branch_id" IS NULL
        WHEN 'branch'     THEN "memberships"."brand_id" IS NOT NULL AND "memberships"."franchisee_id" IS NULL AND "memberships"."branch_id" IS NOT NULL
      END),
	CONSTRAINT "memberships_revoke_pair" CHECK (("memberships"."revoked_at" IS NULL) = ("memberships"."revoked_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_brand_uq" UNIQUE NULLS NOT DISTINCT("key","brand_id"),
	CONSTRAINT "roles_id_scope_uq" UNIQUE("id","scope_type"),
	CONSTRAINT "roles_rank_range" CHECK ("roles"."rank" BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_franchisee_brand_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_brand_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_settings" ADD CONSTRAINT "brand_settings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_brand_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_branch_brand_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchisees" ADD CONSTRAINT "franchisees_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_franchisee_id_franchisees_id_fk" FOREIGN KEY ("franchisee_id") REFERENCES "public"."franchisees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_scope_fk" FOREIGN KEY ("role_id","scope_type") REFERENCES "public"."roles"("id","scope_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_brand_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_franchisee_brand_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_branch_brand_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_brand_slug_uq" ON "branches" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "branches_franchisee_idx" ON "branches" USING btree ("franchisee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uq" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_hostname_uq" ON "domains" USING btree ("hostname");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_one_primary_uq" ON "domains" USING btree ("brand_id",coalesce("branch_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "domains"."is_primary";--> statement-breakpoint
CREATE INDEX "franchisees_brand_idx" ON "franchisees" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "audit_logs_brand_time_idx" ON "audit_logs" USING btree ("brand_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_branch_time_idx" ON "audit_logs" USING btree ("branch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_active_idx" ON "memberships" USING btree ("user_id") WHERE "memberships"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "memberships_brand_idx" ON "memberships" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "memberships_branch_idx" ON "memberships" USING btree ("branch_id");