(function (root) {
  "use strict";
  const TYPES = ["CAMISA", "CALCA", "SAPATO", "ATRASO"];
  const RIGHTS = {
    ADMIN: ["read", "register", "student", "send", "complete", "admin"],
    ASSISTENTE: ["read", "register", "send"],
    DEP: ["read", "send", "complete"],
  };
  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    throw e;
  }
  function allow(user, action) {
    if (!user)
      fail("UNAUTHENTICATED", "Não foi possível verificar sua identidade.");
    if (!user.ativo || !(RIGHTS[user.perfil] || []).includes(action))
      fail("FORBIDDEN", "Sua conta não tem permissão para esta ação.");
  }
  function text(v, name, max, required) {
    if (typeof v !== "string" || v.length > max || (required && !v.trim()))
      fail("VALIDATION_ERROR", "Confira o campo " + name + ".");
    return v.trim();
  }
  function keys(p, allowed) {
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      Object.keys(p).some((k) => !allowed.includes(k))
    )
      fail("VALIDATION_ERROR", "Entrada inválida ou campos desconhecidos.");
  }
  function active(db, a, y) {
    return db.Ocorrencias.filter(
      (o) =>
        o.alunoId === a &&
        Number(o.anoLetivo) === Number(y) &&
        o.status === "ATIVA",
    );
  }
  function find(db, table, id) {
    const x = db[table].find((x) => x.id === id);
    if (!x) fail("NOT_FOUND", "Registro não encontrado.");
    return x;
  }
  function normalize(type, p) {
    const fields = {
      registrarOcorrencia: [
        "alunoId",
        "anoLetivo",
        "irregularidades",
        "observacao",
        "chaveIdempotencia",
      ],
      cadastrarAluno: [
        "nome",
        "matricula",
        "curso",
        "turma",
        "chaveIdempotencia",
      ],
      atualizarAluno: [
        "alunoId",
        "nome",
        "matricula",
        "curso",
        "turma",
        "versaoEsperada",
        "chaveIdempotencia",
      ],
      registrarEncaminhamento: [
        "id",
        "observacao",
        "versaoEsperada",
        "chaveIdempotencia",
      ],
      concluirEncaminhamento: [
        "id",
        "observacao",
        "versaoEsperada",
        "chaveIdempotencia",
      ],
    };
    if (!fields[type]) fail("VALIDATION_ERROR", "Operação desconhecida.");
    keys(p, fields[type]);
    const n = {};
    fields[type].forEach((k) => {
      if (p[k] !== undefined) n[k] = p[k];
    });
    text(n.chaveIdempotencia, "identificador da tentativa", 120, true);
    if (type === "registrarOcorrencia") {
      text(n.alunoId, "aluno", 100, true);
      if (!Number.isInteger(n.anoLetivo))
        fail("VALIDATION_ERROR", "Ano letivo inválido.");
      if (
        !Array.isArray(n.irregularidades) ||
        !n.irregularidades.length ||
        n.irregularidades.some((t) => !TYPES.includes(t)) ||
        new Set(n.irregularidades).size !== n.irregularidades.length
      )
        fail(
          "VALIDATION_ERROR",
          "Selecione ao menos uma irregularidade válida, sem repetições.",
        );
      n.irregularidades = [...n.irregularidades].sort();
      n.observacao = text(n.observacao || "", "observação", 2000, false);
    }
    if (type === "cadastrarAluno" || type === "atualizarAluno") {
      ["nome", "matricula", "curso", "turma"].forEach(
        (k, i) => (n[k] = text(n[k], k, [150, 40, 120, 80][i], true)),
      );
    }
    if (type.includes("Encaminhamento")) {
      text(n.id, "encaminhamento", 100, true);
      n.observacao = text(n.observacao || "", "observação", 2000, false);
    }
    if (type === "atualizarAluno") text(n.alunoId, "aluno", 100, true);
    if (type === "atualizarAluno" || type.includes("Encaminhamento")) {
      if (!Number.isInteger(n.versaoEsperada))
        fail("VALIDATION_ERROR", "Versão esperada obrigatória.");
    }
    return n;
  }
  function plan(db, user, type, p, env) {
    const right =
      type === "registrarOcorrencia"
        ? "register"
        : type === "concluirEncaminhamento"
          ? "complete"
          : type === "registrarEncaminhamento"
            ? "send"
            : "student";
    allow(user, right);
    p = normalize(type, p);
    const now = env.now(),
      op = env.uuid(),
      writes = [];
    let data;
    const audit = (action, entity, id) =>
      writes.push({
        table: "Auditoria",
        row: {
          id: env.uuid(),
          operacaoId: op,
          usuarioId: user.id,
          acao: action,
          entidade: entity,
          entidadeId: id,
          dataHora: now,
          detalhesJson: "{}",
        },
      });
    if (type === "registrarOcorrencia") {
      const student = find(db, "Alunos", p.alunoId);
      if (!student.ativo) fail("VALIDATION_ERROR", "Aluno inativo.");
      if (
        !db.AnosLetivos.some(
          (y) => Number(y.ano) === p.anoLetivo && y.ativoParaRegistro,
        )
      )
        fail(
          "ANO_LETIVO_INATIVO",
          "Selecione o ano letivo ativo para registrar.",
        );
      const previous = active(db, student.id, p.anoLetivo);
      if (previous.length >= 3 && env.policy !== "CONTINUAR")
        fail(
          "POLITICA_APOS_LIMITE_NAO_DEFINIDA",
          "O aluno já possui três ocorrências. Novos registros dependem da definição institucional.",
        );
      const occurrence = {
        id: env.uuid(),
        alunoId: student.id,
        anoLetivo: p.anoLetivo,
        dataHoraAbordagem: now,
        registradoEm: now,
        assistenteId: user.id,
        irregularidadesJson: JSON.stringify(p.irregularidades),
        observacao: p.observacao,
        status: "ATIVA",
        operacaoId: op,
      };
      writes.push({ table: "Ocorrencias", row: occurrence });
      audit(type, "Ocorrencias", occurrence.id);
      let referral =
        db.Encaminhamentos.find(
          (e) =>
            e.alunoId === student.id && Number(e.anoLetivo) === p.anoLetivo,
        ) || null;
      if (previous.length === 2 && !referral) {
        const items = [...previous, occurrence].map((o) => ({
          ...o,
          assistenteNome: (
            db.Usuarios.find((u) => u.id === o.assistenteId) || {
              nome: "Responsável não identificado",
            }
          ).nome,
        }));
        referral = {
          id: env.uuid(),
          alunoId: student.id,
          anoLetivo: p.anoLetivo,
          ocorrenciaIdsJson: JSON.stringify(items.map((o) => o.id)),
          status: "PENDENTE",
          criadoEm: now,
          encaminhadoEm: "",
          encaminhadoPor: "",
          concluidoEm: "",
          concluidoPor: "",
          observacaoEncaminhamento: "",
          observacaoConclusao: "",
          snapshotJson: JSON.stringify({ aluno: student, ocorrencias: items }),
          versao: 1,
          operacaoId: op,
        };
        writes.push({ table: "Encaminhamentos", row: referral });
        audit("criarEncaminhamento", "Encaminhamentos", referral.id);
      }
      data = {
        ocorrencia: occurrence,
        contagem: previous.length + 1,
        encaminhamento: referral,
      };
    } else if (type === "cadastrarAluno" || type === "atualizarAluno") {
      let old =
        type === "atualizarAluno" ? find(db, "Alunos", p.alunoId) : null;
      if (old && old.versao !== p.versaoEsperada)
        fail("VERSION_CONFLICT", "O cadastro mudou. Atualize a tela.");
      if (
        db.Alunos.some(
          (a) => a.matricula === p.matricula && a.id !== (old && old.id),
        )
      )
        fail(
          "MATRICULA_ALREADY_EXISTS",
          "Já existe um aluno com esta matrícula.",
        );
      data = {
        id: old ? old.id : env.uuid(),
        nome: p.nome,
        matricula: p.matricula,
        curso: p.curso,
        turma: p.turma,
        ativo: old ? old.ativo : true,
        criadoEm: old ? old.criadoEm : now,
        atualizadoEm: now,
        criadoPor: old ? old.criadoPor : user.id,
        versao: old ? old.versao + 1 : 1,
      };
      writes.push({ table: "Alunos", row: data });
      audit(type, "Alunos", data.id);
    } else {
      const old = find(db, "Encaminhamentos", p.id);
      if (old.versao !== p.versaoEsperada)
        fail("VERSION_CONFLICT", "O encaminhamento mudou. Atualize a tela.");
      const send = type === "registrarEncaminhamento";
      if (old.status !== (send ? "PENDENTE" : "ENCAMINHADO"))
        fail("INVALID_STATUS_TRANSITION", "Transição de status não permitida.");
      data = {
        ...old,
        status: send ? "ENCAMINHADO" : "CONCLUIDO",
        versao: old.versao + 1,
      };
      if (send)
        Object.assign(data, {
          encaminhadoEm: now,
          encaminhadoPor: user.id,
          observacaoEncaminhamento: p.observacao,
        });
      else
        Object.assign(data, {
          concluidoEm: now,
          concluidoPor: user.id,
          observacaoConclusao: p.observacao,
        });
      writes.push({ table: "Encaminhamentos", row: data });
      audit(type, "Encaminhamentos", data.id);
    }
    return { id: op, writes, data };
  }
  function apply(db, plan, stopAfter) {
    plan.writes.forEach((w, i) => {
      let j = db[w.table].findIndex((r) => r.id === w.row.id);
      if (j < 0) db[w.table].push(JSON.parse(JSON.stringify(w.row)));
      else db[w.table][j] = JSON.parse(JSON.stringify(w.row));
      if (i === stopAfter) throw new Error("SIMULATED_FAILURE");
    });
    return plan.data;
  }
  root.IFAM = {
    TYPES,
    RIGHTS,
    fail,
    allow,
    text,
    keys,
    active,
    find,
    normalize,
    plan,
    apply,
  };
  if (typeof module !== "undefined") module.exports = root.IFAM;
})(typeof globalThis !== "undefined" ? globalThis : this);
