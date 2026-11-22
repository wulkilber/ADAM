import { GoogleAuth } from "google-auth-library";
import { configuration } from "./config.js";
import { SheetsRepository, MemoryRepository } from "./storage.js";
import { DiskJournal, MemoryJournal, acquireInstance } from "./coordination.js";
import { AdamService } from "./service.js";
import { Auth } from "./auth.js";
import { createServer } from "./http.js";
import { PostgresRepository } from "./postgres.js";
import { passwordRecord, validateUsername } from "./accounts.js";
import { randomUUID } from "node:crypto";
import { demoDatabase } from "./demo.js";

async function start() {
  const config = configuration();
  let repo,
    journal,
    release = async () => {};
  if (config.demo) {
    repo = new MemoryRepository(demoDatabase());
    journal = new MemoryJournal();
  } else if (config.passwordLogin) {
    repo = new PostgresRepository(config.databaseUrl);
    release = () => repo.pool.end();
    try {
      const db = demoDatabase();
      for (const table of Object.keys(db)) db[table] = [];
      db.AnosLetivos.push({
        ano: new Date().getFullYear(),
        ativoParaRegistro: true,
      });
      await repo.initialize(db);
      const snapshot = await repo.read();
      if (!snapshot.db.Usuarios.length) {
        const usuario = validateUsername(process.env.ADAM_INITIAL_USER);
        const credentials = await passwordRecord(
          process.env.ADAM_INITIAL_PASSWORD,
        );
        await repo.commit(
          await repo.prepare(snapshot, [
            {
              table: "Usuarios",
              row: {
                id: randomUUID(),
                nome: "Administrador",
                usuario,
                email: "",
                perfil: "ADMIN",
                ativo: true,
                credentials,
                trocaSenha: true,
              },
            },
          ]),
        );
      }
    } catch (error) {
      await release();
      throw error;
    }
  } else {
    release = await acquireInstance(config.dataDir);
    try {
      const google = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        ...(config.credentialsJson
          ? { credentials: JSON.parse(config.credentialsJson) }
          : {}),
      });
      repo = new SheetsRepository(
        await google.getClient(),
        config.spreadsheetId,
      );
      journal = new DiskJournal(config.dataDir);
      const snapshot = await repo.read();
      if (snapshot.db.Operacoes.some((o) => o.estado !== "CONCLUIDA"))
        throw new Error(
          "Reconcilie as operações antigas no Apps Script antes de iniciar o ADAM.",
        );
    } catch (e) {
      await release();
      throw e;
    }
  }
  const service = new AdamService(repo, journal),
    auth = new Auth(config),
    server = createServer({ config, auth, service });
  server.on("error", async (e) => {
    console.error("Não foi possível iniciar o servidor: " + e.code);
    await release();
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () =>
    console.log(
      `ADAM disponível em ${config.origin} — ${config.demo ? "DEMONSTRAÇÃO: somente dados fictícios em memória" : config.passwordLogin ? "PostgreSQL" : "Google Sheets; instância única"}`,
    ),
  );
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      if (stopping) return;
      stopping = true;
      server.close(async () => {
        await service.queue.tail;
        await release();
        process.exit(0);
      });
      server.closeIdleConnections();
    });
}
start().catch((e) => {
  console.error("Falha na inicialização: " + (e.code || e.message));
  process.exitCode = 1;
});
