'use strict';

// ─── Test JWT generator ───────────────────────────────────────────────────────
// Run once to create test tokens: node generate-tokens.js
// Tokens are saved to policies/tokens/ and printed to console.
// Uses the same secret as auth.js so the server will accept them.

const { SignJWT } = require('jose');
const fs   = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'iwlz-dev-secret-change-in-production-min32chars!';
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
const OUT_DIR    = path.join(__dirname, 'policies', 'tokens');

const TEST_IDENTITIES = [
  {
    filename: 'admin',
    claims: {
      sub:  'user-admin-001',
      role: 'admin',
    },
  },
  {
    filename: 'zorgkantoor_vgz',
    claims: {
      sub:         'user-zk-vgz-001',
      role:        'zorgkantoor',
      zorgkantoor: 'VGZ',
    },
  },
  {
    filename: 'zorgkantoor_cz',
    claims: {
      sub:         'user-zk-cz-001',
      role:        'zorgkantoor',
      zorgkantoor: 'CZ',
    },
  },
  {
    filename: 'zorgaanbieder',
    claims: {
      sub:        'user-za-001',
      role:       'zorgaanbieder',
      instelling: 'Zorgcentrum De Eik',
    },
  },
  {
    filename: 'ciz',
    claims: {
      sub:  'user-ciz-001',
      role: 'ciz',
    },
  },
];

async function generate() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n  iWlz Test JWT Generator');
  console.log('  ========================\n');
  console.log(`  Secret: ${JWT_SECRET}\n`);

  for (const identity of TEST_IDENTITIES) {
    const token = await new SignJWT(identity.claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .sign(SECRET_KEY);

    const outPath = path.join(OUT_DIR, `${identity.filename}.jwt`);
    fs.writeFileSync(outPath, token);

    console.log(`  Role: ${identity.claims.role.padEnd(15)} (${identity.filename})`);
    if (identity.claims.zorgkantoor) console.log(`    zorgkantoor: ${identity.claims.zorgkantoor}`);
    if (identity.claims.instelling)  console.log(`    instelling:  ${identity.claims.instelling}`);
    console.log(`    Token saved: policies/tokens/${identity.filename}.jwt`);
    console.log(`    Bearer: ${token.slice(0, 60)}...\n`);
  }

  console.log('  Use in GraphiQL headers:');
  console.log('  { "Authorization": "Bearer <paste token here>" }\n');
}

generate().catch(console.error);
