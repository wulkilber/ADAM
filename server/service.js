import { randomUUID, createHash } from "node:crypto";
import I from "../shared/core.cjs";
import { publicRow } from "./storage.js";
import { fault } from "./errors.js";
import { SerialExecutor } from "./coordination.js";

const mutations = [
  "registrarOcorrencia",
  "cadastrarAluno",
  "atualizarAluno",
  "registrarEncaminhamento",
  "concluirEncaminhamento",
];
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = () => new Date().toISOString();
const cleanDb = (db) =>
  Object.fromEntries(
    Object.entries(db).map(([name, rows]) => [name, rows.map(publicRow)]),
  );
export function authenticate(db, email) {
  if (!email)
    fault("UNAUTHENTICATED", "Entre com sua conta Google autorizada.", 401);
  const candidates = db.Usuarios.filter(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (candidates.length !== 1)
    fault("FORBIDDEN", "Conta não autorizada ou cadastro duplicado.", 403);
  const user = candidates[0];
  I.allow(user, "read");
  return user;
}
export function settings(db) {
  const active = db.AnosLetivos.filter((y) => y.ativoParaRegistro);
  if (active.length !== 1)
    fault(
      "SERVICE_UNAVAILABLE",
      "Configure exatamente um ano letivo ativo.",
      503,
    );
  const all = Object.fromEntries(
    db.Configuracoes.map((c) => [c.chave, c.valor]),
  );
  const cfg = {
    campus: all.campus || "Campus a definir",
    anoLetivoAtivo: active[0].ano,
    fusoHorario: all.fusoHorario || "America/Manaus",
    politicaAposLimite: all.politicaAposLimite || "PENDENTE_DEFINICAO",
  };
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: cfg.fusoHorario });
  } catch {
    fault("SERVICE_UNAVAILABLE", "Fuso horário inválido.", 503);
  }
  return cfg;
}
function checkYear(p) {
  if (!Number.isInteger(p.anoLetivo))
    fault("VALIDATION_ERROR", "Informe anoLetivo como inteiro.");
  return p.anoLetivo;
}
function match(a, p) {
  return (
    (!p.busca ||
      (a.nome + " " + a.matricula)
        .toLowerCase()
        .includes(p.busca.toLowerCase())) &&
    (!p.curso || a.curso === p.curso) &&
    (!p.turma || a.turma === p.turma)
  );
}
function period(o, p) {
  return (
    (!p.inicio || o.dataHoraAbordagem >= p.inicio) &&
    (!p.fim || o.dataHoraAbordagem <= p.fim)
  );
}
function page(rows, p) {
  const limit = p.limite ?? 25,
    offset = p.cursor ? Number(p.cursor) : 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    fault("VALIDATION_ERROR", "Paginação inválida.");
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return {
    itens: rows.slice(offset, offset + limit),
    cursor: offset + limit < rows.length ? String(offset + limit) : null,
    total: rows.length,
  };
}
export class AdamService {
  constructor(repo, journal, { clock = Date.now, uuid = randomUUID } = {}) {
    this.repo = repo;
    this.journal = journal;
    this.queue = new SerialExecutor();
    this.clock = clock;
    this.uuid = uuid;
  }
  async recover(snapshot) {
    const pending = await this.journal.get();
    if (!pending) return snapshot;
    const done = snapshot.db.Operacoes.find(
      (o) => o.id === pending.operation.id,
    );
    if (
      done?.estado === "CONCLUIDA" &&
      done.payloadHash === pending.operation.payloadHash
    ) {
      await this.journal.clear();
      return snapshot;
    }
    // Google's request processing limit is 180 seconds. Do not retry an ambiguous request while it may still run.
    if (this.clock() < pending.retryAfter)
      fault(
        "OPERATION_PENDING",
        "A confirmação da gravação está pendente. Aguarde até três minutos e repita a mesma tentativa.",
        503,
      );
    pending.retryAfter = this.clock() + 185000;
    await this.journal.put(pending);
    await this.repo.commit(pending.batch);
    await this.journal.clear();
    return this.repo.read();
  }
  async write(snapshot, writes, operation) {
    const batch = await this.repo.prepare(snapshot, [
      ...writes,
      { table: "Operacoes", row: operation },
    ]);
    await this.journal.put({
      operation,
      batch,
      retryAfter: this.clock() + 185000,
    });
    await this.repo.commit(batch);
    await this.journal.clear();
  }
  async execute(name, input, email) {
    return this.queue.run(async () => {
      I.keys(input, Object.keys(input || {}));
      let snapshot = await this.repo.read();
      authenticate(snapshot.db, email);
      snapshot = await this.recover(snapshot);
      const db = cleanDb(snapshot.db),
        user = authenticate(db, email);
      if (db.Operacoes.some((o) => o.estado !== "CONCLUIDA"))
        fault(
          "OPERATION_PENDING",
          "Há operações antigas incompletas. Reconcilie-as no Apps Script antes da migração.",
          503,
        );
      if (mutations.includes(name))
        return this.mutate(snapshot, db, user, name, input);
      return this.readOperation(snapshot, db, user, name, input);
    });
  }
  async mutate(snapshot, db, user, name, input) {
    const right =
      name === "registrarOcorrencia"
        ? "register"
        : name === "registrarEncaminhamento"
          ? "send"
          : name === "concluirEncaminhamento"
            ? "complete"
            : "student";
    I.allow(user, right);
    const p = I.normalize(name, input),
      digest = hash(p);
    const old = db.Operacoes.find(
      (o) =>
        o.usuarioId === user.id &&
        o.tipo === name &&
        o.chaveIdempotencia === p.chaveIdempotencia,
    );
    if (old) {
      if (old.payloadHash !== digest)
        fault(
          "IDEMPOTENCY_CONFLICT",
          "Tentativa já usada com outros dados.",
          409,
        );
      return JSON.parse(old.resultadoJson);
    }
    const plan = I.plan(db, user, name, p, {
      uuid: this.uuid,
      now,
      policy: settings(db).politicaAposLimite,
    });
    const op = {
      id: plan.id,
      usuarioId: user.id,
      tipo: name,
      chaveIdempotencia: p.chaveIdempotencia,
      payloadHash: digest,
      estado: "CONCLUIDA",
      planoJson: JSON.stringify(plan),
      resultadoJson: JSON.stringify(plan.data),
      criadoEm: now(),
      atualizadoEm: now(),
    };
    // Old and new journal fields remain compatible; successful batch commits all entities and result together.
    if (op.planoJson.length > 45000 || op.resultadoJson.length > 45000)
      fault("VALIDATION_ERROR", "Operação excede o limite técnico.");
    await this.write(snapshot, plan.writes, op);
    return plan.data;
  }
  async readOperation(snapshot, db, user, name, p) {
    const fields = {
      obterSessao: [],
      carregarDados: [],
      listarAnosLetivos: [],
      obterAluno: ["alunoId"],
      listarAlunos: [
        "busca",
        "curso",
        "turma",
        "anoLetivo",
        "limite",
        "cursor",
      ],
      listarOcorrencias: [
        "alunoId",
        "anoLetivo",
        "inicio",
        "fim",
        "limite",
        "cursor",
      ],
      listarEncaminhamentos: [
        "anoLetivo",
        "status",
        "busca",
        "curso",
        "turma",
        "limite",
        "cursor",
      ],
      obterEncaminhamento: ["encaminhamentoId"],
      obterResumo: ["anoLetivo", "inicio", "fim", "curso", "turma"],
      obterDadosDocumento: ["encaminhamentoId", "chaveIdempotencia"],
      gerarPdfEncaminhamento: ["encaminhamentoId", "chaveIdempotencia"],
    };
    if (!Object.hasOwn(fields, name))
      fault("NOT_FOUND", "Operação não encontrada.", 404);
    I.keys(p, fields[name]);
    for (const k of [
      "busca",
      "curso",
      "turma",
      "inicio",
      "fim",
      "status",
      "alunoId",
      "encaminhamentoId",
    ])
      if (p[k] !== undefined) I.text(p[k], k, 200, false);
    const cfg = settings(db);
    switch (name) {
      case "obterSessao":
        return {
          usuario: {
            id: user.id,
            nome: user.nome,
            perfil: user.perfil,
            ativo: user.ativo,
          },
          permissoes: I.RIGHTS[user.perfil],
          configuracoes: cfg,
        };
      case "carregarDados":
        return {
          Alunos: db.Alunos,
          Usuarios: db.Usuarios.map((u) => ({ id: u.id, nome: u.nome })),
          Ocorrencias: db.Ocorrencias,
          Encaminhamentos: db.Encaminhamentos,
          AnosLetivos: db.AnosLetivos,
        };
      case "listarAnosLetivos":
        return db.AnosLetivos;
      case "obterAluno":
        return I.find(db, "Alunos", p.alunoId);
      case "listarAlunos": {
        const y = checkYear(p);
        return page(
          db.Alunos.filter((a) => match(a, p)).map((a) => ({
            ...a,
            contagem: I.active(db, a.id, y).length,
          })),
          p,
        );
      }
      case "listarOcorrencias": {
        const y = checkYear(p);
        return page(
          db.Ocorrencias.filter(
            (o) =>
              o.anoLetivo === y &&
              (!p.alunoId || o.alunoId === p.alunoId) &&
              period(o, p),
          ),
          p,
        );
      }
      case "listarEncaminhamentos": {
        const y = checkYear(p);
        if (
          p.status &&
          !["PENDENTE", "ENCAMINHADO", "CONCLUIDO"].includes(p.status)
        )
          fault("VALIDATION_ERROR", "Status inválido.");
        return page(
          db.Encaminhamentos.filter(
            (e) =>
              e.anoLetivo === y &&
              (!p.status || e.status === p.status) &&
              match(I.find(db, "Alunos", e.alunoId), p),
          ),
          p,
        );
      }
      case "obterEncaminhamento": {
        const e = I.find(db, "Encaminhamentos", p.encaminhamentoId);
        return { ...e, snapshot: JSON.parse(e.snapshotJson) };
      }
      case "obterResumo": {
        const y = checkYear(p),
          rows = db.Ocorrencias.filter(
            (o) =>
              o.status === "ATIVA" &&
              o.anoLetivo === y &&
              period(o, p) &&
              match(I.find(db, "Alunos", o.alunoId), p),
          );
        return {
          ocorrencias: rows.length,
          alunos: new Set(rows.map((o) => o.alunoId)).size,
          irregularidades: I.TYPES.map((t) => ({
            tipo: t,
            total: rows.filter((o) =>
              JSON.parse(o.irregularidadesJson).includes(t),
            ).length,
          })),
        };
      }
      case "obterDadosDocumento":
      case "gerarPdfEncaminhamento": {
        const e = I.find(db, "Encaminhamentos", p.encaminhamentoId),
          key = p.chaveIdempotencia || this.uuid();
        I.text(key, "identificador", 120, true);
        const digest = hash({ id: e.id, tipo: name }),
          old = db.Operacoes.find(
            (o) =>
              o.usuarioId === user.id &&
              o.tipo === name &&
              o.chaveIdempotencia === key,
          );
        if (old) {
          if (old.payloadHash !== digest)
            fault(
              "IDEMPOTENCY_CONFLICT",
              "Tentativa usada para outro documento.",
              409,
            );
          return JSON.parse(old.resultadoJson);
        }
        const data = {
          encaminhamento: e,
          snapshot: JSON.parse(e.snapshotJson),
          instituicao: cfg,
          emitidoEm: now(),
          emitidoPor: user.nome,
        };
        const id = this.uuid(),
          audit = {
            id: this.uuid(),
            operacaoId: id,
            usuarioId: user.id,
            acao: "solicitarDocumento",
            entidade: "Encaminhamentos",
            entidadeId: e.id,
            dataHora: now(),
            detalhesJson: JSON.stringify({
              formato: name === "gerarPdfEncaminhamento" ? "PDF" : "HTML",
            }),
          };
        const op = {
          id,
          usuarioId: user.id,
          tipo: name,
          chaveIdempotencia: key,
          payloadHash: digest,
          estado: "CONCLUIDA",
          planoJson: "{}",
          resultadoJson: JSON.stringify(data),
          criadoEm: now(),
          atualizadoEm: now(),
        };
        await this.write(snapshot, [{ table: "Auditoria", row: audit }], op);
        return data;
      }
    }
  }
}
