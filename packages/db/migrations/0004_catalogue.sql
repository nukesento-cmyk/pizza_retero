CREATE TYPE "public"."catalogue_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ingredient_unit" AS ENUM('g', 'ml', 'each');--> statement-breakpoint
CREATE TYPE "public"."option_group_kind" AS ENUM('crust', 'sauce', 'cheese', 'topping', 'extra');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('pizza', 'side', 'drink', 'dessert');--> statement-breakpoint
CREATE TABLE "allergens" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_option_overrides" (
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"price_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_option_overrides_branch_id_option_id_pk" PRIMARY KEY("branch_id","option_id"),
	CONSTRAINT "boo_price_nonneg" CHECK ("branch_option_overrides"."price_minor" IS NULL OR "branch_option_overrides"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "branch_products" (
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_products_branch_id_product_id_pk" PRIMARY KEY("branch_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "branch_variant_prices" (
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"price_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_variant_prices_branch_id_variant_id_pk" PRIMARY KEY("branch_id","variant_id"),
	CONSTRAINT "bvp_price_pos" CHECK ("branch_variant_prices"."price_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "ingredient_allergens" (
	"brand_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"allergen_code" text NOT NULL,
	CONSTRAINT "ingredient_allergens_ingredient_id_allergen_code_pk" PRIMARY KEY("ingredient_id","allergen_code")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" "ingredient_unit" DEFAULT 'g' NOT NULL,
	"is_vegetarian" boolean DEFAULT true NOT NULL,
	"is_vegan" boolean DEFAULT false NOT NULL,
	"status" "catalogue_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "ingredients_vegan_implies_veg" CHECK (NOT "ingredients"."is_vegan" OR "ingredients"."is_vegetarian")
);
--> statement-breakpoint
CREATE TABLE "option_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "option_group_kind" NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_groups_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "option_groups_bounds" CHECK ("option_groups"."min_select" >= 0 AND "option_groups"."max_select" >= 1 AND "option_groups"."min_select" <= "option_groups"."max_select")
);
--> statement-breakpoint
CREATE TABLE "option_sizes" (
	"brand_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"size_code" text NOT NULL,
	"price_minor" bigint,
	"portion_qty" numeric(12, 3),
	CONSTRAINT "option_sizes_option_id_size_code_pk" PRIMARY KEY("option_id","size_code"),
	CONSTRAINT "option_sizes_price_nonneg" CHECK ("option_sizes"."price_minor" IS NULL OR "option_sizes"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_minor" bigint DEFAULT 0 NOT NULL,
	"ingredient_id" uuid,
	"visual_key" text,
	"color" text,
	"status" "catalogue_status" DEFAULT 'active' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "options_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "options_price_nonneg" CHECK ("options"."price_minor" >= 0),
	CONSTRAINT "options_color_hex" CHECK ("options"."color" IS NULL OR "options"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "product_default_options" (
	"brand_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	CONSTRAINT "product_default_options_product_id_option_id_pk" PRIMARY KEY("product_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "product_option_groups" (
	"brand_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"min_select" integer,
	"max_select" integer,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_option_groups_product_id_group_id_pk" PRIMARY KEY("product_id","group_id"),
	CONSTRAINT "pog_bounds" CHECK (("product_option_groups"."min_select" IS NULL OR "product_option_groups"."min_select" >= 0) AND ("product_option_groups"."max_select" IS NULL OR "product_option_groups"."max_select" >= 1))
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"size_code" text,
	"price_minor" bigint NOT NULL,
	"min_price_minor" bigint,
	"max_price_minor" bigint,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "catalogue_status" DEFAULT 'active' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "product_variants_price_pos" CHECK ("product_variants"."price_minor" > 0),
	CONSTRAINT "product_variants_bounds" CHECK (("product_variants"."min_price_minor" IS NULL OR "product_variants"."min_price_minor" <= "product_variants"."price_minor") AND ("product_variants"."max_price_minor" IS NULL OR "product_variants"."max_price_minor" >= "product_variants"."price_minor"))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "product_kind" DEFAULT 'pizza' NOT NULL,
	"builder_enabled" boolean DEFAULT false NOT NULL,
	"image_key" text,
	"status" "catalogue_status" DEFAULT 'draft' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "variant_recipes" (
	"brand_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	CONSTRAINT "variant_recipes_variant_id_ingredient_id_pk" PRIMARY KEY("variant_id","ingredient_id"),
	CONSTRAINT "variant_recipes_qty_pos" CHECK ("variant_recipes"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "branch_option_overrides" ADD CONSTRAINT "boo_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_option_overrides" ADD CONSTRAINT "boo_option_fk" FOREIGN KEY ("option_id","brand_id") REFERENCES "public"."options"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_products_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_products_product_fk" FOREIGN KEY ("product_id","brand_id") REFERENCES "public"."products"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_variant_prices" ADD CONSTRAINT "bvp_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_variant_prices" ADD CONSTRAINT "bvp_variant_fk" FOREIGN KEY ("variant_id","brand_id") REFERENCES "public"."product_variants"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergen_code_allergens_code_fk" FOREIGN KEY ("allergen_code") REFERENCES "public"."allergens"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ing_fk" FOREIGN KEY ("ingredient_id","brand_id") REFERENCES "public"."ingredients"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_sizes" ADD CONSTRAINT "option_sizes_option_fk" FOREIGN KEY ("option_id","brand_id") REFERENCES "public"."options"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_group_fk" FOREIGN KEY ("group_id","brand_id") REFERENCES "public"."option_groups"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "options" ADD CONSTRAINT "options_ingredient_fk" FOREIGN KEY ("ingredient_id","brand_id") REFERENCES "public"."ingredients"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_default_options" ADD CONSTRAINT "pdo_product_fk" FOREIGN KEY ("product_id","brand_id") REFERENCES "public"."products"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_default_options" ADD CONSTRAINT "pdo_option_fk" FOREIGN KEY ("option_id","brand_id") REFERENCES "public"."options"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "pog_product_fk" FOREIGN KEY ("product_id","brand_id") REFERENCES "public"."products"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "pog_group_fk" FOREIGN KEY ("group_id","brand_id") REFERENCES "public"."option_groups"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("product_id","brand_id") REFERENCES "public"."products"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_recipes" ADD CONSTRAINT "variant_recipes_variant_fk" FOREIGN KEY ("variant_id","brand_id") REFERENCES "public"."product_variants"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_recipes" ADD CONSTRAINT "variant_recipes_ing_fk" FOREIGN KEY ("ingredient_id","brand_id") REFERENCES "public"."ingredients"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_brand_code_uq" ON "ingredients" USING btree ("brand_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "option_groups_brand_code_uq" ON "option_groups" USING btree ("brand_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "options_group_code_uq" ON "options" USING btree ("group_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_code_uq" ON "product_variants" USING btree ("product_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_slug_uq" ON "products" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "products_brand_status_idx" ON "products" USING btree ("brand_id","status");
--> statement-breakpoint
GRANT SELECT ON allergens TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ingredients, ingredient_allergens, option_groups, options, option_sizes, product_option_groups, product_default_options, variant_recipes, product_variants, products, branch_products, branch_variant_prices, branch_option_overrides TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON allergens, ingredients, ingredient_allergens, option_groups, options, option_sizes, product_option_groups, product_default_options, variant_recipes, product_variants, products, branch_products, branch_variant_prices, branch_option_overrides TO retero_system;
--> statement-breakpoint
ALTER TABLE allergens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ingredient_allergens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE option_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE option_sizes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_option_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_default_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE variant_recipes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_variant_prices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_option_overrides ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY allergens_select ON allergens FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY ingredients_select ON ingredients FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY ingredient_allergens_select ON ingredient_allergens FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY option_groups_select ON option_groups FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY options_select ON options FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY option_sizes_select ON option_sizes FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY product_option_groups_select ON product_option_groups FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY product_default_options_select ON product_default_options FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY variant_recipes_select ON variant_recipes FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY product_variants_select ON product_variants FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY products_select ON products FOR SELECT TO retero_app USING (status = 'active' OR app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY ingredients_write ON ingredients FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY ingredient_allergens_write ON ingredient_allergens FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY option_groups_write ON option_groups FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY options_write ON options FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY option_sizes_write ON option_sizes FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY product_option_groups_write ON product_option_groups FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY product_default_options_write ON product_default_options FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY variant_recipes_write ON variant_recipes FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY product_variants_write ON product_variants FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY products_write ON products FOR ALL TO retero_app USING (app.has_permission('catalogue.manage', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY branch_products_select ON branch_products FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY branch_products_write ON branch_products FOR ALL TO retero_app USING (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id)) WITH CHECK (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY branch_variant_prices_select ON branch_variant_prices FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY branch_variant_prices_write ON branch_variant_prices FOR ALL TO retero_app USING (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id)) WITH CHECK (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY branch_option_overrides_select ON branch_option_overrides FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY branch_option_overrides_write ON branch_option_overrides FOR ALL TO retero_app USING (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id)) WITH CHECK (app.has_permission('branch.menu.manage', brand_id, NULL, branch_id));
--> statement-breakpoint
-- Branch price overrides must stay within the brand's bounds (Q5), even if core is bypassed.
CREATE OR REPLACE FUNCTION app.check_branch_variant_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_min bigint; v_max bigint;
BEGIN
  SELECT min_price_minor, max_price_minor INTO v_min, v_max FROM product_variants WHERE id = NEW.variant_id;
  IF (v_min IS NOT NULL AND NEW.price_minor < v_min) OR (v_max IS NOT NULL AND NEW.price_minor > v_max) THEN
    RAISE EXCEPTION 'branch price % outside brand bounds [%, %]', NEW.price_minor, v_min, v_max USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER branch_variant_price_bounds BEFORE INSERT OR UPDATE ON branch_variant_prices FOR EACH ROW EXECUTE FUNCTION app.check_branch_variant_price();
