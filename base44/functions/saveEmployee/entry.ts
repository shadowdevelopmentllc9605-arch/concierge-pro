import { createClientFromRequest } from "npm:@base44/sdk";

function isManager(user: any) {
  return Boolean(user?.business_id && user?.vendor_role === "manager");
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeAppUrl(raw: any): string {
  try {
    const parsed = new URL(String(raw));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!isManager(user)) return Response.json({ error: "Manager access required" }, { status: 403 });

    const body = await req.json();
    const employee = body?.employee || {};
    const appUrl = body?.appUrl || "";
    if (!employee.name || !employee.email) {
      return Response.json({ error: "Name and email are required" }, { status: 400 });
    }

    const data = {
      name: employee.name,
      email: String(employee.email).trim().toLowerCase(),
      photo_url: employee.photo_url || "",
      role: employee.role || "sales_associate",
      permissions: employee.permissions || {},
      status: employee.status || "active",
      business_id: user.business_id,
      location_id: employee.location_id || "",
    };

    let saved;
    if (employee.id) {
      const existing = await base44.asServiceRole.entities.Employee.filter({ id: employee.id, business_id: user.business_id });
      if (!existing[0]) return Response.json({ error: "Employee not found" }, { status: 404 });
      await base44.asServiceRole.entities.Employee.update(employee.id, data);
      saved = { ...existing[0], ...data };
    } else {
      const existing = await base44.asServiceRole.entities.Employee.filter({ email: data.email, business_id: user.business_id });
      if (existing[0]) {
        await base44.asServiceRole.entities.Employee.update(existing[0].id, data);
        saved = { ...existing[0], ...data };
      } else {
        saved = await base44.asServiceRole.entities.Employee.create(data);
      }
    }

    // Email is a hint, not identity proof: only link a registered user who has
    // no existing vendor membership, or who already belongs to this business.
    const users = await base44.asServiceRole.entities.User.filter({ email: data.email });
    if (users[0] && (!users[0].business_id || users[0].business_id === user.business_id)) {
      if (saved.status === "inactive") {
        // Deactivation is revocation: strip stale vendor access from the linked
        // User record instead of granting role/permissions (matches removeEmployee).
        await base44.asServiceRole.entities.User.update(users[0].id, {
          business_id: "",
          vendor_role: "",
          vendor_permissions: {},
        });
      } else {
        await base44.asServiceRole.entities.User.update(users[0].id, {
          business_id: user.business_id,
          vendor_role: data.role,
          vendor_permissions: data.permissions,
        });
      }
      if (saved.user_id !== users[0].id) {
        await base44.asServiceRole.entities.Employee.update(saved.id, { user_id: users[0].id });
        saved.user_id = users[0].id;
      }
    }

    const linkUrl = safeAppUrl(appUrl);
    if (linkUrl) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: data.email,
          subject: "You have been added to Concierge Pro",
          html: `<p>Hello ${escapeHtml(data.name)},</p><p>You have been added to Concierge Pro. Open the app and sign in or register with this email address to activate your employee access.</p><p><a href="${escapeHtml(linkUrl)}">Open Concierge Pro</a></p>`,
        });
      } catch (emailError) {
        console.warn("employee onboarding email failed", emailError);
      }
    }

    return Response.json({ employee: saved });
  } catch (error) {
    console.error("saveEmployee", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}