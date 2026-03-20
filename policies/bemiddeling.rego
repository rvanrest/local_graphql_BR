package bemiddeling

import rego.v1

# ─── Default: deny everything ─────────────────────────────────────────────────
default allow := false
default deny_reason := "Access denied"
default allowed_fields := []
default row_filter := {}

# ─── Role helpers ─────────────────────────────────────────────────────────────

is_admin if input.token.role == "admin"
is_zorgkantoor if input.token.role == "zorgkantoor"
is_zorgaanbieder if input.token.role == "zorgaanbieder"
is_ciz if input.token.role == "ciz"

# ─── Query-level access ───────────────────────────────────────────────────────
# Controls which root query operations each role may call.

allowed_queries := {
  "admin":         {"client", "bemiddeling", "bemiddelingspecificatie", "overdracht", "regiehouder"},
  "ciz":           {"client", "bemiddeling", "bemiddelingspecificatie", "overdracht", "regiehouder"},
  "zorgkantoor":   {"client", "bemiddeling", "bemiddelingspecificatie", "overdracht", "regiehouder"},
  "zorgaanbieder": {"bemiddeling", "bemiddelingspecificatie", "regiehouder"},
}

allow if {
  queries := allowed_queries[input.token.role]
  input.query_name in queries
}

deny_reason := msg if {
  not allow
  msg := sprintf("Role '%v' is not permitted to call '%v'", [input.token.role, input.query_name])
}

# ─── Field-level access ───────────────────────────────────────────────────────
# Controls which fields are visible per role.
# Fields NOT in the list will be nulled out by the GraphQL middleware.

client_fields_by_role := {
  "admin":         {"clientID", "bsn", "leefeenheid", "huisarts", "communicatievorm", "taal"},
  "ciz":           {"clientID", "bsn", "leefeenheid", "huisarts", "communicatievorm", "taal"},
  "zorgkantoor":   {"clientID", "bsn", "leefeenheid", "communicatievorm", "taal"},
  "zorgaanbieder": {"clientID", "leefeenheid", "communicatievorm", "taal"},   # no BSN
}

allowed_fields := fields if {
  input.type_name == "Client"
  fields := client_fields_by_role[input.token.role]
}

allowed_fields := {
  "bemiddelingID", "clientID", "wlzIndicatieID",
  "verantwoordelijkZorgkantoor", "verantwoordelijkheidIngangsdatum",
  "verantwoordelijkheidEinddatum"
} if {
  input.type_name == "Bemiddeling"
  is_zorgaanbieder
}

# Admin, CIZ and zorgkantoor see all Bemiddeling fields
allowed_fields := {
  "bemiddelingID", "clientID", "wlzIndicatieID",
  "verantwoordelijkZorgkantoor", "verantwoordelijkheidIngangsdatum",
  "verantwoordelijkheidEinddatum"
} if {
  input.type_name == "Bemiddeling"
  not is_zorgaanbieder
}

# ─── Row-level filter ─────────────────────────────────────────────────────────
# Returns a filter object the server applies to SQL queries.
# Zorgkantoor may only see records for their own kantoor.
# Zorgaanbieder may only see bemiddelingen for their instelling.

row_filter := {"verantwoordelijkZorgkantoor": input.token.zorgkantoor} if {
  is_zorgkantoor
  input.query_name in {"bemiddeling", "bemiddelingspecificatie", "overdracht"}
}

row_filter := {"instelling": input.token.instelling} if {
  is_zorgaanbieder
  input.query_name in {"bemiddelingspecificatie", "regiehouder"}
}
