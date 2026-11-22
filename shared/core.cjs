(function (root) {
  "use strict";
  const TYPES = ["CAMISA", "CALCA", "SAPATO", "ATRASO", "PERSONALIZADA"];
  const CUSTOM_TITLE_MAX = 100;
  const CAMPUS_NAME = "IFAM – Campus Tefé";
  const typeLabels = {
    CAMISA: "Camisa",
    CALCA: "Calça",
    SAPATO: "Sapato",
    ATRASO: "Atraso",
    PERSONALIZADA: "Personalizada",
  };
  function describeType(type, title) {
    if (type === "PERSONALIZADA" && title) return "Personalizada: " + title;
    if (["CAMISA", "CALCA", "SAPATO"].includes(type))
      return typeLabels[type] + " fora do padrão";
    return typeLabels[type] || type;
  }
  const RIGHTS = {
    ADMIN: [
      "read",
      "register",
      "createStudent",
      "student",
      "send",
      "complete",
      "admin",
    ],
    ASSISTENTE: ["read", "register", "createStudent", "student", "send"],
    DEP: ["read", "send", "complete"],
  };
  const PORTAL_RIGHTS = {
    ADMIN: ["createAccount"],
    ASSISTENTE: [
      "portalData",
      "read",
      "referrals",
      "report",
      "register",
      "editOccurrence",
      "send",
    ],
    DEP: [
      "portalData",
      "read",
      "referrals",
      "report",
      "createStudent",
      "student",
      "deactivateStudent",
      "confirmReading",
      "complete",
    ],
  };
  const mutationRights = {
    registrarOcorrencia: "register",
    editarOcorrencia: "editOccurrence",
    desativarAluno: "deactivateStudent",
    confirmarLeituraDepe: "confirmReading",
    concluirEncaminhamento: "complete",
    registrarEncaminhamento: "send",
    cadastrarAluno: "createStudent",
    atualizarAluno: "student",
  };
  function mutationRight(type) {
    return Object.hasOwn(mutationRights, type)
      ? mutationRights[type]
      : undefined;
  }
  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    throw e;
  }
  function allow(user, action, rights = RIGHTS) {
    if (!user)
      fail("UNAUTHENTICATED", "Não foi possível verificar sua identidade.");
    if (!user.ativo || !(rights[user.perfil] || []).includes(action))
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
        "tituloPersonalizado",
        "observacao",
        "chaveIdempotencia",
      ],
      editarOcorrencia: [
        "id",
        "irregularidades",
        "tituloPersonalizado",
        "observacao",
        "versaoEsperada",
        "chaveIdempotencia",
      ],
      desativarAluno: ["alunoId", "versaoEsperada", "chaveIdempotencia"],
      confirmarLeituraDepe: ["id", "chaveIdempotencia"],
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
    }
    if (type === "registrarOcorrencia" || type === "editarOcorrencia") {
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
      if (n.irregularidades.includes("PERSONALIZADA")) {
        if (n.irregularidades.length !== 1)
          fail(
            "VALIDATION_ERROR",
            "Registre a ocorrência personalizada separadamente dos tipos predefinidos.",
          );
        const title =
          typeof n.tituloPersonalizado === "string"
            ? n.tituloPersonalizado.trim()
            : n.tituloPersonalizado;
        n.tituloPersonalizado = text(
          title,
          "título da ocorrência",
          CUSTOM_TITLE_MAX,
          true,
        );
      } else {
        delete n.tituloPersonalizado;
      }
      n.observacao = text(n.observacao ?? "", "observação", 2000, false);
    }
    if (type === "cadastrarAluno" || type === "atualizarAluno") {
      ["nome", "matricula", "curso", "turma"].forEach(
        (k, i) => (n[k] = text(n[k], k, [150, 40, 120, 80][i], true)),
      );
    }
    if (type.includes("Encaminhamento")) {
      text(n.id, "encaminhamento", 100, true);
      n.observacao = text(n.observacao ?? "", "observação", 2000, false);
    }
    if (type === "atualizarAluno" || type === "desativarAluno")
      text(n.alunoId, "aluno", 100, true);
    if (type === "editarOcorrencia") text(n.id, "ocorrência", 100, true);
    if (type === "confirmarLeituraDepe")
      text(n.id, "encaminhamento", 100, true);
    if (
      ["atualizarAluno", "desativarAluno", "editarOcorrencia"].includes(type) ||
      type.includes("Encaminhamento")
    ) {
      if (!Number.isInteger(n.versaoEsperada))
        fail("VALIDATION_ERROR", "Versão esperada obrigatória.");
    }
    return n;
  }
  function plan(db, user, type, p, env) {
    allow(user, mutationRight(type), env.rights);
    p = normalize(type, p);
    const now = env.now(),
      op = env.uuid(),
      writes = [];
    let data;
    const audit = (action, entity, id, details = {}) =>
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
          detalhesJson: JSON.stringify(details),
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
        ...(p.tituloPersonalizado && {
          tituloPersonalizado: p.tituloPersonalizado,
        }),
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
    } else if (type === "editarOcorrencia") {
      const old = find(db, "Ocorrencias", p.id);
      const version = old.versao ?? 1;
      if (version !== p.versaoEsperada)
        fail("VERSION_CONFLICT", "A ocorrência mudou. Atualize a tela.");
      if (old.status !== "ATIVA")
        fail(
          "VALIDATION_ERROR",
          "Somente ocorrências ativas podem ser editadas.",
        );
      const fields = {
        irregularidadesJson: JSON.stringify(p.irregularidades),
        tituloPersonalizado: p.tituloPersonalizado ?? "",
        observacao: p.observacao,
      };
      const names = {
        irregularidadesJson: "irregularidades",
        tituloPersonalizado: "tituloPersonalizado",
        observacao: "observacao",
      };
      const changed = Object.keys(fields).filter(
        (key) => (old[key] ?? "") !== fields[key],
      );
      if (!changed.length) return { id: op, writes, data: old };
      const linked = db.Encaminhamentos.filter(
        (r) =>
          r.alunoId === old.alunoId &&
          Number(r.anoLetivo) === Number(old.anoLetivo) &&
          JSON.parse(r.ocorrenciaIdsJson).includes(old.id),
      );
      data = {
        ...old,
        ...fields,
        versao: version + 1,
        editadoEm: now,
        editadoPor: user.id,
        corrigidaAposEnvio: Boolean(
          old.corrigidaAposEnvio ||
          linked.some((r) => ["ENCAMINHADO", "CONCLUIDO"].includes(r.status)),
        ),
      };
      writes.push({ table: "Ocorrencias", row: data });
      audit(type, "Ocorrencias", data.id, {
        camposAlterados: changed.map((key) => names[key]),
      });
      for (const referral of linked.filter((r) => r.status === "PENDENTE")) {
        const snapshot = JSON.parse(referral.snapshotJson);
        snapshot.ocorrencias = snapshot.ocorrencias.map((o) =>
          o.id === old.id ? { ...o, ...fields } : o,
        );
        writes.push({
          table: "Encaminhamentos",
          row: {
            ...referral,
            snapshotJson: JSON.stringify(snapshot),
            versao: referral.versao + 1,
          },
        });
      }
    } else if (type === "desativarAluno") {
      const old = find(db, "Alunos", p.alunoId);
      if (!old.ativo) return { id: op, writes, data: old };
      if (old.versao !== p.versaoEsperada)
        fail("VERSION_CONFLICT", "O cadastro mudou. Atualize a tela.");
      data = {
        ...old,
        ativo: false,
        atualizadoEm: now,
        versao: old.versao + 1,
      };
      writes.push({ table: "Alunos", row: data });
      audit(type, "Alunos", data.id);
    } else if (type === "confirmarLeituraDepe") {
      const old = find(db, "Encaminhamentos", p.id);
      if (!["ENCAMINHADO", "CONCLUIDO"].includes(old.status))
        fail("NOT_FOUND", "Encaminhamento não encontrado.");
      if (old.lidoEm) return { id: op, writes, data: old };
      data = {
        ...old,
        lidoEm: now,
        lidoPor: user.id,
        lidoPorNome: user.nome,
        versao: old.versao + 1,
      };
      writes.push({ table: "Encaminhamentos", row: data });
      audit(type, "Encaminhamentos", data.id);
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
      const send = type === "registrarEncaminhamento";
      const portalClosure = !send && env.rights === PORTAL_RIGHTS;
      if (portalClosure && old.status === "PENDENTE")
        fail("NOT_FOUND", "Encaminhamento não encontrado.");
      if (portalClosure && old.status === "CONCLUIDO")
        return { id: op, writes, data: old };
      if (old.versao !== p.versaoEsperada)
        fail("VERSION_CONFLICT", "O encaminhamento mudou. Atualize a tela.");
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
          ...(portalClosure && { concluidoPorNome: user.nome }),
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
    CUSTOM_TITLE_MAX,
    CAMPUS_NAME,
    typeLabels,
    describeType,
    RIGHTS,
    PORTAL_RIGHTS,
    mutationRight,
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
