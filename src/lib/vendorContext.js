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

  const employees = await base44.entities.Employee.filter({ email: user.email });
  const employee = employees.find(record => record.status !== 'inactive') || employees[0] || null;

  let business = null;

  if (employee?.business_id) {
    const matches = await base44.entities.Business.filter({ id: employee.business_id });
    business = matches[0] || null;
  }

  if (!business) {
    const ownedById = await base44.entities.Business.filter({ owner_user_id: user.id });
    business = ownedById[0] || null;
  }

  if (!business && user.email) {
    const ownedByEmail = await base44.entities.Business.filter({ owner_email: user.email });
    business = ownedByEmail[0] || null;
  }

  return {
    user,
    employee,
    business,
    businessId: business?.id || employee?.business_id || null,
    isManager: employee?.role === 'manager',
    permissions: employee?.permissions || {},
  };
}

export function canAccessVendorPage(pageName, employee) {
  if (!employee) return pageName === 'BusinessSetup';
  if (employee.role === 'manager') return true;
  if (pageName === 'BusinessSetup') return false;

  const permissions = employee.permissions || {};

  const alwaysAllowed = new Set([
    'Home',
    'FloorView',
    'Customers',
    'CustomerDetail',
    'FittingRooms',
  ]);

  if (alwaysAllowed.has(pageName)) return true;
  if (pageName === 'Inventory') return Boolean(permissions.manage_inventory);
  if (pageName === 'Checkout') return permissions.process_checkout !== false;
  if (pageName === 'Notifications') return Boolean(permissions.send_notifications);
  if (pageName === 'Metrics') return Boolean(permissions.view_metrics);
  if (pageName === 'Procedures') return Boolean(permissions.view_procedures);

  return false;
}
