Let me first read the uploaded schema carefully.Good — I can see the schema clearly. The key directive is on line 103:

```graphql
pgbPercentage: Int @authORIZED(role: ["admin", "zorgkantoor"])
```

The approach here is to **parse the directives from the schema at startup**, build a directive map in memory, then use that map to drive the OPA policy — so the schema itself becomes the single source of truth for field-level access control. No more hardcoding field lists in the `.rego` file.

Here's the full plan:

- `schema-directives.js` — parses the `.graphql` file at boot and extracts all `@authorized` and `@forbidden` annotations into a map
- Updated `bemiddeling.rego` — reads `allowed_roles` from the input (provided by the server from the directive map) instead of hardcoded lists
- Updated `server_bemiddeling_opa.js` — passes directive metadata to OPA per field resolution, and enforces via the `onExecute` field-level plugin

Let me build it:Now update `opa.js` to add the field-check evaluation endpoint:Now the main server — this is where everything comes together with the directive-aware field resolver plugin:Four updated files. Here's exactly how the directive-to-OPA pipeline works end to end:

---

## How it all connects

### 1. Schema is the single source of truth

Your `schema.graphql` now carries the access rules directly on the field:

```graphql
pgbPercentage: Int @authorized(role: ["admin", "zorgkantoor"])
```

To add a new restriction, you edit the schema — nothing else changes.

### 2. `schema-directives.js` parses at startup

When the server boots, it reads the schema file and builds a directive map in memory:

```js
{
  "Bemiddelingspecificatie.pgbPercentage": {
    authorized: ["admin", "zorgkantoor"],
    forbidden: null
  }
}
```

The startup log prints every rule it found, so you can verify the parsing:
```
📋  Schema directives parsed: 1 field rule(s) found
    @authorized  Bemiddelingspecificatie.pgbPercentage → [admin, zorgkantoor]
```

### 3. Yoga's `onResolve` plugin intercepts every directive-annotated field

When a resolver tries to return `pgbPercentage`, the `onResolve` hook fires, checks the directive map, calls `checkFieldAccess`, and if the role isn't in `["admin", "zorgkantoor"]`, it replaces the value with `null` and throws a `FORBIDDEN` error. The response still succeeds for the rest of the query — GraphQL partial errors:

```json
{
  "data": {
    "bemiddelingspecificatie": [{ "zzpCode": "ZZP06", "pgbPercentage": null }]
  },
  "errors": [{ 
    "message": "Field 'pgbPercentage' on type 'Bemiddelingspecificatie' requires one of roles: [admin, zorgkantoor]. Your role: 'zorgaanbieder'",
    "extensions": { "code": "FORBIDDEN", "field": "Bemiddelingspecificatie.pgbPercentage" }
  }]
}
```

### 4. OPA's `field_check` input is driven by the directive map

The `.rego` file no longer hardcodes any field names or roles. Instead it receives:

```json
{
  "field_check": {
    "type_name": "Bemiddelingspecificatie",
    "field_name": "pgbPercentage",
    "authorized_roles": ["admin", "zorgkantoor"],
    "is_forbidden": false,
    "forbidden_reason": null
  }
}
```

### Adding more directives to the schema

Just annotate any field in `schema.graphql` and restart — the entire enforcement chain updates automatically:

```graphql
bsn: String! @authorized(role: ["admin", "ciz"])
huisarts: String @forbidden(reason: "Privacy: not exposed via API")
```