import { base44 } from '@/api/base44Client';

export const MANAGER_PERMISSIONS = {
  view_metrics: true,
  view_payroll: true,
  edit_floor_plan: true,
  view_procedures: true,
  manage_inventory: true,
  process_checkout: true,
  send_notifications: true,
};

export async function getVendorContext() {
  const user = await base44.auth.me();
  let employee = null;
  let business = null;
  let vendorRole = null;
  let permissions = {};

  const ownedBusinesses = await base44.entities.Business.filter({ owner_user_id: user.id });
  if (ownedBusinesses.length > 0) {
    business = ownedBusinesses[0];
    vendorRole = 'manager';
    permissions = MANAGER_PERMISSIONS;
  } else {
    const employees = await base44.entities.Employee.filter({ user_id: user.id });
    employee = employees.find(record => record.status !== 'inactive') || employees[0] || null;
    if (employee) {
      const businesses = await base44.entities.Business.filter({ id: employee.business_id });
      business = businesses[0] || null;
      vendorRole = employee.role || 'sales_associate';
      permissions = vendorRole === 'manager' ? MANAGER_PERMISSIONS : (employee.permissions || {});
    }
  }

  const businessId = business?.id || employee?.business_id || null;

  if (businessId && !employee) {
    const employees = await base44.entities.Employee.filter({ user_id: user.id, business_id: businessId });
    employee = employees.find(record => record.status !== 'inactive') || employees[0] || null;
  }

  return {
    user,
    employee,
    business,
    businessId,
    isManager: vendorRole === 'manager',
    vendorRole,
    permissions,
  };
}

export function canAccessVendorPage(pageName, contextOrEmployee) {
  const vendorRole = contextOrEmployee?.vendorRole || contextOrEmployee?.role || null;
  const permissions = contextOrEmployee?.permissions || contextOrEmployee?.vendor_permissions || {};

  if (!vendorRole) return pageName === 'BusinessSetup';
  if (vendorRole === 'manager') return true;
  if (pageName === 'BusinessSetup' || pageName === 'Employees') return false;

  const alwaysAllowed = new Set([
    'Home',
    'FloorView',
    'Customers',
    'CustomerDetail',
    'FittingRooms',
    'EmployeeProfile',
    'FAQ',
    'Support',
    'MirrorDisplay',
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
