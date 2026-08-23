// Shared by both storage backends (localDb.js / sheetsDb.js): derives the
// next sequential id (e.g. "B0001" -> "B0002") from whatever the storage
// layer currently holds, so switching backends never changes id format.
function nextId(records, prefix) {
  const nums = records
    .map((r) => {
      const idField = Object.keys(r).find((k) => k.endsWith('_id'));
      const val = idField ? String(r[idField]) : '';
      const m = val.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

module.exports = { nextId };
