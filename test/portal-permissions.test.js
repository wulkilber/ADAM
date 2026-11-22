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
    "editarOcorrencia",
    "confirmarLeituraDepe",
    "concluirEncaminhamento",
    "desativarAluno",
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
      nome: "Tentativa sem permissão",
      alunoId: enrolled.id,
      versaoEsperada: 1,
      chaveIdempotencia: "edit-assistente",
    },
    403,
  );
  assert.equal(
    (await api(assist, "obterAluno", { alunoId: enrolled.id })).nome,
    student.nome,
  );
  const depeEdit = await api(depe, "atualizarAluno", {
    ...student,
    turma: "2A",
    alunoId: enrolled.id,
    versaoEsperada: 1,
    chaveIdempotencia: "depe-edit",
  });
  assert.equal(
    (await api(assist, "obterAluno", { alunoId: enrolled.id })).turma,
    "2A",
  );
  const otherStudent = await api(depe, "cadastrarAluno", {
    ...student,
    matricula: "000112",
    chaveIdempotencia: "aluno-dois",
  });
  await api(
    depe,
    "atualizarAluno",
    {
      ...student,
      alunoId: otherStudent.id,
      versaoEsperada: 1,
      chaveIdempotencia: "depe-duplicada",
    },
    400,
  );
  for (const action of [
    "registrarOcorrencia",
    "registrarEncaminhamento",
    "editarOcorrencia",
    "cadastrarConta",
  ])
    await api(depe, action, {}, 403);
  for (const action of [
    "confirmarLeituraDepe",
    "concluirEncaminhamento",
    "desativarAluno",
  ])
    await api(assist, action, {}, 403);

  let occurrence;
  const normal = [];
  const custom = {
    alunoId: enrolled.id,
    anoLetivo: assist.data.configuracoes.anoLetivoAtivo,
    irregularidades: ["PERSONALIZADA"],
    chaveIdempotencia: "oc-custom",
  };
  await api(assist, "registrarOcorrencia", custom, 400);
  for (const tituloPersonalizado of ["   ", "x".repeat(101)])
    await api(
      assist,
      "registrarOcorrencia",
      { ...custom, tituloPersonalizado },
      400,
    );
  await api(
    admin,
    "registrarOcorrencia",
    { ...custom, tituloPersonalizado: "Laboratório" },
    403,
  );
  await api(
    depe,
    "registrarOcorrencia",
    { ...custom, tituloPersonalizado: "Laboratório" },
    403,
  );
  for (let i = 0; i < 2; i++) {
    occurrence = await api(assist, "registrarOcorrencia", {
      alunoId: enrolled.id,
      anoLetivo: assist.data.configuracoes.anoLetivoAtivo,
      irregularidades: ["CAMISA"],
      chaveIdempotencia: `oc-${i}`,
    });
    normal.push(occurrence.ocorrencia);
  }
  assert.equal(occurrence.contagem, 2);
  occurrence = await api(assist, "registrarOcorrencia", {
    ...custom,
    tituloPersonalizado: "  Uso de material do laboratório  ",
  });
  assert.equal(occurrence.contagem, 3);
  assert.equal(
    occurrence.ocorrencia.tituloPersonalizado,
    "Uso de material do laboratório",
  );
  assert.equal(
    (
      await api(assist, "registrarOcorrencia", {
        ...custom,
        tituloPersonalizado: "Uso de material do laboratório",
      })
    ).ocorrencia.id,
    occurrence.ocorrencia.id,
  );
  const id = occurrence.encaminhamento.id;
  const pending = await api(depe, "carregarDados");
  assert.equal(
    pending.Alunos.some((a) => a.id === enrolled.id),
    true,
  );
  assert.equal(
    pending.Ocorrencias.filter((o) => o.alunoId === enrolled.id).length,
    3,
  );
  assert.equal(
    pending.Usuarios.every((u) => !u.credentials),
    true,
  );
  assert.equal(
    pending.PendenciasPorRecorte.find((entry) => entry.curso === student.curso)
      .total,
    1,
  );
  assert.equal(
    pending.PendenciasPorRecorte.some(
      (entry) => "id" in entry || "alunoId" in entry,
    ),
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

  await api(
    depe,
    "confirmarLeituraDepe",
    { id, chaveIdempotencia: "ler-pendente" },
    404,
  );
  await api(
    depe,
    "concluirEncaminhamento",
    { id, versaoEsperada: 1, chaveIdempotencia: "encerrar-pendente" },
    404,
  );
  const corrected = await api(assist, "editarOcorrencia", {
    id: normal[0].id,
    irregularidades: ["ATRASO"],
    observacao: "Correção antes de enviar",
    versaoEsperada: 1,
    chaveIdempotencia: "editar-antes",
  });
  assert.equal(corrected.id, normal[0].id);
  assert.equal(corrected.assistenteId, normal[0].assistenteId);
  assert.equal(corrected.dataHoraAbordagem, normal[0].dataHoraAbordagem);
  assert.equal(corrected.corrigidaAposEnvio, false);
  await api(
    assist,
    "editarOcorrencia",
    {
      id: normal[0].id,
      irregularidades: ["CALCA"],
      versaoEsperada: 1,
      chaveIdempotencia: "editar-obsoleto",
    },
    409,
  );
  await api(
    assist,
    "registrarEncaminhamento",
    {
      id,
      versaoEsperada: 1,
      chaveIdempotencia: "enviar-obsoleto",
    },
    409,
  );
  const sent = await api(assist, "registrarEncaminhamento", {
    id,
    versaoEsperada: 2,
    chaveIdempotencia: "enviar",
  });
  const doc = await api(depe, "obterDadosDocumento", { encaminhamentoId: id });
  assert.equal(doc.snapshot.aluno.id, enrolled.id);
  assert.equal(doc.snapshot.ocorrencias[0].irregularidadesJson, '["ATRASO"]');
  assert.equal(doc.encaminhamento.lidoEm, undefined);
  const pdf = await api(depe, "gerarPdfEncaminhamento", {
    encaminhamentoId: id,
  });
  assert.equal(
    Buffer.from(pdf.base64, "base64").subarray(0, 5).toString(),
    "%PDF-",
  );
  const reading = await api(depe, "confirmarLeituraDepe", {
    id,
    chaveIdempotencia: "ler",
  });
  assert.equal(reading.status, "ENCAMINHADO");
  assert.equal(reading.lidoPor, depe.data.usuario.id);
  assert.deepEqual(
    await api(depe, "confirmarLeituraDepe", {
      id,
      chaveIdempotencia: "ler-repetido",
    }),
    reading,
  );

  const closed = await api(depe, "concluirEncaminhamento", {
    id,
    versaoEsperada: reading.versao,
    observacao: "Atendimento encerrado",
    chaveIdempotencia: "encerrar",
  });
  assert.equal(closed.status, "CONCLUIDO");
  assert.equal(closed.concluidoPor, depe.data.usuario.id);
  assert.ok(closed.concluidoEm);
  assert.ok(closed.lidoEm);
  assert.deepEqual(
    await api(depe, "concluirEncaminhamento", {
      id,
      versaoEsperada: reading.versao,
      observacao: "Outra observação",
      chaveIdempotencia: "encerrar-repetido",
    }),
    closed,
  );

  const unread = db.Encaminhamentos.find((r) => r.status === "ENCAMINHADO");
  const closedUnread = await api(depe, "concluirEncaminhamento", {
    id: unread.id,
    versaoEsperada: unread.versao,
    chaveIdempotencia: "encerrar-sem-leitura",
  });
  assert.equal(closedUnread.lidoEm, undefined);
  const readAfterClosure = await api(depe, "confirmarLeituraDepe", {
    id: unread.id,
    chaveIdempotencia: "ler-apos-encerramento",
  });
  assert.equal(readAfterClosure.concluidoEm, closedUnread.concluidoEm);
  assert.ok(readAfterClosure.lidoEm);

  const editedAfter = await api(assist, "editarOcorrencia", {
    id: occurrence.ocorrencia.id,
    irregularidades: ["PERSONALIZADA"],
    tituloPersonalizado: "Título atualizado",
    versaoEsperada: 1,
    chaveIdempotencia: "editar-depois",
  });
  assert.equal(editedAfter.corrigidaAposEnvio, true);
  const after = await api(assist, "obterEncaminhamento", {
    encaminhamentoId: id,
  });
  assert.equal(after.status, "CONCLUIDO");
  assert.equal(after.lidoEm, reading.lidoEm);
  assert.equal(after.snapshotJson, sent.snapshotJson);
  const history = await api(depe, "listarOcorrencias", {
    alunoId: enrolled.id,
    anoLetivo: custom.anoLetivo,
  });
  assert.equal(history.total, 3);
  assert.equal(
    history.itens.find((o) => o.id === editedAfter.id).tituloPersonalizado,
    "Título atualizado",
  );

  const inactive = await api(depe, "desativarAluno", {
    alunoId: enrolled.id,
    versaoEsperada: depeEdit.versao,
    chaveIdempotencia: "desativar",
  });
  assert.equal(inactive.ativo, false);
  assert.equal(
    (await api(assist, "obterAluno", { alunoId: enrolled.id })).ativo,
    false,
  );
  await api(
    assist,
    "registrarOcorrencia",
    {
      ...custom,
      tituloPersonalizado: "Aluno inativo",
      chaveIdempotencia: "oc-inativa",
    },
    400,
  );
  const activeQueue = await api(depe, "listarEncaminhamentos", {
    anoLetivo: custom.anoLetivo,
    status: "ENCAMINHADO",
  });
  assert.equal(
    activeQueue.itens.some((r) => r.id === id),
    false,
  );
  const closedQueue = await api(depe, "listarEncaminhamentos", {
    anoLetivo: custom.anoLetivo,
    status: "CONCLUIDO",
  });
  assert.equal(
    closedQueue.itens.some((r) => r.id === id),
    true,
  );
  const { db: record } = await repo.read();
  for (const action of ["confirmarLeituraDepe", "concluirEncaminhamento"])
    assert.equal(
      record.Auditoria.filter(
        (entry) => entry.acao === action && entry.entidadeId === id,
      ).length,
      1,
    );
  const editAudit = record.Auditoria.find(
    (entry) =>
      entry.acao === "editarOcorrencia" && entry.entidadeId === editedAfter.id,
  );
  assert.equal(editAudit.usuarioId, assist.data.usuario.id);
  assert.ok(editAudit.dataHora);
  assert.deepEqual(JSON.parse(editAudit.detalhesJson).camposAlterados, [
    "tituloPersonalizado",
  ]);
});
