'use strict';

const fs = require('fs');

// ─── sql.js query helpers ─────────────────────────────────────────────────────

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(db, sql, params = []) {
  return queryAll(db, sql, params)[0] ?? null;
}

function saveDb(db, dbPath) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

module.exports = { queryAll, queryOne, saveDb };
