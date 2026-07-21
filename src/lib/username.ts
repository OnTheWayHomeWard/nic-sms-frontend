// Username format: workspace-[division]-role-name. Workspace and role are
// optional, so include only the parts that are present.
export function buildUsername(
  dept: string,
  role: string,
  fullName: string,
  division: string,
) {
  const first = fullName.split(" ")[0];
  const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const parts: string[] = [];
  if (dept.trim()) parts.push(slug(dept));
  if (division.trim()) parts.push(slug(division));
  if (role.trim()) parts.push(slug(role));
  if (first) parts.push(slug(first));
  return parts.join("-");
}
