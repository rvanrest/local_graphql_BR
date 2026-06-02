'use strict';

const { createServer }             = require('node:http');
const { createSchema, createYoga } = require('graphql-yoga');
const initSqlJs                    = require('sql.js');
const fs                           = require('fs');
const path                         = require('path');

const { queryAll, queryOne } = require('./db-helpers');
const { initDb, seedDb }     = require('./db');

const DB_PATH     = path.join(__dirname, 'bemiddelingsregisterDB.db');
const SCHEMA_PATH = path.join(__dirname, 'bemiddelingsregister.graphql');

// ─── Filter builder ───────────────────────────────────────────────────────────
 
function applyOp(col, op, val, conditions, params) {
  switch (op) {
    case 'eq':          conditions.push(`${col} = ?`);           params.push(val);        break;
    case 'neq':         conditions.push(`${col} != ?`);          params.push(val);        break;
    case 'gt':          conditions.push(`${col} > ?`);           params.push(val);        break;
    case 'ngt':         conditions.push(`NOT ${col} > ?`);       params.push(val);        break;
    case 'gte':         conditions.push(`${col} >= ?`);          params.push(val);        break;
    case 'ngte':        conditions.push(`NOT ${col} >= ?`);      params.push(val);        break;
    case 'lt':          conditions.push(`${col} < ?`);           params.push(val);        break;
    case 'nlt':         conditions.push(`NOT ${col} < ?`);       params.push(val);        break;
    case 'lte':         conditions.push(`${col} <= ?`);          params.push(val);        break;
    case 'nlte':        conditions.push(`NOT ${col} <= ?`);      params.push(val);        break;
    case 'contains':    conditions.push(`${col} LIKE ?`);        params.push(`%${val}%`); break;
    case 'ncontains':   conditions.push(`${col} NOT LIKE ?`);    params.push(`%${val}%`); break;
    case 'startsWith':  conditions.push(`${col} LIKE ?`);        params.push(`${val}%`);  break;
    case 'nstartsWith': conditions.push(`${col} NOT LIKE ?`);    params.push(`${val}%`);  break;
    case 'endsWith':    conditions.push(`${col} LIKE ?`);        params.push(`%${val}`);  break;
    case 'nendsWith':   conditions.push(`${col} NOT LIKE ?`);    params.push(`%${val}`);  break;
    case 'in':
      if (Array.isArray(val) && val.length > 0) {
        conditions.push(`${col} IN (${val.map(() => '?').join(',')})`);
        params.push(...val);
      }
      break;
    case 'nin':
      if (Array.isArray(val) && val.length > 0) {
        conditions.push(`${col} NOT IN (${val.map(() => '?').join(',')})`);
        params.push(...val);
      }
      break;
  }
}
 
// buildFilter returns { conditions, params } where conditions is a plain string
// (no WHERE prefix) so it can be safely embedded anywhere.
// Call toClause() on the result to get the full WHERE clause for top-level queries.
function buildFilter(filter, fieldMap) {
  if (!filter) return { conditions: '', params: [] };
  const parts  = [];
  const params = [];
 
  function processFilter(f) {
    for (const [field, opInput] of Object.entries(f)) {
      if (field === 'and' && Array.isArray(opInput)) {
        const subs = opInput.map(sub => buildFilter(sub, fieldMap));
        const valid = subs.filter(s => s.conditions);
        if (valid.length) {
          parts.push('(' + valid.map(s => s.conditions).join(' AND ') + ')');
          valid.forEach(s => params.push(...s.params));
        }
        continue;
      }
      if (field === 'or' && Array.isArray(opInput)) {
        const subs = opInput.map(sub => buildFilter(sub, fieldMap));
        const valid = subs.filter(s => s.conditions);
        if (valid.length) {
          parts.push('(' + valid.map(s => s.conditions).join(' OR ') + ')');
          valid.forEach(s => params.push(...s.params));
        }
        continue;
      }
      if (!fieldMap[field]) continue;
      if (typeof opInput !== 'object' || opInput === null) continue;
      const col = fieldMap[field];
      for (const [op, val] of Object.entries(opInput)) {
        if (val !== undefined && val !== null) applyOp(col, op, val, parts, params);
      }
    }
  }
 
  processFilter(filter);
  const conditions = parts.join(' AND ');
  return { conditions, params };
}
 
// Convenience: wrap conditions in WHERE for top-level queries
function toWhereClause(filter, fieldMap) {
  const { conditions, params } = buildFilter(filter, fieldMap);
  return { clause: conditions ? `WHERE ${conditions}` : '', params };
}
 
function buildOrder(order, fieldMap) {
  if (!order || order.length === 0) return '';
  const parts = [];
  for (const item of order) {
    for (const [field, dir] of Object.entries(item)) {
      if (fieldMap[field] && (dir === 'ASC' || dir === 'DESC')) {
        parts.push(`${fieldMap[field]} ${dir}`);
      }
    }
  }
  return parts.length > 0 ? 'ORDER BY ' + parts.join(', ') : '';
}
 
// Merge a fixed FK constraint with an optional caller-supplied filter.
// The FK is always the first condition; the filter conditions are appended with AND.
function mergeWhere(fixedCol, fixedVal, filter, fieldMap) {
  const { conditions, params } = buildFilter(filter, fieldMap);
  if (!conditions) {
    return { clause: `WHERE ${fixedCol} = ?`, params: [fixedVal] };
  }
  return {
    clause: `WHERE ${fixedCol} = ? AND (${conditions})`,
    params: [fixedVal, ...params],
  };
}
 
// ─── Field maps (GraphQL field → SQL column) ──────────────────────────────────
 
const clientFields = {
  clientID: 'clientID', bsn: 'bsn', leefeenheid: 'leefeenheid',
  huisarts: 'huisarts', communicatievorm: 'communicatievorm', taal: 'taal',
};
 
const bemiddelingFields = {
  bemiddelingID: 'bemiddelingID', wlzIndicatieID: 'wlzIndicatieID',
  verantwoordelijkZorgkantoor: 'verantwoordelijkZorgkantoor',
  verantwoordelijkheidIngangsdatum: 'verantwoordelijkheidIngangsdatum',
  verantwoordelijkheidEinddatum: 'verantwoordelijkheidEinddatum',
};
 
const bemiddelingspecificatieFields = {
  bemiddelingspecificatieID: 'bemiddelingspecificatieID',
  leveringsvorm: 'leveringsvorm', zzpCode: 'zzpCode',
  toewijzingIngangsdatum: 'toewijzingIngangsdatum',
  toewijzingEinddatum: 'toewijzingEinddatum',
  instelling: 'instelling', uitvoerendZorgkantoor: 'uitvoerendZorgkantoor',
  vaststellingMoment: 'vaststellingMoment',
  percentage: 'percentage', pgbPercentage: 'pgbPercentage',
  opname: 'opname', redenIntrekking: 'redenIntrekking',
  etmalen: 'etmalen', instellingBestemming: 'instellingBestemming',
  soortToewijzing: 'soortToewijzing',
};
 
const overdrachtFields = {
  overdrachtID: 'overdrachtID',
  verantwoordelijkZorgkantoor: 'verantwoordelijkZorgkantoor',
  overdrachtDatum: 'overdrachtDatum', verhuisDatum: 'verhuisDatum',
  vaststellingMoment: 'vaststellingMoment',
};
 
const overdrachtspecificatieFields = {
  overdrachtspecificatieID: 'overdrachtspecificatieID',
  leveringsstatus: 'leveringsstatus',
  leveringsstatusClassificatie: 'leveringsstatusClassificatie',
  oorspronkelijkeToewijzingEinddatum: 'oorspronkelijkeToewijzingEinddatum',
};
 
const regiehouderFields = {
  regiehouderID: 'regiehouderID', instelling: 'instelling',
  ingangsdatum: 'ingangsdatum', einddatum: 'einddatum', regierol: 'regierol',
};
 
const contactpersoonFields = {
  contactpersoonID: 'contactpersoonID', relatienummer: 'relatienummer',
  volgorde: 'volgorde', soortRelatie: 'soortRelatie', rol: 'rol',
  relatie: 'relatie', geslachtsnaam: 'geslachtsnaam',
  voorvoegselGeslachtsnaam: 'voorvoegselGeslachtsnaam',
  partnernaam: 'partnernaam', voorvoegselPartnernaam: 'voorvoegselPartnernaam',
  voornamen: 'voornamen', voorletters: 'voorletters', roepnaam: 'roepnaam',
  naamgebruik: 'naamgebruik', geslacht: 'geslacht',
  geboortedatum: 'geboortedatum', geboortedatumgebruik: 'geboortedatumgebruik',
  ingangsdatum: 'ingangsdatum', einddatum: 'einddatum',
};
 
const clientContactgegevensFields = {
  clientContactgegevensID: 'clientContactgegevensID',
  adressoort: 'adressoort', straatnaam: 'straatnaam',
  huisnummer: 'huisnummer', huisletter: 'huisletter',
  huisnummertoevoeging: 'huisnummertoevoeging', postcode: 'postcode',
  plaatsnaam: 'plaatsnaam', land: 'land',
  aanduidingWoonadres: 'aanduidingWoonadres', emailadres: 'emailadres',
  telefoonnummer01: 'telefoonnummer01', landnummer01: 'landnummer01',
  telefoonnummer02: 'telefoonnummer02', landnummer02: 'landnummer02',
  ingangsdatum: 'ingangsdatum', einddatum: 'einddatum',
};
 
const contactpersoonContactgegevensFields = {
  contactpersoonContactgegevensID: 'contactpersoonContactgegevensID',
  adressoort: 'adressoort', straatnaam: 'straatnaam',
  huisnummer: 'huisnummer', huisletter: 'huisletter',
  huisnummertoevoeging: 'huisnummertoevoeging', postcode: 'postcode',
  plaatsnaam: 'plaatsnaam', land: 'land',
  aanduidingWoonadres: 'aanduidingWoonadres', emailadres: 'emailadres',
  telefoonnummer01: 'telefoonnummer01', landnummer01: 'landnummer01',
  telefoonnummer02: 'telefoonnummer02', landnummer02: 'landnummer02',
  ingangsdatum: 'ingangsdatum', einddatum: 'einddatum',
};
 
// ─── Resolvers ────────────────────────────────────────────────────────────────
 
function buildResolvers(db) {
  return {
    Query: {
      client: (_, { where }) => {
        const { clause, params } = toWhereClause(where, clientFields);
        return queryAll(db, `SELECT * FROM Client ${clause}`, params);
      },
      bemiddeling: (_, { where }) => {
        const { clause, params } = toWhereClause(where, bemiddelingFields);
        return queryAll(db, `SELECT * FROM Bemiddeling ${clause}`, params);
      },
      bemiddelingspecificatie: (_, { where }) => {
        const { clause, params } = toWhereClause(where, bemiddelingspecificatieFields);
        return queryAll(db, `SELECT * FROM Bemiddelingspecificatie ${clause}`, params);
      },
      overdracht: (_, { where }) => {
        const { clause, params } = toWhereClause(where, overdrachtFields);
        return queryAll(db, `SELECT * FROM Overdracht ${clause}`, params);
      },
      regiehouder: (_, { where }) => {
        const { clause, params } = toWhereClause(where, regiehouderFields);
        return queryAll(db, `SELECT * FROM Regiehouder ${clause}`, params);
      },
    },
 
    Client: {
      clientID: (p) => p.clientID,
      bemiddeling: (p, { where, order }) => {
        const { clause, params } = mergeWhere('clientID', p.clientID, where, bemiddelingFields);
        return queryAll(db, `SELECT * FROM Bemiddeling ${clause} ${buildOrder(order, bemiddelingFields)}`, params);
      },
      contactpersoon: (p, { where, order }) => {
        const { clause, params } = mergeWhere('clientID', p.clientID, where, contactpersoonFields);
        return queryAll(db, `SELECT * FROM Contactpersoon ${clause} ${buildOrder(order, contactpersoonFields)}`, params);
      },
      contactgegevens: (p, { where, order }) => {
        const { clause, params } = mergeWhere('clientID', p.clientID, where, clientContactgegevensFields);
        return queryAll(db, `SELECT * FROM ClientContactgegevens ${clause} ${buildOrder(order, clientContactgegevensFields)}`, params);
      },
    },
 
    Bemiddeling: {
      bemiddelingID: (p) => p.bemiddelingID,
      client: (p) =>
        queryOne(db, 'SELECT * FROM Client WHERE clientID = ?', [p.clientID]),
      bemiddelingspecificatie: (p, { where, order }) => {
        const { clause, params } = mergeWhere('bemiddelingID', p.bemiddelingID, where, bemiddelingspecificatieFields);
        return queryAll(db, `SELECT * FROM Bemiddelingspecificatie ${clause} ${buildOrder(order, bemiddelingspecificatieFields)}`, params);
      },
      regiehouder: (p, { where, order }) => {
        const { clause, params } = mergeWhere('bemiddelingID', p.bemiddelingID, where, regiehouderFields);
        return queryAll(db, `SELECT * FROM Regiehouder ${clause} ${buildOrder(order, regiehouderFields)}`, params);
      },
      overdracht: (p) =>
        queryOne(db, 'SELECT * FROM Overdracht WHERE bemiddelingID = ?', [p.bemiddelingID]),
    },
 
    Bemiddelingspecificatie: {
      bemiddelingspecificatieID: (p) => p.bemiddelingspecificatieID,
      percentage:    (p) => p.percentage    != null ? Number(p.percentage)    : null,
      pgbPercentage: (p) => p.pgbPercentage != null ? Number(p.pgbPercentage) : null,
      bemiddeling: (p) =>
        queryOne(db, 'SELECT * FROM Bemiddeling WHERE bemiddelingID = ?', [p.bemiddelingID]),
      overdrachtspecificatie: (p) =>
        queryOne(db, 'SELECT * FROM Overdrachtspecificatie WHERE bemiddelingspecificatieID = ?', [p.bemiddelingspecificatieID]),
    },
 
    Overdracht: {
      overdrachtID: (p) => p.overdrachtID,
      bemiddeling: (p) =>
        queryOne(db, 'SELECT * FROM Bemiddeling WHERE bemiddelingID = ?', [p.bemiddelingID]),
      overdrachtspecificatie: (p, { where, order }) => {
        const { clause, params } = mergeWhere('overdrachtID', p.overdrachtID, where, overdrachtspecificatieFields);
        return queryAll(db, `SELECT * FROM Overdrachtspecificatie ${clause} ${buildOrder(order, overdrachtspecificatieFields)}`, params);
      },
    },
 
    Overdrachtspecificatie: {
      overdrachtspecificatieID: (p) => p.overdrachtspecificatieID,
      overdracht: (p) =>
        queryOne(db, 'SELECT * FROM Overdracht WHERE overdrachtID = ?', [p.overdrachtID]),
      bemiddelingspecificatie: (p) =>
        queryOne(db, 'SELECT * FROM Bemiddelingspecificatie WHERE bemiddelingspecificatieID = ?', [p.bemiddelingspecificatieID]),
    },
 
    Regiehouder: {
      regiehouderID: (p) => p.regiehouderID,
      bemiddeling: (p) =>
        queryOne(db, 'SELECT * FROM Bemiddeling WHERE bemiddelingID = ?', [p.bemiddelingID]),
    },
 
    Contactpersoon: {
      contactpersoonID: (p) => p.contactpersoonID,
      client: (p) =>
        queryOne(db, 'SELECT * FROM Client WHERE clientID = ?', [p.clientID]),
      contactgegevens: (p, { where, order }) => {
        const { clause, params } = mergeWhere('contactpersoonID', p.contactpersoonID, where, contactpersoonContactgegevensFields);
        return queryAll(db, `SELECT * FROM ContactpersoonContactgegevens ${clause} ${buildOrder(order, contactpersoonContactgegevensFields)}`, params);
      },
    },
 
    ClientContactgegevens: {
      clientContactgegevensID: (p) => p.clientContactgegevensID,
      huisnummer: (p) => p.huisnummer != null ? Number(p.huisnummer) : null,
      client: (p) =>
        queryOne(db, 'SELECT * FROM Client WHERE clientID = ?', [p.clientID]),
    },
 
    ContactpersoonContactgegevens: {
      contactpersoonContactgegevensID: (p) => p.contactpersoonContactgegevensID,
      huisnummer: (p) => p.huisnummer != null ? Number(p.huisnummer) : null,
      contactpersoon: (p) =>
        queryOne(db, 'SELECT * FROM Contactpersoon WHERE contactpersoonID = ?', [p.contactpersoonID]),
    },
  };
}
 
// ─── Boot ─────────────────────────────────────────────────────────────────────
 
async function main() {
  const SQL = await initSqlJs();
  const db  = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
 
  initDb(db, DB_PATH);
  seedDb(db, DB_PATH);
 
  const typeDefs  = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const resolvers = buildResolvers(db);
 
  const yoga = createYoga({
    schema: createSchema({ typeDefs, resolvers }),
    logging: true,
  });
 
  createServer(yoga).listen(4000, () => {
    console.log('');
    console.log('  ✅  iWlz Bemiddelingsregister GraphQL server running');
    console.log('  🌐  http://localhost:4000/graphql');
    console.log('');
    console.log('  Probeer deze query in GraphiQL:');
    console.log('');
    console.log('  query test {');
    console.log('    bemiddelingspecificatie(');
    console.log('      where: {');
    console.log('        bemiddelingspecificatieID: {eq: "aaaaaaaa-0003-4000-a000-000000000003"}');
    console.log('      }');
    console.log('    ) {');
    console.log('      bemiddelingspecificatieID');
    console.log('      toewijzingIngangsdatum');
    console.log('      toewijzingEinddatum');
    console.log('      soortToewijzing');
    console.log('      bemiddeling {');
    console.log('        bemiddelingID');
    console.log('        verantwoordelijkZorgkantoor');
    console.log('      }');
    console.log('    }');
    console.log('  }');
    console.log('');
    console.log('');
    console.log('  Om de server te stoppen, druk op Ctrl+C');
    console.log('');
    console.log('');
  });
}
 
main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
 