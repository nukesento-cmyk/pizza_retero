CREATE TYPE "public"."delivery_assignment_status" AS ENUM('assigned', 'picked_up', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_kind" AS ENUM('receipt', 'consumption', 'waste', 'count', 'reservation', 'release', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('held', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('NEW', 'ACCEPTED', 'PREPARING', 'BAKING', 'READY', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "delivery_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"rider_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"status" "delivery_assignment_status" DEFAULT 'assigned' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"actor_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reserved" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reorder_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_nonneg" CHECK ("inventory_items"."on_hand" >= 0 AND "inventory_items"."reserved" >= 0 AND "inventory_items"."reorder_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"detail" text,
	"allergens" text[] NOT NULL,
	"quantity" integer NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kitchen_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "ticket_status" DEFAULT 'NEW' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"preparing_at" timestamp with time zone,
	"baking_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"order_id" uuid,
	"supplier_id" uuid,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_qty" CHECK ("stock_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"franchisee_id" uuid,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_rider_user_id_users_id_fk" FOREIGN KEY ("rider_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_order_fk" FOREIGN KEY ("order_id","brand_id") REFERENCES "public"."orders"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_assignment_id_delivery_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."delivery_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_branch_fk" FOREIGN KEY ("branch_id","brand_id") REFERENCES "public"."branches"("id","brand_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_ingredient_fk" FOREIGN KEY ("ingredient_id","brand_id") REFERENCES "public"."ingredients"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_fk" FOREIGN KEY ("order_id","brand_id") REFERENCES "public"."orders"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_franchisee_fk" FOREIGN KEY ("franchisee_id","brand_id") REFERENCES "public"."franchisees"("id","brand_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_assignments_active_uq" ON "delivery_assignments" USING btree ("order_id") WHERE "delivery_assignments"."status" IN ('assigned', 'picked_up');--> statement-breakpoint
CREATE INDEX "delivery_assignments_rider_idx" ON "delivery_assignments" USING btree ("rider_user_id","status");--> statement-breakpoint
CREATE INDEX "delivery_events_order_idx" ON "delivery_events" USING btree ("order_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_branch_ing_uq" ON "inventory_items" USING btree ("branch_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_items_ticket_idx" ON "kitchen_ticket_items" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_tickets_order_uq" ON "kitchen_tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_board_idx" ON "kitchen_tickets" USING btree ("branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_branch_idx" ON "stock_movements" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_reservations_order_item_uq" ON "stock_reservations" USING btree ("order_id","item_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON cart_items TO retero_system;
--> statement-breakpoint
GRANT SELECT ON kitchen_tickets, kitchen_ticket_items, inventory_items, stock_movements, stock_reservations, delivery_assignments, delivery_events TO retero_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON suppliers TO retero_app;
--> statement-breakpoint
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kitchen_ticket_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE delivery_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kitchen_tickets_select ON kitchen_tickets FOR SELECT TO retero_app USING (app.has_permission('kitchen.ticket.update', brand_id, NULL, branch_id) OR app.has_permission('order.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY kitchen_ticket_items_select ON kitchen_ticket_items FOR SELECT TO retero_app USING (EXISTS (SELECT 1 FROM kitchen_tickets t WHERE t.id = ticket_id));
--> statement-breakpoint
CREATE POLICY inventory_items_select ON inventory_items FOR SELECT TO retero_app USING (app.has_permission('inventory.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY stock_movements_select ON stock_movements FOR SELECT TO retero_app USING (app.has_permission('inventory.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY stock_reservations_select ON stock_reservations FOR SELECT TO retero_app USING (app.has_permission('inventory.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY suppliers_select ON suppliers FOR SELECT TO retero_app USING (app.has_permission('inventory.read', brand_id, franchisee_id, NULL) OR app.has_permission('catalogue.manage', brand_id, NULL, NULL) OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = app.current_user_id() AND m.revoked_at IS NULL AND m.brand_id = suppliers.brand_id));
--> statement-breakpoint
CREATE POLICY suppliers_write ON suppliers FOR INSERT TO retero_app WITH CHECK (app.has_permission('inventory.manage', brand_id, franchisee_id, NULL) OR app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY suppliers_update ON suppliers FOR UPDATE TO retero_app USING (app.has_permission('inventory.manage', brand_id, franchisee_id, NULL) OR app.has_permission('catalogue.manage', brand_id, NULL, NULL));
--> statement-breakpoint
CREATE POLICY delivery_assignments_select ON delivery_assignments FOR SELECT TO retero_app USING (rider_user_id = app.current_user_id() OR app.has_permission('order.read', brand_id, NULL, branch_id) OR app.has_permission('delivery.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE POLICY delivery_events_select ON delivery_events FOR SELECT TO retero_app USING (app.has_permission('order.read', brand_id, NULL, branch_id) OR app.has_permission('delivery.read', brand_id, NULL, branch_id));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation'; END $$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION app.append_only();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION app.append_only();
