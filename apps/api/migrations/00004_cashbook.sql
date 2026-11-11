-- +goose Up
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice','cashbook'));
ALTER TABLE payments ADD COLUMN receipt_code text, ADD COLUMN created_by uuid,
 ADD CONSTRAINT payments_creator_fk FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id);
-- Preserve historical payment identities; never fabricate a historical cashier.
WITH numbered AS (
 SELECT id,tenant_id,row_number() OVER(PARTITION BY tenant_id ORDER BY created_at,id) AS n FROM payments
)
UPDATE payments p SET receipt_code='TTHD'||lpad(numbered.n::text,greatest(6,length(numbered.n::text)),'0') FROM numbered WHERE p.id=numbered.id;
INSERT INTO entity_counters(tenant_id,entity,value) SELECT tenant_id,'cashbook',count(*) FROM payments GROUP BY tenant_id
ON CONFLICT(tenant_id,entity) DO UPDATE SET value=greatest(entity_counters.value,excluded.value);
ALTER TABLE payments ALTER COLUMN receipt_code SET NOT NULL;
CREATE UNIQUE INDEX payments_receipt_code_idx ON payments(tenant_id,receipt_code);
CREATE INDEX payments_store_created_idx ON payments(tenant_id,store_id,created_at,id) WHERE status='succeeded';
CREATE TABLE cashbook_vouchers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 store_id uuid NOT NULL, code text NOT NULL, direction text NOT NULL CHECK(direction IN ('in','out')),
 amount_vnd bigint NOT NULL CHECK(amount_vnd BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK(status IN ('pending','posted')), method text NOT NULL CHECK(method IN ('cash','bank')),
 category text NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 120),
 payer_group text NOT NULL CHECK(payer_group IN ('customer','supplier','employee','other')), payer text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 occurred_at timestamptz NOT NULL, created_by uuid NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 idempotency_key text NOT NULL, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(tenant_id,code), UNIQUE(tenant_id,store_id,idempotency_key),
 FOREIGN KEY(tenant_id,store_id) REFERENCES stores(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX cashbook_vouchers_store_date_idx ON cashbook_vouchers(tenant_id,store_id,occurred_at,id) WHERE deleted_at IS NULL;
ALTER TABLE cashbook_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashbook_vouchers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cashbook_vouchers USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
-- +goose StatementBegin
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON cashbook_vouchers TO fnb_app; END IF;
END $$;
-- +goose StatementEnd

CREATE VIEW cashbook_entries (id,tenant_id,store_id,code,source,status,direction,amount_vnd,method,category,payer_group,payer,note,occurred_at,creator,branch,invoice_code,order_id,version) WITH(security_invoker=true) AS
SELECT p.id,p.tenant_id,p.store_id,p.receipt_code AS code,'payment'::text AS source,'posted'::text AS status,
 'in'::text AS direction,p.amount_vnd,CASE WHEN m.method_type='cash' THEN 'cash' WHEN m.method_type IN ('bank_transfer','qr') THEN 'bank' ELSE 'other' END::text AS method,
 'Thu tiền khách hàng'::text AS category,'customer'::text AS payer_group,coalesce(c.name,'')::text AS payer,
 ('Thanh toán hóa đơn '||coalesce(i.code,o.order_code))::text AS note,p.created_at AS occurred_at,
 coalesce(u.display_name,'—')::text AS creator,s.name AS branch,i.code AS invoice_code,o.id AS order_id,0::bigint AS version
 FROM payments p JOIN orders o ON o.tenant_id=p.tenant_id AND o.store_id=p.store_id AND o.id=p.order_id
 JOIN stores s ON s.tenant_id=p.tenant_id AND s.id=p.store_id
 JOIN payment_methods m ON m.tenant_id=p.tenant_id AND m.store_id=p.store_id AND m.id=p.payment_method_id
 LEFT JOIN invoices i ON i.tenant_id=p.tenant_id AND i.store_id=p.store_id AND i.order_id=p.order_id
 LEFT JOIN customers c ON c.tenant_id=o.tenant_id AND c.id=o.customer_id
 LEFT JOIN users u ON u.id=p.created_by
 WHERE p.status='succeeded'
 UNION ALL
 SELECT v.id,v.tenant_id,v.store_id,v.code,'manual'::text,v.status,v.direction,v.amount_vnd,v.method,v.category,v.payer_group,v.payer,v.note,v.occurred_at,coalesce(u.display_name,'—')::text,s.name,NULL::text,NULL::uuid,v.version
 FROM cashbook_vouchers v JOIN stores s ON s.tenant_id=v.tenant_id AND s.id=v.store_id
 LEFT JOIN users u ON u.id=v.created_by WHERE v.deleted_at IS NULL;
-- +goose StatementBegin
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fnb_app') THEN GRANT SELECT ON cashbook_entries TO fnb_app; END IF; END $$;
-- +goose StatementEnd

-- +goose Down
DELETE FROM api_requests WHERE operation LIKE 'cashbook:%';
DROP VIEW cashbook_entries;
DROP TABLE cashbook_vouchers;
DROP INDEX payments_store_created_idx;
DROP INDEX payments_receipt_code_idx;
ALTER TABLE payments DROP CONSTRAINT payments_creator_fk, DROP COLUMN created_by, DROP COLUMN receipt_code;
DELETE FROM entity_counters WHERE entity='cashbook';
ALTER TABLE entity_counters DROP CONSTRAINT entity_counters_entity_check;
ALTER TABLE entity_counters ADD CONSTRAINT entity_counters_entity_check CHECK(entity IN ('product','order','invoice'));
