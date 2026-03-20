'use strict';

const { jwtVerify, importPKCS8, importSPKI, createLocalJWKSet, decodeJwt } = require('jose');

// ─── JWT Secret ───────────────────────────────────────────────────────────────
// For a portable dev setup we use a symmetric HS256 secret.
// In production, replace with RS256 and a proper JWKS endpoint.

const JWT_SECRET = process.env.JWT_SECRET || 'iwlz-dev-secret-change-in-production-min32chars!';
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

// ─── Verify and decode a Bearer token ────────────────────────────────────────

async function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or malformed Authorization header' };
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ['HS256'],
    });

    // Require mandatory claims
    if (!payload.role) {
      return { valid: false, error: 'Token missing required claim: role' };
    }

    return {
      valid: true,
      token: {
        sub:          payload.sub          ?? 'unknown',
        role:         payload.role,
        zorgkantoor:  payload.zorgkantoor  ?? null,  // required for role=zorgkantoor
        instelling:   payload.instelling   ?? null,  // required for role=zorgaanbieder
        exp:          payload.exp,
      },
    };
  } catch (err) {
    return { valid: false, error: `Token verification failed: ${err.message}` };
  }
}

module.exports = { verifyToken };
