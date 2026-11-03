-- Public, minimal view of stock for the menu: which ingredients are OUT at a branch.
-- Reveals no quantities. SECURITY DEFINER so anonymous visitors can call it.
CREATE OR REPLACE FUNCTION app.unavailable_ingredients(p_branch uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT ingredient_id FROM inventory_items WHERE branch_id = p_branch AND on_hand - reserved <= 0
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.unavailable_ingredients(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.unavailable_ingredients(uuid) TO retero_app, retero_system;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO retero_system;
