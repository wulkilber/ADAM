import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/http.js";
import { AdamService } from "../server/service.js";
import { MemoryRepository } from "../server/storage.js";
import { MemoryJournal } from "../server/coordination.js";
import { demoDatabase } from "../server/demo.js";
import { configuration } from "../server/config.js";

test("HTTP: autenticação, CSRF, cadastro, PDF, arquivos privados e logout", async (t) => {
  const config = { demo: true, origin: "http://localhost", secure: false },
    repo = new MemoryRepository(demoDatabase()),
    auth = new Auth(config),
    service = new AdamService(repo, new MemoryJournal()),
    server = createServer({ config, auth, service });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  config.origin = `http://127.0.0.1:${server.address().port}`;
  const call = (p, options = {}) => fetch(config.origin + p, options);
  assert.equal(
    (await call("/api/carregarDados", { method: "POST" })).status,
    401,
  );
  assert.equal((await call("/.env")).status, 404);
  assert.equal((await call("/server/auth.js")).status, 404);
  const login = await call("/auth/demo", {
    method: "POST",
    headers: { Origin: config.origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.ok(login.headers.get("set-cookie").includes("HttpOnly"));
  const session = await (
      await call("/auth/session", { headers: { cookie } })
    ).json(),
    csrf = session.data.csrf;
  const headers = {
    cookie,
    Origin: config.origin,
    "X-CSRF-Token": csrf,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await call("/api/carregarDados", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.invalid" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/carregarDados", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  const data = await (
    await call("/api/carregarDados", { method: "POST", headers, body: "{}" })
  ).json();
  assert.ok(data.data.Alunos.length > 0);
  const newStudent = await (
    await call("/api/cadastrarAluno", {
      method: "POST",
      headers,
      body: JSON.stringify({
        nome: "Novo teste",
        matricula: "00000009",
        curso: "Teste",
        turma: "1A",
        chaveIdempotencia: crypto.randomUUID(),
      }),
    })
  ).json();
  assert.equal(newStudent.ok, true);
  const e = repo.db.Encaminhamentos[0];
  const pdf = await (
    await call("/api/gerarPdfEncaminhamento", {
      method: "POST",
      headers,
      body: JSON.stringify({
        encaminhamentoId: e.id,
        chaveIdempotencia: crypto.randomUUID(),
      }),
    })
  ).json();
  assert.equal(pdf.ok, true);
  assert.equal(
    Buffer.from(pdf.data.base64, "base64").subarray(0, 5).toString(),
    "%PDF-",
  );
  assert.equal(repo.db.Encaminhamentos[0].status, "PENDENTE");
  const logout = await call("/auth/logout", { method: "POST", headers });
  assert.equal(logout.status, 200);
  assert.equal(
    (await call("/auth/session", { headers: { cookie } })).status,
    401,
  );
});
test("Produção recusa demo e HTTP; integração exige configuração explícita", () => {
  assert.throws(() =>
    configuration({ NODE_ENV: "production", DEMO_MODE: "true" }, []),
  );
  assert.throws(() =>
    configuration({ NODE_ENV: "production", APP_URL: "http://localhost" }, []),
  );
  assert.throws(() => configuration({}, []));
  assert.equal(configuration({}, ["--demo"]).demo, true);
});
test("OAuth vincula tentativa ao navegador e valida nonce e domínio", async () => {
  const cfg = {
    origin: "https://adam.example.invalid",
    secure: true,
    clientId: "client",
    allowedDomain: "ifam.example.invalid",
  };
  let params, received;
  const client = {
    generateAuthUrl: (p) => {
      params = p;
      return "https://accounts.google.com/test";
    },
    getToken: async (p) => {
      received = p;
      return { tokens: { id_token: "mock" } };
    },
    verifyIdToken: async () => ({
      getPayload: () => ({
        email: "Pessoa@ifam.example.invalid",
        email_verified: true,
        nonce: params.nonce,
        hd: "ifam.example.invalid",
      }),
    }),
  };
  const auth = new Auth(cfg, { client }),
    start = auth.start();
  assert.ok(params.code_challenge);
  assert.equal(params.code_challenge_method, "S256");
  const email = await auth.callback(
    { headers: { cookie: start.cookie.split(";")[0] } },
    new URL(
      `${cfg.origin}/auth/google/callback?state=${params.state}&code=test`,
    ),
  );
  assert.equal(email, "pessoa@ifam.example.invalid");
  assert.ok(received.codeVerifier);
  auth.start();
  await assert.rejects(
    auth.callback(
      { headers: { cookie: "" } },
      new URL(
        `${cfg.origin}/auth/google/callback?state=${params.state}&code=test`,
      ),
    ),
    (e) => e.code === "UNAUTHENTICATED",
  );
  const next = auth.start();
  client.verifyIdToken = async () => ({
    getPayload: () => ({
      email: "x@ifam.example.invalid",
      email_verified: true,
      nonce: "wrong",
      hd: "ifam.example.invalid",
    }),
  });
  await assert.rejects(
    auth.callback(
      { headers: { cookie: next.cookie.split(";")[0] } },
      new URL(
        `${cfg.origin}/auth/google/callback?state=${params.state}&code=test`,
      ),
    ),
    (e) => e.code === "UNAUTHENTICATED",
  );
});
