import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AdamService } from "../server/service.js";
import { MemoryRepository, emptyDatabase } from "../server/storage.js";
import { MemoryJournal } from "../server/coordination.js";

export function fixture() {
  const db = emptyDatabase();
  db.Usuarios = [
    {
      id: "admin",
      nome: "Pessoa de teste",
      email: "admin@example.invalid",
      perfil: "ADMIN",
      ativo: true,
    },
    {
      id: "dep",
      nome: "DEP teste",
      email: "dep@example.invalid",
      perfil: "DEP",
      ativo: true,
    },
  ];
  db.Alunos = [
    {
      id: "a",
      nome: "Estudante fictício",
      matricula: "00001",
      curso: "Informática",
      turma: "1A",
      ativo: true,
      versao: 1,
    },
  ];
  db.AnosLetivos = [
    { ano: 2026, ativoParaRegistro: true },
    { ano: 2025, ativoParaRegistro: false },
  ];
  return db;
}
export const payload = (p = {}) => ({
  alunoId: "a",
  anoLetivo: 2026,
  irregularidades: ["CAMISA", "SAPATO"],
  observacao: "",
  chaveIdempotencia: randomUUID(),
  ...p,
});
const email = "admin@example.invalid";
const rejects = (p, code) => assert.rejects(p, (e) => e.code === code);
function setup() {
  const repo = new MemoryRepository(fixture()),
    journal = new MemoryJournal();
  let clock = Date.now();
  return {
    repo,
    journal,
    service: new AdamService(repo, journal, { clock: () => clock }),
    advance: () => (clock += 190000),
  };
}
test("Uma abordagem com duas irregularidades conta uma; terceira cria DEP com três IDs", async () => {
  const { repo, service: s } = setup();
  const first = await s.execute("registrarOcorrencia", payload(), email);
  assert.equal(first.contagem, 1);
  assert.equal(first.encaminhamento, null);
  await s.execute("registrarOcorrencia", payload(), email);
  const third = await s.execute("registrarOcorrencia", payload(), email);
  assert.equal(third.contagem, 3);
  assert.equal(repo.db.Encaminhamentos.length, 1);
  assert.deepEqual(
    JSON.parse(third.encaminhamento.ocorrenciaIdsJson),
    repo.db.Ocorrencias.map((o) => o.id),
  );
});
test("Entradas inválidas não escrevem e identidade do cliente é rejeitada", async () => {
  const { repo, service: s } = setup();
  for (const p of [
    payload({ irregularidades: [] }),
    payload({ irregularidades: ["ERRADO"] }),
    payload({ irregularidades: ["CAMISA", "CAMISA"] }),
    payload({ assistenteId: "admin" }),
    payload({ anoLetivo: "2026" }),
  ])
    await rejects(
      s.execute("registrarOcorrencia", p, email),
      "VALIDATION_ERROR",
    );
  assert.equal(repo.db.Ocorrencias.length, 0);
});
test("Ocorrências de outro ano não somam; ano inativo bloqueado", async () => {
  const { repo, service: s } = setup();
  repo.db.Ocorrencias.push({
    id: "antiga",
    alunoId: "a",
    anoLetivo: 2025,
    status: "ATIVA",
  });
  assert.equal(
    (await s.execute("registrarOcorrencia", payload(), email)).contagem,
    1,
  );
  await rejects(
    s.execute("registrarOcorrencia", payload({ anoLetivo: 2025 }), email),
    "ANO_LETIVO_INATIVO",
  );
});
test("Repetição idempotente não duplica; mudança de payload conflita", async () => {
  const { repo, service: s } = setup(),
    p = payload();
  const a = await s.execute("registrarOcorrencia", p, email),
    b = await s.execute("registrarOcorrencia", p, email);
  assert.deepEqual(a, b);
  assert.equal(repo.db.Ocorrencias.length, 1);
  await rejects(
    s.execute("registrarOcorrencia", { ...p, observacao: "Alterada" }, email),
    "IDEMPOTENCY_CONFLICT",
  );
});
test("Quatro requisições concorrentes geram três ocorrências e um encaminhamento", async () => {
  const { repo, service: s } = setup();
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      s.execute("registrarOcorrencia", payload(), email),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(repo.db.Ocorrencias.length, 3);
  assert.equal(repo.db.Encaminhamentos.length, 1);
});
test("Falha antes do commit bloqueia novas gravações até reconciliação", async () => {
  const { repo, journal, service: s, advance } = setup(),
    original = repo.commit.bind(repo);
  let fail = true;
  repo.commit = async (b) => {
    if (fail) {
      fail = false;
      throw new Error("simulated network loss");
    }
    return original(b);
  };
  const p = payload();
  await assert.rejects(s.execute("registrarOcorrencia", p, email));
  assert.equal(repo.db.Ocorrencias.length, 0);
  assert.ok(await journal.get());
  await rejects(
    s.execute("registrarOcorrencia", payload(), email),
    "OPERATION_PENDING",
  );
  advance();
  const result = await s.execute("registrarOcorrencia", p, email);
  assert.equal(result.contagem, 1);
  assert.equal(repo.db.Ocorrencias.length, 1);
  assert.equal(await journal.get(), null);
});
test("Resposta perdida após commit é recuperada sem reescrever ou duplicar", async () => {
  const { repo, journal, service: s } = setup(),
    original = repo.commit.bind(repo);
  let count = 0;
  repo.commit = async (b) => {
    await original(b);
    if (++count === 1) throw new Error("response lost");
  };
  const p = payload();
  await assert.rejects(s.execute("registrarOcorrencia", p, email));
  assert.equal(repo.db.Ocorrencias.length, 1);
  const restarted = new AdamService(repo, journal);
  await restarted.execute("registrarOcorrencia", p, email);
  assert.equal(repo.db.Ocorrencias.length, 1);
  assert.equal(count, 1);
});
test("Journal incompleto do Apps Script impede migração silenciosa", async () => {
  const { repo, service: s } = setup();
  repo.db.Operacoes.push({ id: "old", estado: "PREPARADA" });
  await rejects(s.execute("carregarDados", {}, email), "OPERATION_PENDING");
});
test("Usuário ausente, desativado ou perfil sem permissão é negado", async () => {
  const { repo, service: s } = setup();
  await rejects(s.execute("carregarDados", {}, ""), "UNAUTHENTICATED");
  await rejects(
    s.execute("carregarDados", {}, "intruso@example.invalid"),
    "FORBIDDEN",
  );
  await rejects(
    s.execute("registrarOcorrencia", payload(), "dep@example.invalid"),
    "FORBIDDEN",
  );
  repo.db.Usuarios[0].ativo = false;
  await rejects(s.execute("carregarDados", {}, email), "FORBIDDEN");
});
test("Matrícula conserva zeros; duplicação e edição com versão antiga bloqueadas", async () => {
  const { repo, service: s } = setup(),
    p = {
      nome: "Aluno teste",
      matricula: "00002",
      curso: "Info",
      turma: "1A",
      chaveIdempotencia: randomUUID(),
    };
  const a = await s.execute("cadastrarAluno", p, email);
  assert.equal(a.matricula, "00002");
  await rejects(
    s.execute(
      "cadastrarAluno",
      { ...p, chaveIdempotencia: randomUUID() },
      email,
    ),
    "MATRICULA_ALREADY_EXISTS",
  );
  await rejects(
    s.execute(
      "atualizarAluno",
      {
        ...p,
        alunoId: a.id,
        versaoEsperada: 0,
        chaveIdempotencia: randomUUID(),
      },
      email,
    ),
    "VERSION_CONFLICT",
  );
  assert.equal(repo.db.Alunos.length, 2);
});
test("Documento não muda status; transições exigem ordem e conclusão mantém histórico", async () => {
  const { repo, service: s } = setup();
  for (let i = 0; i < 3; i++)
    await s.execute("registrarOcorrencia", payload(), email);
  const e = repo.db.Encaminhamentos[0],
    p = {
      id: e.id,
      versaoEsperada: 1,
      observacao: "",
      chaveIdempotencia: randomUUID(),
    };
  await s.execute("obterDadosDocumento", { encaminhamentoId: e.id }, email);
  assert.equal(repo.db.Encaminhamentos[0].status, "PENDENTE");
  await rejects(
    s.execute("concluirEncaminhamento", p, email),
    "INVALID_STATUS_TRANSITION",
  );
  await s.execute("registrarEncaminhamento", p, email);
  await rejects(
    s.execute(
      "concluirEncaminhamento",
      { ...p, chaveIdempotencia: randomUUID() },
      email,
    ),
    "VERSION_CONFLICT",
  );
  await s.execute(
    "concluirEncaminhamento",
    { ...p, versaoEsperada: 2, chaveIdempotencia: randomUUID() },
    "dep@example.invalid",
  );
  assert.equal(repo.db.Encaminhamentos[0].status, "CONCLUIDO");
  assert.equal(repo.db.Ocorrencias.length, 3);
});
test("Snapshot mantém cadastro e autor históricos, observação como texto literal", async () => {
  const { repo, service: s } = setup();
  for (let i = 0; i < 3; i++)
    await s.execute(
      "registrarOcorrencia",
      payload({ observacao: "=SUM(A1) <script>alert(1)</script>" }),
      email,
    );
  repo.db.Alunos[0].nome = "Outro nome";
  const data = await s.execute(
    "obterDadosDocumento",
    { encaminhamentoId: repo.db.Encaminhamentos[0].id },
    email,
  );
  assert.equal(data.snapshot.aluno.nome, "Estudante fictício");
  assert.equal(data.snapshot.ocorrencias[0].assistenteNome, "Pessoa de teste");
  assert.equal(
    data.snapshot.ocorrencias[0].observacao,
    "=SUM(A1) <script>alert(1)</script>",
  );
});
test("Respostas públicas não expõem journal, e-mails ou campos internos", async () => {
  const { service: s } = setup();
  const data = await s.execute("carregarDados", {}, email);
  assert.equal(data.Operacoes, undefined);
  assert.equal(data.Auditoria, undefined);
  assert.equal(data.Usuarios[0].email, undefined);
  assert.equal(
    (await s.execute("listarAlunos", { anoLetivo: 2026 }, email)).itens[0]
      .contagem,
    0,
  );
});
