import { z } from "zod";
import { AppError } from "./errors";

/**
 * Validate a slice of `process.env` against a Zod schema, once.
 * Fails loudly at boot with the names (never the values) of bad variables.
 */
export function loadEnv<S extends z.ZodType>(schema: S, source: Record<string, string | undefined> = process.env): z.infer<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new AppError("INTERNAL", `Invalid environment configuration:\n${problems.join("\n")}`);
  }
  return parsed.data;
}

export const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string");
