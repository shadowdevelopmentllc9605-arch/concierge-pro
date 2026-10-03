import { createClientFromRequest } from "npm:@base44/sdk";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.business_id || user?.vendor_role !== "manager") {
      return Response.json({ error: "Manager access required" }, { status: 403 });
    }

    const { employeeId } = await req.json();
    const records = await base44.asServiceRole.entities.Employee.filter({ id: employeeId, business_id: user.business_id });
    const employee = records[0];
    if (!employee) return Response.json({ error: "Employee not found" }, { status: 404 });
    if (employee.user_id === user.id) return Response.json({ error: "You cannot remove your own manager membership here" }, { status: 400 });

    if (employee.user_id) {
      await base44.asServiceRole.entities.User.update(employee.user_id, {
        business_id: "",
        vendor_role: "",
        vendor_permissions: {},
      });
    }
    await base44.asServiceRole.entities.Employee.delete(employee.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("removeEmployee", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
