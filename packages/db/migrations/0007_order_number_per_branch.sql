DROP INDEX "orders_brand_number_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_branch_number_uq" ON "orders" USING btree ("branch_id","number");