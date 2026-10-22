import type { ValidationResult } from "@mit-sdg/sync-engine/boundary";

// Every current public input is a scalar string. Reject objects before they can
// become MongoDB query operators. Required keys are checked by endpoint contracts.
const nullable = new Set(["evidence", "evidenceImage", "evidenceImageName", "resolverUsername"]);

export function validateRequest(value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  for (const [key, field] of Object.entries(value)) {
    if (field === null && nullable.has(key)) continue;
    if (typeof field !== "string") return { ok: false };
    if (key === "outcome" && !["TRUE", "FALSE", "VOID"].includes(field)) return { ok: false };
    if (key === "deadline" && !Number.isFinite(Date.parse(field))) return { ok: false };
  }
  return { ok: true };
}
