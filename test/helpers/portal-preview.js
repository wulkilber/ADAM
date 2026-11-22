import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { passwordRecord } from "../../server/accounts.js";
import { Auth } from "../../server/auth.js";
import { demoDatabase } from "../../server/demo.js";
import { createServer } from "../../server/http.js";
import { AdamService } from "../../server/service.js";
import { MemoryRepository } from "../../server/storage.js";

export async function startPortalPreview(port = 0) {
  const db = demoDatabase();
  const accounts = [
    {
      ...db.Usuarios[0],
      nome: "Administrador de teste",
      usuario: "admin",
      perfil: "ADMIN",
    },
    {
      id: "demo-assistente",
      nome: "Assistente de teste",
      usuario: "assistente",
      perfil: "ASSISTENTE",
    },
    { id: "demo-depe", nome: "Equipe DEPE", usuario: "depe", perfil: "DEP" },
  ];
  db.Usuarios = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      email: "",
      ativo: true,
      credentials: await passwordRecord("adamteste"),
    })),
  );
  const repo = Object.assign(new MemoryRepository(db), { atomic: true });
  const config = {
    passwordLogin: true,
    demo: true,
    origin: `http://127.0.0.1:${port}`,
    secure: false,
  };
  const server = createServer({
    config,
    auth: new Auth(config),
    service: new AdamService(repo),
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  config.origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin: config.origin };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin } = await startPortalPreview(3100);
  console.log(`ADAM para revisão em ${origin} (dados fictícios)`);
  console.log("Usuários: admin, assistente e depe. Senha de teste: adamteste.");
}
