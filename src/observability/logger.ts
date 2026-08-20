const SECRET_KEYS =
  /authorization|cookie|token|password|secret|content|body|patch/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v),
      ]),
    );
  }
  return value;
}

export function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safeFields = redact(fields) as Record<string, unknown>;
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, event, ...safeFields })}\n`,
  );
}
