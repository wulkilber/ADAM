import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { passwordRecord } from "../server/accounts.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/http.js";
import { AdamService } from "../server/service.js";
import { MemoryRepository } from "../server/storage.js";
import { demoDatabase } from "../server/demo.js";

test("Portal PostgreSQL: criação de contas, cadastro pelo DEPE e encaminhamento pelo assistente", async (t) => {
  const db = demoDatabase();
  const historic = db.Encaminhamentos[0];
  Object.assign(historic, {
    status: "CONCLUIDO",
    lidoEm: "2026-10-12T10:00:00Z",
    concluidoEm: "2026-10-13T10:00:00Z",
  });
  db.Usuarios = [
    {
      id: "test-admin",
      nome: "Admin teste",
      usuario: "admin",
      email: "",
      perfil: "ADMIN",
      ativo: true,
      credentials: await passwordRecord("tmp123"),
      trocaSenha: true,
    },
  ];
  const config = {
    passwordLogin: true,
    demo: false,
    origin: "http://localhost",
    secure: false,
  };
  const repo = Object.assign(new MemoryRepository(db), { atomic: true });
  const server = createServer({
    config,
    auth: new Auth(config),
    service: new AdamService(repo),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin = (config.origin = `http://127.0.0.1:${server.address().port}`);

  const post = (path, body, session) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(session && {
          Cookie: session.cookie,
          "X-CSRF-Token": session.data.csrf,
        }),
      },
      body: JSON.stringify(body),
    });
  async function getSession(response) {
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    const r = await fetch(origin + "/auth/session", {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    return { cookie, data: (await r.json()).data };
  }
  async function signIn(usuario) {
    const temporary = await getSession(
      await post("/auth/password", { usuario, senha: "tmp123" }),
    );
    assert.equal(temporary.data.usuario.trocaSenha, true);
    const changed = await getSession(
      await post("/api/trocarSenha", { senha: "nova12" }, temporary),
    );
    assert.equal(changed.data.usuario.trocaSenha, false);
    return changed;
  }
  async function api(session, action, body = {}, status = 200) {
    const r = await post("/api/" + action, body, session);
    const result = await r.json();
    assert.equal(r.status, status, `${action}: ${JSON.stringify(result)}`);
    return result.data;
  }

  const admin = await signIn("admin");
  assert.deepEqual(admin.data.permissoes, ["createAccount"]);
  assert.equal(admin.data.configuracoes, null);
  for (const action of [
    "carregarDados",
    "listarContas",
    "alterarConta",
    "listarAnosLetivos",
    "cadastrarAluno",
    "obterResumo",
    "registrarOcorrencia",
    "listarEncaminhamentos",
    "gerarPdfEncaminhamento",
  ])
    await api(admin, action, {}, 403);

  for (const [usuario, perfil] of [
    ["assist", "ASSISTENTE"],
    ["depe", "DEP"],
    ["outro-admin", "ADMIN"],
  ])
    await api(admin, "cadastrarConta", {
      usuario,
      nome: usuario,
      senha: "tmp123",
      perfil,
    });
  await api(
    admin,
    "cadastrarConta",
    {
      usuario: "perfil-invalido",
      nome: "Inválido",
      senha: "tmp123",
      perfil: ["DEP"],
    },
    400,
  );
  const depe = await signIn("depe");
  const assist = await signIn("assist");
  const student = {
    nome: "Aluno novo",
    matricula: "000111",
    curso: "Curso",
    turma: "1A",
    chaveIdempotencia: "aluno-novo",
  };
  await api(assist, "cadastrarAluno", student, 403);
  const enrolled = await api(depe, "cadastrarAluno", student);
  await api(
    depe,
    "cadastrarAluno",
    { ...student, chaveIdempotencia: "outro-cadastro" },
    400,
  );
  assert.equal(
    (await api(assist, "obterAluno", { alunoId: enrolled.id })).matricula,
    student.matricula,
  );
  await api(
    assist,
    "atualizarAluno",
    {
      ...student,
      alunoId: "inexistente",
      versaoEsperada: 1,
      chaveIdempotencia: "edit-inexistente",
    },
    404,
  );
  await api(assist, "atualizarAluno", {
    ...student,
    alunoId: enrolled.id,
    versaoEsperada: 1,
    chaveIdempotencia: "edit-real",
  });
  for (const action of [
    "obterAluno",
    "listarAlunos",
    "listarOcorrencias",
    "obterResumo",
    "confirmarLeituraDepe",
    "concluirEncaminhamento",
    "registrarOcorrencia",
    "registrarEncaminhamento",
    "atualizarAluno",
    "cadastrarConta",
  ])
    await api(depe, action, {}, 403);

  let occurrence;
  for (let i = 0; i < 3; i++)
    occurrence = await api(assist, "registrarOcorrencia", {
      alunoId: enrolled.id,
      anoLetivo: assist.data.configuracoes.anoLetivoAtivo,
      irregularidades: ["CAMISA"],
      chaveIdempotencia: `oc-${i}`,
    });
  const id = occurrence.encaminhamento.id;
  const pending = await api(depe, "carregarDados");
  assert.deepEqual(pending.Usuarios, []);
  assert.deepEqual(pending.Ocorrencias, []);
  assert.equal(
    pending.Alunos.some((u) => u.id === enrolled.id),
    false,
  );
  assert.equal(
    pending.Encaminhamentos.some((r) => r.id === id),
    false,
  );
  const preserved = pending.Encaminhamentos.find((r) => r.id === historic.id);
  assert.equal(preserved.status, "CONCLUIDO");
  assert.equal(preserved.lidoEm, historic.lidoEm);
  assert.equal(preserved.concluidoEm, historic.concluidoEm);
  for (const action of [
    "obterEncaminhamento",
    "obterDadosDocumento",
    "gerarPdfEncaminhamento",
  ])
    await api(depe, action, { encaminhamentoId: id }, 404);

  await api(assist, "registrarEncaminhamento", {
    id,
    versaoEsperada: 1,
    chaveIdempotencia: "enviar",
  });
  assert.equal(
    (await api(depe, "carregarDados")).Encaminhamentos.find((r) => r.id === id)
      .status,
    "ENCAMINHADO",
  );
  assert.equal(
    (await api(depe, "obterDadosDocumento", { encaminhamentoId: id })).snapshot
      .aluno.id,
    enrolled.id,
  );
  const pdf = await api(depe, "gerarPdfEncaminhamento", {
    encaminhamentoId: id,
  });
  assert.equal(
    Buffer.from(pdf.base64, "base64").subarray(0, 5).toString(),
    "%PDF-",
  );
  assert.equal(
    (await api(assist, "obterEncaminhamento", { encaminhamentoId: id })).status,
    "ENCAMINHADO",
  );
});
