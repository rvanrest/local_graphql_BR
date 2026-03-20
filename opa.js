'use strict';

// ─── OPA sidecar client ───────────────────────────────────────────────────────
// Sends policy evaluation requests to the OPA REST API (localhost:8181).
// OPA must be running before the GraphQL server starts — start.bat handles this.

const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const POLICY  = 'bemiddeling'; // matches package name in policies/bemiddeling.rego

// Evaluate the full policy for a given request context.
// Returns { allow, deny_reason, allowed_fields, row_filter }
async function evaluate(token, queryName, typeName = null) {
  const input = {
    token,
    query_name: queryName,
    type_name:  typeName,
  };

  try {
    const res = await fetch(`${OPA_URL}/v1/data/${POLICY}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ input }),
    });

    if (!res.ok) {
      throw new Error(`OPA returned HTTP ${res.status}`);
    }

    const body = await res.json();
    const result = body.result ?? {};

    return {
      allow:          result.allow          ?? false,
      deny_reason:    result.deny_reason    ?? 'Access denied',
      allowed_fields: result.allowed_fields ?? null,   // null = no field restriction
      row_filter:     result.row_filter     ?? {},
    };
  } catch (err) {
    // If OPA is unreachable, fail closed (deny everything)
    console.error('[OPA] Evaluation failed:', err.message);
    return {
      allow:       false,
      deny_reason: 'Policy engine unavailable',
      allowed_fields: null,
      row_filter:  {},
    };
  }
}

// Check if OPA is running - called at startup
async function healthCheck() {
  try {
    const res = await fetch(`${OPA_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { evaluate, healthCheck };
