/** Normalize human-entered task search text without making task IDs punctuation-sensitive. */
export function normalizeTaskSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function matchesTaskSearch(task: Record<string, any>, value: unknown): boolean {
  const query = normalizeTaskSearchText(value);
  if (!query) return true;

  const fields = [task.taskId, task.id, task.title, task.description, ...(Array.isArray(task.tags) ? task.tags : [])];
  return fields.some(field => normalizeTaskSearchText(field).includes(query));
}
