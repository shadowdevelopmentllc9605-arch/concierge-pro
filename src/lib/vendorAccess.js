// Presentation-layer route gating. Backend authorization remains enforced by
// Supabase row-level policies and authenticated Edge Functions.
export function canAccessVendorPage(pageName, contextOrEmployee) {
  const vendorRole = contextOrEmployee?.vendorRole || contextOrEmployee?.role || null;
  const permissions = contextOrEmployee?.permissions || contextOrEmployee?.vendor_permissions || {};

  // New authenticated retailers may reach BusinessSetup before a business
  // or employee membership exists, but nothing else.
  if (!vendorRole) return pageName === 'BusinessSetup';
  if (vendorRole === 'manager') return true;
  if (pageName === 'BusinessSetup' || pageName === 'Employees') return false;

  const alwaysAllowed = new Set([
    'Home', 'FloorView', 'Customers', 'CustomerDetail', 'FittingRooms',
    'EmployeeProfile', 'FAQ', 'Support', 'MirrorDisplay',
  ]);
  if (alwaysAllowed.has(pageName)) return true;
  if (pageName === 'Inventory') return Boolean(permissions.manage_inventory);
  if (pageName === 'Checkout') return Boolean(permissions.process_checkout);
  if (pageName === 'Notifications') return Boolean(permissions.send_notifications);
  if (pageName === 'Metrics') return Boolean(permissions.view_metrics);
  if (pageName === 'Payroll') return Boolean(permissions.view_payroll);
  if (pageName === 'Procedures') return Boolean(permissions.view_procedures);
  return false;
}

export function shouldRedirectToBusinessSetup(pageName, context) {
  if (!context || pageName === 'BusinessSetup') return false;
  // Only the setup route is available before joining or creating a business.
  if (!context.businessId) return true;
  // A verified manager completes their own store setup before using the app.
  return context.isManager === true && context.business?.setup_complete === false;
}
