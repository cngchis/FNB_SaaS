-- +goose Up
CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

-- User identities are global. Tenant access is only granted by memberships.
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE roles (
    slug text PRIMARY KEY,
    name text NOT NULL,
    is_system boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    key text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_slug text NOT NULL REFERENCES roles(slug) ON DELETE CASCADE,
    permission_key text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (role_slug, permission_key)
);

INSERT INTO roles (slug, name) VALUES
    ('owner', 'Owner'), ('manager', 'Manager'), ('cashier', 'Cashier'), ('kitchen', 'Kitchen');

INSERT INTO permissions (key, description) VALUES
    ('tenant:manage', 'Manage tenant settings and memberships'),
    ('store:manage', 'Manage stores and store settings'),
    ('catalog:read', 'Read the product catalog'),
    ('catalog:write', 'Create and edit products'),
    ('customer:read', 'Read customer records'),
    ('customer:write', 'Create and edit customers'),
    ('order:read', 'Read orders'),
    ('order:write', 'Create and edit orders'),
    ('payment:write', 'Create and reconcile payments');

INSERT INTO role_permissions (role_slug, permission_key)
SELECT role.slug, permission.key
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.slug = 'owner';
INSERT INTO role_permissions (role_slug, permission_key) VALUES
    ('manager', 'store:manage'), ('manager', 'catalog:read'), ('manager', 'catalog:write'),
    ('manager', 'customer:read'), ('manager', 'customer:write'), ('manager', 'order:read'), ('manager', 'order:write'), ('manager', 'payment:write'),
    ('cashier', 'catalog:read'), ('cashier', 'customer:read'), ('cashier', 'customer:write'), ('cashier', 'order:read'), ('cashier', 'order:write'), ('cashier', 'payment:write'),
    ('kitchen', 'catalog:read'), ('kitchen', 'order:read');

CREATE TABLE stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
    timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX stores_tenant_active_idx ON stores (tenant_id, name) WHERE deleted_at IS NULL;

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_slug text NOT NULL REFERENCES roles(slug) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, id, user_id),
    UNIQUE (tenant_id, user_id)
);
CREATE INDEX memberships_user_tenant_idx ON memberships (user_id, tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE membership_stores (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    membership_id uuid NOT NULL,
    store_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, membership_id, store_id),
    FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX membership_stores_store_idx ON membership_stores (tenant_id, store_id);

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    store_id uuid NOT NULL,
    refresh_token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, membership_id, user_id) REFERENCES memberships(tenant_id, id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, membership_id, store_id) REFERENCES membership_stores(tenant_id, membership_id, store_id) ON DELETE CASCADE
);
CREATE INDEX auth_sessions_tenant_user_idx ON auth_sessions (tenant_id, user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE product_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, name)
);

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id uuid,
    sku text NOT NULL,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    product_type text NOT NULL CHECK (product_type IN ('goods', 'prepared')),
    base_unit text NOT NULL DEFAULT 'unit',
    price_vnd bigint NOT NULL CHECK (price_vnd >= 0),
    cost_vnd bigint CHECK (cost_vnd IS NULL OR cost_vnd >= 0),
    tracks_stock boolean NOT NULL DEFAULT true,
    is_visible boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sku),
    FOREIGN KEY (tenant_id, category_id) REFERENCES product_categories(tenant_id, id) ON DELETE SET NULL (category_id)
);
CREATE INDEX products_tenant_category_idx ON products (tenant_id, category_id, name) WHERE deleted_at IS NULL;
CREATE INDEX products_tenant_name_idx ON products (tenant_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id uuid NOT NULL,
    name text NOT NULL,
    value text NOT NULL,
    price_delta_vnd bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, product_id, name, value),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX product_variants_product_idx ON product_variants (tenant_id, product_id) WHERE deleted_at IS NULL;

CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    phone text,
    email text,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id)
);
CREATE INDEX customers_tenant_name_idx ON customers (tenant_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX customers_tenant_phone_idx ON customers (tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL,
    customer_id uuid,
    order_code text NOT NULL,
    order_type text NOT NULL DEFAULT 'counter' CHECK (order_type IN ('counter', 'dine_in', 'takeaway')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'estimated', 'pending_payment', 'paid', 'cancelled', 'refunded')),
    subtotal_vnd bigint NOT NULL DEFAULT 0 CHECK (subtotal_vnd >= 0),
    discount_vnd bigint NOT NULL DEFAULT 0 CHECK (discount_vnd >= 0),
    total_vnd bigint NOT NULL DEFAULT 0 CHECK (total_vnd >= 0),
    idempotency_key text NOT NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, store_id, id),
    UNIQUE (tenant_id, store_id, order_code),
    UNIQUE (tenant_id, store_id, idempotency_key),
    FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by) REFERENCES memberships(tenant_id, user_id) ON DELETE SET NULL (created_by),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL (customer_id)
);
CREATE INDEX orders_store_created_idx ON orders (tenant_id, store_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX orders_store_status_idx ON orders (tenant_id, store_id, status, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    sku text,
    variant_label text,
    quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
    unit_price_vnd bigint NOT NULL CHECK (unit_price_vnd >= 0),
    line_total_vnd bigint NOT NULL CHECK (line_total_vnd >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES orders(tenant_id, store_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE SET NULL (product_id)
);
CREATE INDEX order_items_order_idx ON order_items (tenant_id, store_id, order_id);
CREATE INDEX order_items_product_idx ON order_items (tenant_id, product_id);

CREATE TABLE payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL,
    name text NOT NULL,
    method_type text NOT NULL CHECK (method_type IN ('cash', 'bank_transfer', 'qr', 'other')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, store_id, id),
    UNIQUE (tenant_id, store_id, name),
    FOREIGN KEY (tenant_id, store_id) REFERENCES stores(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX payment_methods_store_active_idx ON payment_methods (tenant_id, store_id) WHERE is_active AND deleted_at IS NULL;

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    store_id uuid NOT NULL,
    order_id uuid NOT NULL,
    payment_method_id uuid NOT NULL,
    amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    provider_reference text,
    idempotency_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, store_id, idempotency_key),
    FOREIGN KEY (tenant_id, store_id, order_id) REFERENCES orders(tenant_id, store_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, store_id, payment_method_id) REFERENCES payment_methods(tenant_id, store_id, id) ON DELETE RESTRICT
);
CREATE INDEX payments_order_created_idx ON payments (tenant_id, store_id, order_id, created_at DESC);

-- +goose StatementBegin
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'stores', 'memberships', 'membership_stores', 'auth_sessions',
        'product_categories', 'products', 'product_variants', 'customers',
        'orders', 'order_items', 'payment_methods', 'payments'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
            table_name
        );
    END LOOP;
END $$;
-- +goose StatementEnd

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY user_membership_isolation ON users
    USING (EXISTS (
        SELECT 1 FROM memberships AS membership
        WHERE membership.user_id = users.id
          AND membership.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
          AND membership.deleted_at IS NULL
    ));

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fnb_app') THEN
        GRANT USAGE ON SCHEMA public TO fnb_app;
        GRANT SELECT ON tenants, roles, permissions, role_permissions, users TO fnb_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON stores, memberships, membership_stores, auth_sessions,
            product_categories, products, product_variants, customers, orders, order_items,
            payment_methods, payments TO fnb_app;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS membership_stores;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS stores;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
