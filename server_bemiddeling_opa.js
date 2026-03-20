'use strict';

const { createServer }             = require('node:http');
const { createSchema, createYoga } = require('graphql-yoga');
const initSqlJs                    = require('sql.js');
const fs                           = require('fs');
const path                         = require('path');

const { queryAll, queryOne } = require('./db-helpers');
const { initDb, seedDb }     = require('./db');
const { verifyToken }        = require('./auth');
const { evaluate, healthCheck } = require('./opa');

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

// buildFilter returns { conditions, params } — no WHERE prefix, safe for nesting
function buildFilter(filter, fieldMap) {
  if (!filter) return { conditions: '', params: [] };
  const parts  = [];
  const params = [];

  function processFilter(f) {
    for (const [field, opInput] of Object.entries(f)) {
      if (field === 'and' && Array.isArray(opInput)) {
        const subs  = opInput.map(sub => buildFilter(sub, fieldMap));
        const valid = subs.filter(s => s.conditions);
        if (valid.length) {
          parts.push('(' + valid.map(s => s.conditions).join(' AND ') + ')');
          valid.forEach(s => params.push(...s.params));
        }
        continue;
      }
      if (field === 'or' && Array.isArray(opInput)) {
        const subs  = opInput.map(sub => buildFilter(sub, fieldMap));
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
  return { conditions: parts.join(' AND '), params };
}

// Wraps conditions in WHERE for top-level use
function toWhereClause(filter, fieldMap) {
  const { conditions, params } = buildFilter(filter, fieldMap);
  return { clause: conditions ? `WHERE ${conditions}` : '', params };
}

// Merges a mandatory FK condition with optional caller-supplied filter
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

// ─── Row filter helper ────────────────────────────────────────────────────────
// OPA returns a row_filter object like { verantwoordelijkZorgkantoor: "VGZ" }.
// This appends those conditions to an existing WHERE clause.

function applyRowFilter(existingClause, existingParams, rowFilter) {
  if (!rowFilter || Object.keys(rowFilter).length === 0) {
    return { clause: existingClause, params: existingParams };
  }

  const conditions = Object.entries(rowFilter).map(([col]) => `${col} = ?`);
  const values     = Object.values(rowFilter);

  if (existingClause.includes('WHERE')) {
    return {
      clause: `${existingClause} AND ${conditions.join(' AND ')}`,
      params: [...existingParams, ...values],
    };
  }
  return {
    clause: `WHERE ${conditions.join(' AND ')}`,
    params: [...existingParams, ...values],
  };
}

// ─── Field masking ────────────────────────────────────────────────────────────
// Nulls out fields in a result row that OPA did not include in allowed_fields.

function maskFields(row, allowedFields) {
  if (!allowedFields || allowedFields.size === 0) return row;
  const masked = { ...row };
  for (const key of Object.keys(masked)) {
    if (!allowedFields.has(key)) masked[key] = null;
  }
  return masked;
}

// ─── OPA middleware (Yoga plugin) ─────────────────────────────────────────────

function buildOpaPlugin() {
  return {
    async onExecute({ args, setResultAndStopExecution }) {
      const context = args.contextValue;

      // Token is already verified and attached to context by onRequest
      if (!context.tokenValid) {
        setResultAndStopExecution({
          errors: [{ message: context.tokenError || 'Unauthorized' }],
        });
        return;
      }

      // Extract the root query/operation name from the parsed document
      const operation = args.document.definitions.find(
        d => d.kind === 'OperationDefinition'
      );
      if (!operation) return;

      const queryName = operation.selectionSet.selections[0]?.name?.value;
      if (!queryName) return;

      // Ask OPA whether this role may call this query
      const decision = await evaluate(context.token, queryName);

      if (!decision.allow) {
        setResultAndStopExecution({
          errors: [{ message: decision.deny_reason }],
        });
        return;
      }

      // Attach OPA decision to context for resolvers to use
      context.opaDecision  = decision;
      context.queryName    = queryName;
    },
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
      // Each root resolver applies the OPA row_filter on top of any user-supplied filter
      client: async (_, { where }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = toWhereClause(where, clientFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        const rows = queryAll(db, `SELECT * FROM Client ${clause}`, params);
        // Field masking: ask OPA which Client fields this role may see
        const decision = await evaluate(ctx.token, ctx.queryName, 'Client');
        const allowed  = decision.allowed_fields ? new Set(decision.allowed_fields) : null;
        return rows.map(r => maskFields(r, allowed));
      },

      bemiddeling: (_, { where }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = toWhereClause(where, bemiddelingFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        return queryAll(db, `SELECT * FROM Bemiddeling ${clause}`, params);
      },

      bemiddelingspecificatie: (_, { where }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = toWhereClause(where, bemiddelingspecificatieFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        return queryAll(db, `SELECT * FROM Bemiddelingspecificatie ${clause}`, params);
      },

      overdracht: (_, { where }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = toWhereClause(where, overdrachtFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        return queryAll(db, `SELECT * FROM Overdracht ${clause}`, params);
      },

      regiehouder: (_, { where }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = toWhereClause(where, regiehouderFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        return queryAll(db, `SELECT * FROM Regiehouder ${clause}`, params);
      },
    },

    Client: {
      clientID: (p) => p.clientID,
      bemiddeling: (p, { where, order }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = mergeWhere('clientID', p.clientID, where, bemiddelingFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        const ord = buildOrder(order, bemiddelingFields);
        return queryAll(db, `SELECT * FROM Bemiddeling ${clause} ${ord}`, params);
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
      bemiddelingspecificatie: (p, { where, order }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = mergeWhere('bemiddelingID', p.bemiddelingID, where, bemiddelingspecificatieFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
        return queryAll(db, `SELECT * FROM Bemiddelingspecificatie ${clause} ${buildOrder(order, bemiddelingspecificatieFields)}`, params);
      },
      regiehouder: (p, { where, order }, ctx) => {
        const rowFilter = ctx.opaDecision?.row_filter ?? {};
        let { clause, params } = mergeWhere('bemiddelingID', p.bemiddelingID, where, regiehouderFields);
        ({ clause, params } = applyRowFilter(clause, params, rowFilter));
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

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function main() {
  // Check OPA is running
  const opaReady = await healthCheck();
  if (!opaReady) {
    console.error('');
    console.error('  ❌  OPA sidecar is not running!');
    console.error('  Start it first with: opa run --server --addr :8181 ./policies');
    console.error('  Or use start.bat to launch everything together.');
    console.error('');
    process.exit(1);
  }
  console.log('  ✅  OPA sidecar reachable at http://localhost:8181');

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
    plugins: [buildOpaPlugin()],

    // Verify JWT and attach token to context on every request
    context: async ({ request }) => {
      const authHeader = request.headers.get('authorization');
      const { valid, token, error } = await verifyToken(authHeader);
      return {
        tokenValid: valid,
        tokenError: error,
        token:      token ?? null,
      };
    },
  });

  createServer(yoga).listen(4000, () => {
    console.log('');
    console.log('  ✅  iWlz Bemiddelingsregister GraphQL server running');
    console.log('  🌐  http://localhost:4000/graphql');
    console.log('');
    console.log('  Probeer deze query in GraphiQL: (niet zeker of dit werkt zonder eerst de JWT te genereren en in te stellen, maar je krijgt in ieder geval een idee van de syntax)');
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
    console.log('  First run: node generate-tokens.js  to create test JWTs');
    console.log('');
    console.log('  Set Authorization header in GraphiQL:');
    console.log('  { "Authorization": "Bearer <token from policies/tokens/>" }');
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
