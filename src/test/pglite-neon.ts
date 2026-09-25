// Test double for @neondatabase/serverless, backed by PGlite (real Postgres,
// compiled to WASM, in memory). It exposes exactly the client surface drizzle's
// neon-http driver uses — a callable/`query` that builds lazy queries, and
// `transaction()` that runs a list of them atomically, which is what db.batch()
// relies on — so src/db, and everything built on it, runs unmodified.
//
// Use from a test with:
//   vi.mock("@neondatabase/serverless", () => import("@/test/pglite-neon"));
// then `await migrate()` once to apply every drizzle/*.sql migration.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

export const pg = new PGlite();

type Opts = { arrayMode?: boolean } | undefined;
type Job = { sql: string; params: unknown[]; opts: Opts };

async function exec(conn: PGlite | Transaction, { sql, params, opts }: Job) {
  const r = await conn.query(sql, params ?? [], { rowMode: opts?.arrayMode ? "array" : "object" });
  return { rows: r.rows, fields: r.fields, rowCount: r.affectedRows ?? r.rows.length, command: "" };
}

export function neon() {
  const query = (sql: string, params: unknown[], opts?: Opts) => {
    const job: Job = { sql, params, opts };
    // Lazy like Neon's: runs when awaited, or later as part of a transaction.
    return Object.assign(job, {
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => exec(pg, job).then(res, rej),
    });
  };
  return Object.assign(query, {
    query,
    transaction: (jobs: Job[]) =>
      pg.transaction(async (tx) => {
        const out = [];
        for (const j of jobs) out.push(await exec(tx, j));
        return out;
      }),
  });
}

// drizzle's neon-http driver registers raw-string parsers for date types here.
export const types = {
  builtins: { TIMESTAMPTZ: 1184, TIMESTAMP: 1114, DATE: 1082, INTERVAL: 1186 },
  setTypeParser() {},
};

/** Apply every migration in drizzle/, in order — the schema the app really runs on. */
export async function migrate(): Promise<void> {
  const dir = join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
}
