// PostgREST can cap a response independently of the requested range. Use
// exact visible count and a stable order, and fail rather than return a
// successful partial operational list or export.
export async function paginateAll(fetchPage, pageSize = 500) {
  const rows = [];
  const ids = new Set();
  let count = null;
  while (count === null || rows.length < count) {
    const { data, count: pageCount, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!Number.isSafeInteger(pageCount) || pageCount < 0 || !Array.isArray(data)) {
      throw new Error('Incomplete paginated response');
    }
    if (count !== null && pageCount !== count) throw new Error('Dataset changed during pagination; retry');
    count = pageCount;
    if (data.length === 0 && rows.length < count) throw new Error('Incomplete paginated response');
    for (const row of data) {
      if (row?.id != null) {
        if (ids.has(row.id)) throw new Error('Dataset changed during pagination; retry');
        ids.add(row.id);
      }
      rows.push(row);
    }
    if (rows.length > count) throw new Error('Inconsistent paginated response');
  }
  return rows;
}
