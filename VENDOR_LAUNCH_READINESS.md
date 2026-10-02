# Concierge Pro — Vendor Launch Readiness

This branch uses the current Concierge Pro Base44 app as its baseline and the Google Drive documents **App layout** and **How it works** as the product reference for the vendor experience.

The live Base44 app is intentionally untouched. Base44 checkpoint `6abf357aeea3a188a383e531` captures the pre-audit state.

## Product intent from the reference documents

Concierge Pro is the vendor/store side of The Concierge. The intended flow is:

- A vendor creates a business profile, uploads a floor plan, and loads inventory with product images, stock and item dimensions.
- A manager creates employee profiles and controls employee permissions.
- Managers can see store-wide traffic, conversion, sales, inventory and floor-plan information.
- Employees can work with assigned customers, see store-specific customer history/wishlist data, prepare fitting rooms, and queue suggested items for the fitting-room mirror.
- Customer check-in should create a visible store/floor signal and support employee assignment.
- Checkout should record legitimate purchases, update inventory, and remove purchased store items from the customer's wishlist.
- Vendors should be able to prepare new-arrival, promotional, birthday and coupon communications.
- Customer, wishlist, purchase, fitting-room, inventory and notification data must stay isolated to the correct vendor/business.

## Implemented in this review branch

- Imported the current Base44 source to GitHub as the untouched `main` baseline.
- Added vendor-context helpers and business ownership metadata.
- Bootstraps the business owner as a manager with full manager permissions.
- Enforces page access in the UI based on manager/employee permissions instead of only hiding navigation links.
- Scopes employees, inventory, customers, purchases, fitting rooms, notifications, procedures, floor data and metrics by `business_id`.
- Managers see store-wide customers; regular employees see their assigned customers.
- Prevents regular employees from reassigning a customer already claimed by someone else.
- Restricts fitting-room administration to managers while preserving staff fitting-room workflow.
- Removes random customer pin placement; customers without a real store position are shown as location unavailable.
- Adds real "Assign to Me" and customer-history actions from Floor View.
- Exposes inventory item dimensions in the product editor.
- Adds configurable single-location sales tax rather than a hard-coded 8%.
- POS enforces stock limits and prevents negative inventory.
- POS records cash sales only; card/mobile buttons remain disabled until a real processor exists.
- Purchases now carry the current `business_id` and employee ID.
- Purchased local wishlist items are removed from the vendor-side wishlist record.
- Campaigns are saved as drafts instead of falsely being marked sent.
- Vendor deletion removes the business-scoped entity records the client can address and accurately discloses remaining platform-level deletion work.

## Security blocker: Base44 RLS is still required

The audited Base44 entity schemas contain no row-level security rules. The `business_id` filters in this branch improve correctness and usability, but **client-side filters are not an authorization boundary**.

Before production, Base44 needs a trusted server-side way to resolve the authenticated user's business membership and vendor role. A recommended design is to store trusted `business_id` and `vendor_role` values in authenticated user data (or resolve them in server functions) and enforce RLS on every business-owned entity.

At minimum, RLS must protect:

- Business
- Employee
- InventoryItem
- StoreCustomer
- Purchase
- CustomerNotification
- FittingRoom

A generic business-owned rule should only allow access when the record's `data.business_id` matches a trusted business ID for the current user. Manager-only operations must check a trusted manager role server-side; the client-side Employee record must not be the sole security decision.

Do not enable an RLS rule referencing `{{user.data.business_id}}` until the authentication layer reliably writes and protects that value.

## Remaining integration blockers

### Customer app synchronization
`linked_customer_app_id`, `linked_customer_id`, and `linked_product_id` are identifiers only. They do not provide synchronization. A shared backend/API is still required for customer check-in, store-specific wishlists, customer purchases/closet updates, inventory/product mapping, mirror suggestions and customer notifications.

### Card/mobile payments
There is no verified payment processor flow. Production card/mobile checkout requires server-side payment intent/charge creation, processor tokens, webhook confirmation, refunds, receipts and failure states. This branch intentionally does not simulate success.

### Traffic and conversion
Current metrics use StoreCustomer/Purchase records, but the product specification calls for real traffic and conversion measurement. A dedicated visit/check-in event model is needed so repeat visits and non-purchasing visits are measured correctly.

### Employee authentication/invitations
Creating an Employee record does not automatically provision or invite a Base44 login. An invitation/account-linking workflow is still required.

### Multi-location vendors
The reference documents call for Location(s). The current app remains primarily single-location, including one floor plan and one tax rate. Multi-location support needs a BusinessLocation/store-location model, per-location inventory/floor plans/tax and employee/customer scoping.

### Fitting-room mirror delivery
`suggested_items` currently acts as a queue in Concierge Pro. A mirror/device channel is required to actually render or cast an item on a fitting-room mirror.

### Support / FAQ / employee profile
The original vendor layout includes employee profile, FAQ, customer service and support options. Those flows are not complete yet.

### Account and file deletion
The client can delete business-scoped entity records, but Base44 authentication accounts and uploaded files require supported platform-level deletion.

### Variant inventory
Inventory tracks item-level quantity. Sizes/colors exist but do not yet have independent per-variant stock counts.

## Deployment sequence after review

1. Review this draft PR and confirm the vendor workflow.
2. Decide the trusted business-membership/auth design.
3. Add and test Base44 RLS.
4. Backfill `business_id`/owner fields for existing records where needed.
5. Apply approved schema and UI changes to a non-production Base44 checkpoint/environment first.
6. Connect customer-app sync and payment services.
7. Run manager and employee acceptance tests before production.

Validation is performed by GitHub Actions on the review branch before the draft PR is considered ready for review.
