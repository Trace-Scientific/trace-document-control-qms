export type ReceiptSite = { id: string; name: string; active: boolean };
export type ReceiptDepartment = { id: string; name: string; siteId: string | null; active: boolean };
export type ReceiptLocations = { sites: ReceiptSite[]; departments: ReceiptDepartment[] };

export function availableReceiptDepartments(locations: ReceiptLocations, siteId: string | null) {
  if (siteId && !locations.sites.some(site => site.id === siteId && site.active)) return [];
  return locations.departments.filter(department => department.active && department.siteId === siteId);
}
