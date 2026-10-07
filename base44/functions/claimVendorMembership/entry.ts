import { createClientFromRequest } from "npm:@base44/sdk";

const MANAGER_PERMISSIONS = {
  view_metrics: true,
  view_payroll: true,
  edit_floor_plan: true,
  view_procedures: true,
  manage_inventory: true,
  process_checkout: true,
  send_notifications: true,
};

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Ownership is derived ONLY from server-set identity (owner_user_id).
    // Client-settable email strings (owner_email) are never trusted for binding.
    const owned = await base44.asServiceRole.entities.Business.filter({ owner_user_id: user.id });
    let business = owned[0] || null;
    let employee = null;

    if (business) {
      const employees = await base44.asServiceRole.entities.Employee.filter({ email: user.email });
      employee = employees.find((e: any) => e.business_id === business.id) || null;
      const managerData = {
        user_id: user.id,
        name: user.full_name || user.email,
        email: user.email,
        role: "manager",
        permissions: MANAGER_PERMISSIONS,
        status: "active",
        business_id: business.id,
        location_id: business.default_location_id || "",
      };
      if (employee) {
        await base44.asServiceRole.entities.Employee.update(employee.id, managerData);
        employee = { ...employee, ...managerData };
      } else {
        employee = await base44.asServiceRole.entities.Employee.create(managerData);
      }
    } else {
      // Employee membership is matched ONLY by server identity (user_id), never
      // by email — an email match would let a pre-created record hijack this user.
      const byUser = await base44.asServiceRole.entities.Employee.filter({ user_id: user.id });
      // Only an ACTIVE employee record grants membership. Never fall back to an
      // inactive record — deactivation is revocation, including for managers.
      employee = byUser.find((e: any) => e.status !== "inactive") || null;

      if (!employee || !employee.business_id) {
        return Response.json({ error: "No active vendor membership" }, { status: 403 });
      }

      const businesses = await base44.asServiceRole.entities.Business.filter({ id: employee.business_id });
      business = businesses[0] || null;
      if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

      if (employee.user_id !== user.id) {
        await base44.asServiceRole.entities.Employee.update(employee.id, { user_id: user.id });
        employee.user_id = user.id;
      }
    }

    const vendorRole = employee?.role || "sales_associate";
    const vendorPermissions = vendorRole === "manager" ? MANAGER_PERMISSIONS : (employee?.permissions || {});

    await base44.asServiceRole.entities.User.update(user.id, {
      business_id: business.id,
      vendor_role: vendorRole,
      vendor_permissions: vendorPermissions,
    });

    return Response.json({
      businessId: business.id,
      vendorRole,
      permissions: vendorPermissions,
      employeeId: employee?.id || null,
    });
  } catch (error) {
    console.error("claimVendorMembership", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}