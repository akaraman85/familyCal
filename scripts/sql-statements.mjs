export function sqlStatements(sql) {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}
