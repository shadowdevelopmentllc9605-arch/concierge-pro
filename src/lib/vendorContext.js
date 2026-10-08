import { authClient } from '@/api/authClient';
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

async function refreshTrustedMembership(user) {
  if (user?.business_id && user?.vendor_role) return user;

  const response = await base44.functions.invoke('claimVendorMembership', {});
  const result = response?.data || response;
  if (!result?.businessId) return user;

  return authClient.me();
}

export async function getVendorContext() {
  let user = await authClient.me();

  try {
    user = await refreshTrustedMembership(user);
  } catch (error) {
    // First-time owners can still reach BusinessSetup before a membership exists.
    if (window?.location?.pathname !== '/BusinessSetup') {
      console.warn('Vendor membership is not active yet', error);
    }
  }

  const businessId = user?.business_id || null;
  const vendorRole = user?.vendor_role || null;
  const permissions =
    vendorRole === 'manager'
      ? MANAGER_PERMISSIONS
      : (user?.vendor_permissions || {});

  let employee = null;
  let business = null;

  if (businessId) {
    const [employees, businesses] = await Promise.all([
      base44.entities.Employee.filter({ user_id: user.id, business_id: businessId }),
      base44.entities.Business.filter({ id: businessId }),
    ]);
    employee =
      employees.find(record => record.status !== 'inactive') ||
      employees[0] ||
      null;
    business = businesses[0] || null;
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
  const vendorRole =
    contextOrEmployee?.vendorRole ||
    contextOrEmployee?.role ||
    null;
  const permissions =
    contextOrEmployee?.permissions ||
    contextOrEmployee?.vendor_permissions ||
    {};

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
