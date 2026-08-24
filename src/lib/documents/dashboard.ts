export interface DashboardDocument {
  id: string;
  title: string;
  type: string;
  status: string;
}

export function filterDashboardDocuments<T extends DashboardDocument>(
  documents: readonly T[],
  query: string,
  status: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  return documents.filter((document) => {
    const searchable = `${document.id} ${document.title} ${document.type}`.toLowerCase();
    return (!normalized || searchable.includes(normalized))
      && (status === "All documents" || document.status === status);
  });
}

export function summarizeOperationalData(input:{notifications:readonly {readAt:string|null}[];reviews:readonly {overdue:boolean}[];failures:readonly unknown[]}){
  return {unread:input.notifications.filter(item=>!item.readAt).length,overdue:input.reviews.filter(item=>item.overdue).length,failures:input.failures.length};
}
