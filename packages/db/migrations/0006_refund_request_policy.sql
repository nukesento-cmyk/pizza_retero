-- Maker-checker: requesting a refund needs order.manage; approving needs order.refund (core enforces approver ≠ requester).
DROP POLICY refunds_write ON refunds;
--> statement-breakpoint
CREATE POLICY refunds_request ON refunds FOR INSERT TO retero_app WITH CHECK (
  app.has_permission('order.manage', brand_id, NULL, branch_id) AND requested_by_user_id = app.current_user_id() AND status = 'requested'
);
