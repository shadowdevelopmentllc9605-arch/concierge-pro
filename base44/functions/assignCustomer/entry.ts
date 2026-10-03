import { createClientFromRequest } from "npm:@base44/sdk";

const CUSTOMER_APP_ID = "698951bc103c5b61b68d35b7";

async function getToken(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ key: "cross_app_sync", enabled: true });
  return configs[0]?.token || null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.business_id) return Response.json({ error: "Vendor membership required" }, { status: 403 });

    const { customerId, employeeId } = await req.json();
    const customers = await base44.asServiceRole.entities.StoreCustomer.filter({
      id: customerId,
      business_id: user.business_id,
    });
    const customer = customers[0];
    if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

    const employees = await base44.asServiceRole.entities.Employee.filter({
      id: employeeId,
      business_id: user.business_id,
    });
    const employee = employees[0];
    if (!employee || employee.status === "inactive") {
      return Response.json({ error: "Employee not found" }, { status: 404 });
    }

    const isManager = user.vendor_role === "manager";
    if (!isManager && employee.user_id !== user.id) {
      return Response.json({ error: "Employees may only assign themselves" }, { status: 403 });
    }
    if (!isManager && customer.assigned_employee_id && customer.assigned_employee_id !== employee.id) {
      return Response.json({ error: "This customer is already assigned to another employee" }, { status: 409 });
    }

    await base44.asServiceRole.entities.StoreCustomer.update(customer.id, {
      assigned_employee_id: employee.id,
      in_store: true,
    });

    let synced = false;
    if (customer.linked_customer_id) {
      const visits = await base44.asServiceRole.entities.StoreVisit.filter({
        customer_id: customer.id,
        business_id: user.business_id,
        status: "active",
      });
      const externalCheckinId = visits[0]?.external_checkin_id;
      const token = await getToken(base44);
      if (externalCheckinId && token) {
        const response = await fetch(`https://base44.app/api/apps/${CUSTOMER_APP_ID}/functions/vendorBridge`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-concierge-sync-secret": token,
          },
          body: JSON.stringify({
            action: "assignment",
            externalCheckinId,
            employeeId: employee.id,
            employeeName: employee.name,
          }),
        });
        synced = response.ok;
      }
    }

    return Response.json({ success: true, employee, synced });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
