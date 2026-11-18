# SRS - E-Commerce Web Application Builder

Nov 18, 2026 · @muah11@gmail.com

## 1. Introduction

### 1.1 Purpose

This SRS defines requirements for an E-Commerce Web Application Builder — a platform, not a single store. A **Super Admin** provisions and configures storefronts for multiple client businesses from one control panel, instead of building a separate site per client.

### 1.2 Scope

The system has three portals:

- **Super Admin Portal** — platform owner manages all client accounts, plans, and site provisioning.
- **Client Admin Portal** — each business manages its own products, orders, and storefront settings.
- **Storefront** — public-facing shop shown to the client's end customers (catalog, cart, checkout, reviews, coupons).

Out of scope for v1: native mobile apps, POS/offline sync, accounting/ERP integration.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Tenant | One client business and its isolated data/site |
| Super Admin | Platform owner, manages all tenants |
| Client Admin | A tenant's own store manager |
| Storefront | The public shop a tenant's customers browse and buy from |

### 1.4 Intended Audience

Final Year Project supervisor/evaluator, development team (student), and future maintainers.

## 2. Overall Description

### 2.1 Product Perspective

A new, self-contained website-builder-style SaaS platform (comparable in spirit to Shopify/Wix, but for any business type) — not a rebuild of an existing system, and not one e-commerce site: the product IS the builder. The Super Admin onboards a client, picks a theme/template and plan, and a working storefront goes live under a subdomain (e.g. `clientname.platform.com`) without custom code per client.

### 2.2 User Classes

| User Class | Description |
| --- | --- |
| Super Admin | Platform owner/operator; onboards tenants, manages plans, monitors all stores |
| Client Admin | Business owner/staff; manages own products, orders, coupons, store design |
| Customer | End shopper on a tenant's storefront; browses, buys, reviews |
| Cashier | Tenant-level POS/checkout role; handles in-person or assisted transactions, no catalog/settings access |
| Vendor | Sub-seller under a tenant (multi-vendor mode); manages only their own product listings and inventory |

### 2.3 Operating Environment

- Frontend: Next.js (React), served via SSR/SSG for storefront SEO
- Backend: Node.js (Express.js) REST API — a separate service from the frontend
- Database: MongoDB (Atlas or self-hosted), Mongoose ODM
- Hosting: Vercel or VPS; object storage (e.g. Cloudinary/S3) for product images
- IDE/tooling: Antigravity (AI-assisted coding environment) used for development
- Cross-platform mobile (future/optional for this project): Flutter app (iOS/Android/Web) consuming the same backend APIs, for a native storefront or vendor app

### 2.4 Design & Implementation Constraints

- Must support multiple tenants from one codebase (no per-client forks)
- Each tenant's data must be logically isolated (no cross-tenant data leakage)
- Must run within a university project timeline and a single-developer team

### 2.5 Assumptions & Dependencies

- Clients do not need their own custom domain in v1 (subdomain only); custom-domain mapping is a future enhancement
- A sandbox/test payment gateway (e.g. Stripe test mode) is acceptable for demo purposes
- Each tenant initially sells physical, non-variant-heavy products (simple product model)

## 3. System Architecture

### 3.1 Provisioning Approach (Recommended)

**Single shared Next.js app + single shared MongoDB database, tenant data separated by a `tenantId` field** (shared-database, shared-schema multi-tenancy). This is the standard approach for a student/MVP SaaS and is far simpler to build and demo than per-tenant databases or per-tenant deployments.

- Every collection (Products, Orders, Coupons, Reviews, etc.) has a `tenantId` field referencing the `Tenants` collection.
- All queries are automatically scoped by `tenantId`, resolved from the request's subdomain (Node.js middleware reads `clientname` from `clientname.platform.com` and attaches it to the request/session).
- Super Admin queries are the only ones allowed to run without a `tenantId` filter.
- This avoids spinning up a new database or new deployment per client — the Super Admin simply inserts a new `Tenant` document and the storefront is live.

*(Per-tenant database is noted as a possible future scaling path once a tenant's data volume justifies it, but is out of scope for this SRS.)*

### 3.2 Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend (Storefront + Admin UIs) | Next.js, React, Tailwind CSS |
| Backend | Node.js + Express.js (standalone REST API) |
| Database | MongoDB + Mongoose |
| Auth | Plain JWT issued by the Express backend, role-based (Super Admin, Client Admin, Cashier, Vendor, Customer) |
| Image/File storage | Cloudinary or AWS S3 |
| Payments | Stripe (test mode for demo) |
| Deployment | Vercel (app) + MongoDB Atlas (DB) |

### 3.3 High-Level Flow (described)

1. Super Admin logs in → creates a new Tenant (business name, subdomain, plan, theme) → system creates a `Tenant` document and a default `ClientAdmin` user for that tenant.
2. Client Admin logs in on their tenant's admin path → adds products, configures store name/logo/theme → publishes store.
3. Customer visits `tenant.platform.com` (Next.js/React frontend) → request hits the Node.js backend → middleware resolves `tenantId` from subdomain → storefront queries are scoped to that tenant only → customer browses, adds to cart, checks out, pays via Stripe → Order saved under that `tenantId`.
4. Client Admin sees only their own Orders/Products/Reviews; Super Admin can see all tenants' summary data (plan, usage, status) but not edit tenant product data directly.
5. &#91;embedded content: architecture · 3 portals, 1 API layer, 1 tenant-scoped DB\]

### 3.4 Routing Scheme & Feature Toggles

**Routing.** The course material demonstrates path-based routing (e.g. `platform.com/burgerking`), where the store slug is a URL path segment resolved by a dynamic route. This SRS's subdomain scheme (`clientname.platform.com`, §3.1) and path-based routing are functionally equivalent for tenant resolution — both resolve a slug to a `tenantId` in middleware before any query runs. **Either is acceptable**; subdomain is used here for a cleaner production-style URL, but implementation may use path-based routing (`/[store]/...` dynamic segments in Next.js) if preferred or required, with no change to the data model.

**Feature Toggles.** Each tenant document carries a `features` object (e.g. `{ discountBadge: true, multiVendor: false, reviews: true }`). Super Admin sets which features a plan allows; Client Admin turns allowed features on/off for their own store. The storefront reads this object at render time and conditionally shows/hides the corresponding UI (e.g. an "Add to Cart with Discount" button), with no code change or redeploy per tenant.

## 4. Functional Requirements — Super Admin Portal

| ID | Requirement |
| --- | --- |
| FR-SA-01 | Super Admin shall log in via a separate, role-protected login (not reachable from any tenant subdomain) |
| FR-SA-02 | Super Admin shall create a new Tenant: business name, subdomain, contact email, plan, and a chosen store theme/template |
| FR-SA-03 | On tenant creation, the system shall auto-generate a default Client Admin account and email the credentials/setup link |
| FR-SA-04 | Super Admin shall view a list of all tenants with status (active, suspended, trial expired), plan, and creation date |
| FR-SA-05 | Super Admin shall activate, suspend, or delete a tenant (suspending disables that tenant's storefront and admin login) |
| FR-SA-06 | Super Admin shall define subscription plans (e.g. Basic/Pro) with feature limits (max products, max admins, commission %) |
| FR-SA-07 | Super Admin shall view platform-wide analytics: total tenants, total orders across tenants, revenue/commission summary |
| FR-SA-08 | Super Admin shall manage the pool of store themes/templates available for tenants to pick at setup |
| FR-SA-09 | Super Admin shall NOT be able to view or edit a tenant's individual product/customer data (data isolation), only account-level and aggregate data |
| FR-SA-10 | Super Admin shall impersonate/log in as a Client Admin for support purposes, with the action logged |
| FR-SA-11 | Super Admin shall define which features (feature toggles, e.g. multi-vendor, review badges) are available to each plan |

## 5. Functional Requirements — Client Admin Portal

| ID | Requirement |
| --- | --- |
| FR-CA-01 | Client Admin shall log in with credentials scoped to their own tenant only |
| FR-CA-02 | Client Admin shall perform CRUD on Products (name, price, stock, images, category, description, variants) |
| FR-CA-03 | Client Admin shall manage Categories and reorder how they appear on the storefront |
| FR-CA-04 | Client Admin shall view and update Order status (pending, processing, shipped, delivered, cancelled) |
| FR-CA-05 | Client Admin shall create and manage Coupons (code, % or flat discount, expiry date, usage limit) |
| FR-CA-06 | Client Admin shall moderate customer Reviews on their own products (approve/hide) |
| FR-CA-07 | Client Admin shall customize storefront basics: store name, logo, banner, color theme (from the assigned theme's options), contact info |
| FR-CA-08 | Client Admin shall invite additional staff/sub-admin accounts under their own tenant, within their plan's limit |
| FR-CA-09 | Client Admin shall view sales reports scoped to their own store (revenue, top products, order count) over a selected date range |
| FR-CA-10 | Client Admin shall NOT be able to view or affect data belonging to another tenant |
| FR-CA-11 | Client Admin shall toggle on/off, for their own store, any feature their plan allows (e.g. discount badges, multi-vendor mode) |
| FR-CA-12 | Client Admin shall create Cashier accounts (POS/checkout access only, no catalog or settings access) under their own tenant |
| FR-CA-13 | Client Admin shall approve/reject Vendor sign-ups when multi-vendor mode is enabled, and remove a Vendor's access |

## 6. Functional Requirements — Storefront (Customer-Facing)

| ID | Requirement |
| --- | --- |
| FR-SF-01 | Customer shall register/log in (email+password or social login) or checkout as guest |
| FR-SF-02 | Customer shall browse products by category, search by keyword, and filter/sort (price, newest, rating) |
| FR-SF-03 | Customer shall view a Product Detail page (images, price, stock, description, reviews) |
| FR-SF-04 | Customer shall add/remove items to a persistent Cart and update quantities |
| FR-SF-05 | Customer shall apply a valid Coupon code at checkout and see the discount reflected before payment |
| FR-SF-06 | Customer shall complete Checkout: shipping address, order summary, and payment via an integrated gateway (Stripe) |
| FR-SF-07 | System shall send an order confirmation email/notification after successful payment |
| FR-SF-08 | Customer shall view their Order History and current order status |
| FR-SF-09 | Customer shall submit a Review (rating + comment) only for products they have purchased |
| FR-SF-10 | System shall support Multi-Vendor listing where applicable: a tenant marked as a marketplace can let approved sub-sellers list products under that tenant's store, with orders split by seller for fulfillment |
| FR-SF-11 | Storefront pages shall be server-rendered for SEO (product and category pages indexable by search engines) |

## 7. Non-Functional Requirements

| ID | Category | Requirement |
| --- | --- | --- |
| NFR-01 | Performance | Storefront pages shall load in under 3 seconds on a typical broadband connection |
| NFR-02 | Security | Passwords stored hashed (bcrypt); all admin routes protected by role-based middleware; payment data never stored directly (handled by Stripe) |
| NFR-03 | Data Isolation | Every tenant-scoped query must filter by `tenantId`; automated tests must confirm no cross-tenant data leakage |
| NFR-04 | Scalability | Architecture shall support adding new tenants without code redeployment or downtime |
| NFR-05 | Usability | Admin dashboards (Super Admin and Client Admin) shall be usable without a manual, following common dashboard UI conventions |
| NFR-06 | Availability | Target uptime 99% for demo/production use (acceptable for a single-instance Vercel/Atlas deployment) |
| NFR-07 | Maintainability | Codebase shall follow a consistent folder structure (feature-based) so new tenant features can be added without touching other tenants' logic |
| NFR-08 | Compatibility | Storefronts shall be responsive and work on latest Chrome, Firefox, Edge, and mobile browsers |

## 8. Database Design Overview (MongoDB Collections)

| Collection | Key Fields |
| --- | --- |
| Tenants | `_id`, `businessName`, `subdomain`, `plan`, `status`, `theme`, `createdAt` |
| Users | `_id`, `tenantId` (null for Super Admin), `role` (superadmin/clientadmin/cashier/vendor/customer), email unique per tenant (globally unique for superadmin), `name`, `email`, `passwordHash` |
| Products | `_id`, `tenantId`, `name`, `price`, `stock`, `images[]`, `categoryId`, `description`, `sellerId` (for multi-vendor) |
| Categories | `_id`, `tenantId`, `name`, `order` |
| Orders | `_id`, `tenantId`, `customerId`, `items[]`, `totalAmount`, `status`, `paymentId`, `createdAt` |
| Coupons | `_id`, `tenantId`, `code`, `discountType`, `value`, `expiryDate`, `usageLimit` |
| Reviews | `_id`, `tenantId`, `productId`, `customerId`, `rating`, `comment`, `approved` |
| Plans | `_id`, `name`, `maxProducts`, `maxAdmins`, `priceMonthly` |
| Themes | \_id, name, previewImage, colorOptions\[\], layoutConfig — pool managed by Super Admin (FR-SA-08) |
| AuditLogs | \_id, actorId, action, targetTenantId, timestamp — records Super Admin impersonation and other sensitive actions (FR-SA-10) |
| Carts | \_id, tenantId, customerId (or sessionId for guests), items\[\], updatedAt — persistent cart (FR-SF-04) |

Every collection except `Tenants` and `Plans` carries a `tenantId` field, indexed, used to scope every query to the correct tenant.

## 9. External Interface Requirements

### 9.1 User Interfaces

- Responsive web UI for all three portals (Super Admin, Client Admin, Storefront), built with Next.js + Tailwind CSS

### 9.2 Software Interfaces

| Interface | Purpose |
| --- | --- |
| Stripe API | Payment processing at checkout (test mode for demo) |
| MongoDB Atlas | Primary database connection |
| Cloudinary/S3 API | Product image upload and storage |
| SMTP / email service (e.g. Nodemailer, SendGrid) | Order confirmations, Client Admin credential emails |

### 9.3 Communication Interfaces

- HTTPS for all client-server communication
- REST`  API hosted as a standalone Node.js/Express service, consumed by the Next.js/React frontend over HTTPS `

## 10. Use Case Scenarios

**UC-1: Super Admin onboards a new client** Super Admin logs in → clicks "Add Tenant" → enters business name, subdomain, selects plan and theme → submits → system creates Tenant + default Client Admin → email sent with login link → tenant's storefront is live at `subdomain.platform.com` (empty, awaiting products).

**UC-2: Client Admin sets up their store** Client Admin logs in via emailed link → sets password → uploads logo, picks theme color → adds first products and categories → store appears populated to customers on next storefront visit.

**UC-3: Customer completes a purchase** Customer visits `tenant.platform.com` → browses/searches products → adds to cart → proceeds to checkout → enters shipping info → applies coupon (optional) → pays via Stripe → receives confirmation → order appears in Client Admin's Orders list under that tenant only.

**UC-4: Super Admin suspends a tenant** Super Admin notices a tenant's plan has lapsed (unpaid) → sets tenant status to "Suspended" → that tenant's storefront and Client Admin login are disabled until status is restored.

## 11. Appendix

### 11.1 Assumptions

- Single currency and single language per deployment in v1
- Tenants use the shared subdomain scheme; custom domains are not required for grading/demo
- Payment gateway runs in test/sandbox mode for the academic demo

### 11.2 Future Scope

- Custom domain mapping per tenant
- Per-tenant database sharding for large-scale tenants
- Native mobile app for storefronts
- Advanced multi-vendor features (seller payouts, commission auto-split)
- Analytics dashboards with charts for Client Admins
