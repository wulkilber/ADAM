import pg from "pg";
import { SCHEMA } from "./schema.js";
import { fault } from "./errors.js";

export class PostgresRepository {
  atomic = true;
  constructor(url) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
    });
    this.pool.on("error", () =>
      console.error("Conexão ociosa do PostgreSQL interrompida."),
    );
  }
  async initialize(db) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(480921723)");
      await client.query("create schema if not exists adam");
      await client.query("revoke all on schema adam from public");
      await client.query(`create table if not exists adam.state (
        singleton boolean primary key check (singleton), revision bigint not null default 0, db jsonb not null
      )`);
      await client.query("revoke all on table adam.state from public");
      await client.query(
        "insert into adam.state(singleton, db) values (true,$1) on conflict do nothing",
        [db],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async read() {
    const { rows } = await this.pool.query(
      "select revision, db from adam.state where singleton",
    );
    return rows[0];
  }
  async prepare(snapshot, writes) {
    const db = structuredClone(snapshot.db);
    for (const { table, row } of writes) {
      const key = SCHEMA[table][0];
      const index = db[table].findIndex(
        (old) => String(old[key]) === String(row[key]),
      );
      if (index === -1) db[table].push(row);
      else db[table][index] = row;
    }
    return { revision: snapshot.revision, db };
  }
  async commit(batch) {
    const { rowCount } = await this.pool.query(
      "update adam.state set db=$1, revision=revision+1 where singleton and revision=$2",
      [batch.db, batch.revision],
    );
    if (!rowCount)
      fault(
        "VERSION_CONFLICT",
        "Os dados foram atualizados. Recarregue e repita a operação.",
        409,
      );
  }
}
