CREATE TYPE "public"."payment_attempt_status" AS ENUM('initiating', 'initiated', 'succeeded', 'failed', 'cancelled', 'timeout', 'error');--> statement-breakpoint
CREATE TYPE "public"."fulfilment" AS ENUM('delivery', 'collection');--> statement-breakpoint
CREATE TYPE "public"."mpesa_environment" AS ENUM('sandbox', 'production', 'simulator');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('web', 'whatsapp', 'staff');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('unpaid', 'pending', 'paid', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'new', 'accepted', 'preparing', 'baking', 'ready', 'out_for_delivery', 'delivered', 'collected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "branch_order_counters" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"option_ids" jsonb,
	"quantity" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_qty" CHECK ("cart_items"."quantity" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"reference" text NOT NULL,
	"channel" "order_channel" DEFAULT 'web' NOT NULL,
	"created_by_user_id" uuid,
	"checked_out_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text DEFAULT 'Home' NOT NULL,
	"line1" text NOT NULL,
	"area" text,
	"city" text NOT NULL,
	"notes" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" ~ '^\+[1-9][0-9]{6,14}$' OR "customers"."erased_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"radius_m" integer,
	"polygon" jsonb,
	"fee_minor" bigint NOT NULL,
	"free_above_minor" bigint,
	"min_order_minor" bigint,
	"eta_minutes" integer DEFAULT 40 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "delivery_zones_shape" CHECK ("delivery_zones"."radius_m" IS NOT NULL OR "delivery_zones"."polygon" IS NOT NULL),
	CONSTRAINT "delivery_zones_radius" CHECK ("delivery_zones"."radius_m" IS NULL OR "delivery_zones"."radius_m" BETWEEN 100 AND 50000),
	CONSTRAINT "delivery_zones_fee" CHECK ("delivery_zones"."fee_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mpesa_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"franchisee_id" uuid,
	"environment" "mpesa_environment" DEFAULT 'sandbox' NOT NULL,
	"shortcode" text NOT NULL,
	"till_number" text,
	"transaction_type" text DEFAULT 'CustomerPayBillOnline' NOT NULL,
	"credentials_ref" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mpesa_accounts_txn_type" CHECK ("mpesa_accounts"."transaction_type" IN ('CustomerPayBillOnline', 'CustomerBuyGoodsOnline')),
	CONSTRAINT "mpesa_accounts_ref" CHECK ("mpesa_accounts"."credentials_ref" ~ '^[A-Z][A-Z0-9_]{2,40}$')
);
--> statement-breakpoint
CREATE TABLE "mpesa_callbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"attempt_id" uuid,
	"refund_id" uuid,
	"checkout_request_id" text,
	"payload" jsonb NOT NULL,
	"source_ip_hash" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" text NOT NULL,
	"variant_name" text NOT NULL,
	"size_code" text,
	"options" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"allergens" text[] NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"notes" text,
	CONSTRAINT "order_items_line" CHECK ("order_items"."line_total_minor" = "order_items"."unit_price_minor" * "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"franchisee_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"cart_id" uuid,
	"quote_id" uuid,
	"channel" "order_channel" NOT NULL,
	"fulfilment" "fulfilment" NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'unpaid' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"vat_included_minor" bigint NOT NULL,
	"coupon_code" text,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"delivery_address" jsonb,
	"delivery_zone_id" uuid,
	"eta_minutes" integer,
	"notes" text,
	"idempotency_key" text NOT NULL,
	"tracking_token_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "orders_total" CHECK ("orders"."total_minor" = "orders"."subtotal_minor" + "orders"."delivery_fee_minor" - "orders"."discount_minor" AND "orders"."total_minor" >= 0),
	CONSTRAINT "orders_delivery_address" CHECK ("orders"."fulfilment" = 'collection' OR "orders"."delivery_address" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"brand_id" uuid,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'initiating' NOT NULL,
	"callback_token_hash" text NOT NULL,
	"checkout_request_id" text,
	"merchant_request_id" text,
	"amount_minor" bigint NOT NULL,
	"phone_masked" text NOT NULL,
	"result_code" integer,
	"result_desc" text,
	"mpesa_receipt" text,
	"query_count" integer DEFAULT 0 NOT NULL,
	"last_queried_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_response" jsonb
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text DEFAULT 'mpesa' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"refunded_minor" bigint DEFAULT 0 NOT NULL,
	"mpesa_receipt" text,
	"payer_phone_masked" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_id_brand_uq" UNIQUE("id","brand_id"),
	CONSTRAINT "payments_amount_pos" CHECK ("payments"."amount_minor" > 0),
	CONSTRAINT "payments_refund_bounds" CHECK ("payments"."refunded_minor" >= 0 AND "payments"."refunded_minor" <= "payments"."amount_minor")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"fulfilment" "fulfilment" NOT NULL,
	"delivery_zone_id" uuid,
	"delivery_lat" numeric(9, 6),
	"delivery_lng" numeric(9, 6),
	"coupon_code" text,
	"lines" jsonb NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"delivery_fee_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"vat_included_minor" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_total" CHECK ("quotes"."total_minor" = "quotes"."subtotal_minor" + "quotes"."delivery_fee_minor" - "quotes"."discount_minor" AND "quotes"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text NOT NULL,
	"method" text DEFAULT 'mpesa_reversal' NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"requested_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"callback_token_hash" text,
	"provider_ref" text,
	"manual_reference" text,
	"result_code" integer,
	"result_desc" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_pos" CHECK ("refunds"."amount_minor" > 0),
	CONSTRAINT "refunds_method" CHECK ("refunds"."method" IN ('mpesa_reversal', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "branch_order_counters" ADD CONSTRAINT "branch_order_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_fk" FOREIGN KEY ("customer_id","brand_id") REFERENCES "public"."customers"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpesa_accounts" ADD CONSTRAINT "mpesa_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mpesa_accounts" ADD CONSTRAINT "mpesa_accounts_franchisee_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("order_id","brand_id") REFERENCES "public"."orders"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "osh_order_fk" FOREIGN KEY ("order_id","brand_id") REFERENCES "public"."orders"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_franchisee_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_fk" FOREIGN KEY ("customer_id","brand_id") REFERENCES "public"."customers"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_fk" FOREIGN KEY ("payment_id","brand_id") REFERENCES "public"."payments"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_mpesa_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."mpesa_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_fk" FOREIGN KEY ("order_id","brand_id") REFERENCES "public"."orders"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_fk" FOREIGN KEY ("payment_id","brand_id") REFERENCES "public"."payments"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_token_uq" ON "carts" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_reference_uq" ON "carts" USING btree ("brand_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_brand_user_uq" ON "customers" USING btree ("brand_id","user_id") WHERE "customers"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_brand_phone_idx" ON "customers" USING btree ("brand_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "mpesa_accounts_active_uq" ON "mpesa_accounts" USING btree ("brand_id",coalesce("franchisee_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "mpesa_accounts"."active";--> statement-breakpoint
CREATE INDEX "mpesa_callbacks_unprocessed_idx" ON "mpesa_callbacks" USING btree ("received_at") WHERE "mpesa_callbacks"."processed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mpesa_callbacks_checkout_idx" ON "mpesa_callbacks" USING btree ("checkout_request_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "osh_order_idx" ON "order_status_history" USING btree ("order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_brand_number_uq" ON "orders" USING btree ("brand_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_brand_idem_uq" ON "orders" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tracking_uq" ON "orders" USING btree ("tracking_token_hash");--> statement-breakpoint
CREATE INDEX "orders_branch_status_idx" ON "orders" USING btree ("branch_id","status","placed_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_pending_due_idx" ON "orders" USING btree ("payment_due_at") WHERE "orders"."status" = 'pending_payment';--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("available_at") WHERE "outbox_events"."published_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_checkout_uq" ON "payment_attempts" USING btree ("checkout_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_token_uq" ON "payment_attempts" USING btree ("callback_token_hash");--> statement-breakpoint
CREATE INDEX "payment_attempts_open_idx" ON "payment_attempts" USING btree ("requested_at") WHERE "payment_attempts"."status" IN ('initiating', 'initiated');--> statement-breakpoint
CREATE INDEX "payment_attempts_payment_idx" ON "payment_attempts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_uq" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_uq" ON "payments" USING btree ("mpesa_receipt");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_token_uq" ON "refunds" USING btree ("callback_token_hash");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO retero_system;
--> statement-breakpoint
REVOKE UPDATE ON audit_logs FROM retero_system;
--> statement-breakpoint
GRANT DELETE ON cart_items, delivery_zones TO retero_system;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE retero_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO retero_system;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_zones TO retero_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON customers, customer_addresses TO retero_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON orders TO retero_app;
--> statement-breakpoint
GRANT SELECT ON order_items, payments, payment_attempts TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON order_status_history TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON refunds TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON mpesa_accounts TO retero_app;
--> statement-breakpoint
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branch_order_counters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mpesa_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mpesa_callbacks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY delivery_zones_select ON delivery_zones FOR SELECT TO retero_app USING (true);
--> statement-breakpoint
CREATE POLICY delivery_zones_write ON delivery_zones FOR ALL TO retero_app USING (app.has_permission('branch.update', brand_id, NULL, branch_id)) WITH CHECK (app.has_permission('branch.update', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY customers_select ON customers FOR SELECT TO retero_app USING (user_id = app.current_user_id() OR app.has_permission('customer.read', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY customers_update_self ON customers FOR UPDATE TO retero_app USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY customer_addresses_select ON customer_addresses FOR SELECT TO retero_app USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id));
--> statement-breakpoint
CREATE POLICY customer_addresses_update ON customer_addresses FOR UPDATE TO retero_app USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY orders_select ON orders FOR SELECT TO retero_app USING (app.has_permission('order.read', brand_id, franchisee_id, branch_id) OR app.has_permission('kitchen.ticket.update', brand_id, franchisee_id, branch_id) OR app.has_permission('delivery.read', brand_id, franchisee_id, branch_id) OR EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = app.current_user_id()));
--> statement-breakpoint
CREATE POLICY orders_update ON orders FOR UPDATE TO retero_app USING (app.has_permission('order.manage', brand_id, franchisee_id, branch_id) OR app.has_permission('kitchen.ticket.update', brand_id, franchisee_id, branch_id) OR app.has_permission('delivery.update', brand_id, franchisee_id, branch_id)) WITH CHECK (app.has_permission('order.manage', brand_id, franchisee_id, branch_id) OR app.has_permission('kitchen.ticket.update', brand_id, franchisee_id, branch_id) OR app.has_permission('delivery.update', brand_id, franchisee_id, branch_id));
--> statement-breakpoint
CREATE POLICY order_items_select ON order_items FOR SELECT TO retero_app USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id));
--> statement-breakpoint
CREATE POLICY osh_select ON order_status_history FOR SELECT TO retero_app USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id));
--> statement-breakpoint
CREATE POLICY osh_insert ON order_status_history FOR INSERT TO retero_app WITH CHECK (actor_user_id = app.current_user_id() AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND (app.has_permission('order.manage', o.brand_id, o.franchisee_id, o.branch_id) OR app.has_permission('kitchen.ticket.update', o.brand_id, o.franchisee_id, o.branch_id) OR app.has_permission('delivery.update', o.brand_id, o.franchisee_id, o.branch_id))));
--> statement-breakpoint
CREATE POLICY payments_select ON payments FOR SELECT TO retero_app USING (app.has_permission('order.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY payment_attempts_select ON payment_attempts FOR SELECT TO retero_app USING (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_id));
--> statement-breakpoint
CREATE POLICY refunds_select ON refunds FOR SELECT TO retero_app USING (app.has_permission('order.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY refunds_write ON refunds FOR INSERT TO retero_app WITH CHECK (app.has_permission('order.refund', brand_id, NULL, branch_id) AND requested_by_user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY refunds_update ON refunds FOR UPDATE TO retero_app USING (app.has_permission('order.refund', brand_id, NULL, branch_id)) WITH CHECK (app.has_permission('order.refund', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY mpesa_accounts_rw ON mpesa_accounts FOR ALL TO retero_app USING (app.has_permission('brand.settings.update', brand_id, NULL, NULL)) WITH CHECK (app.has_permission('brand.settings.update', brand_id, NULL, NULL));
--> statement-breakpoint
-- Money must never move backwards: paid orders keep their totals.
CREATE OR REPLACE FUNCTION app.orders_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.total_minor <> OLD.total_minor OR NEW.subtotal_minor <> OLD.subtotal_minor OR NEW.delivery_fee_minor <> OLD.delivery_fee_minor
     OR NEW.discount_minor <> OLD.discount_minor OR NEW.brand_id <> OLD.brand_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.customer_id <> OLD.customer_id OR NEW.number <> OLD.number THEN
    RAISE EXCEPTION 'order totals, tenancy and identity are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user = 'retero_app' AND (NEW.payment_status IS DISTINCT FROM OLD.payment_status OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN
    RAISE EXCEPTION 'payment state is set only by the payments module' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_guard BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION app.orders_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.order_items_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'order items are immutable' USING ERRCODE = 'check_violation'; END $$;
--> statement-breakpoint
CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION app.order_items_immutable();
