// Employee.status is authoritative for vendor access: an employee record that is
// missing or marked 'inactive' means membership is revoked, no matter what the
// User record still says. Callers must use this instead of trusting
// User.vendor_role / User.vendor_permissions alone.
export async function getActiveEmployee(base44: any, user: any) {
  if (!user?.business_id) return null;
  const employees = await base44.asServiceRole.entities.Employee.filter({
    user_id: user.id,
    business_id: user.business_id,
  });
  const employee = employees[0];
  return employee && employee.status !== "inactive" ? employee : null;
}