import { randomUUID as uid } from "node:crypto";
import IFAM from "../shared/core.cjs";
export function demoDatabase() {
  const d = {
    Alunos: [],
    Usuarios: [
      {
        id: "demo-admin",
        nome: "Marina Costa",
        email: "demo@example.invalid",
        perfil: "ADMIN",
        ativo: true,
      },
    ],
    Ocorrencias: [],
    Encaminhamentos: [],
    AnosLetivos: [
      { ano: 2026, ativoParaRegistro: true },
      { ano: 2025, ativoParaRegistro: false },
    ],
    Auditoria: [],
    Operacoes: [],
    Configuracoes: [],
  };
  const names = [
    "Ana Clara Oliveira",
    "Gabriel Santos Lima",
    "Beatriz Almeida",
    "Lucas Ferreira",
    "Isabela Rodrigues",
    "Pedro Henrique Souza",
    "Mariana Costa Silva",
    "Rafael Mendes",
    "Sofia Carvalho",
    "João Victor Alves",
    "Lívia Nascimento",
    "Matheus Pereira",
  ];
  names.forEach((nome, i) =>
    d.Alunos.push({
      id: "aluno-" + i,
      nome,
      matricula: "002026" + String(i + 1).padStart(4, "0"),
      curso:
        i % 3 === 0
          ? "Informática"
          : i % 3 === 1
            ? "Administração"
            : "Agropecuária",
      turma:
        (i % 3 === 0 ? "INF" : i % 3 === 1 ? "ADM" : "AGR") +
        " " +
        ((i % 2) + 1) +
        "A",
      ativo: true,
      versao: 1,
      criadoEm: "2026-02-01T12:00:00Z",
      atualizadoEm: "2026-02-01T12:00:00Z",
      criadoPor: "demo-admin",
    }),
  );
  [2, 1, 3, 0, 3, 2, 1, 3, 0, 2, 1, 0].forEach((n, i) => {
    for (let j = 0; j < n; j++) {
      const p = IFAM.plan(
        d,
        d.Usuarios[0],
        "registrarOcorrencia",
        {
          alunoId: "aluno-" + i,
          anoLetivo: 2026,
          irregularidades: j === 0 ? ["CAMISA", "SAPATO"] : ["CALCA"],
          observacao:
            "Estudante orientado durante a abordagem. Registro fictício.",
          chaveIdempotencia: uid(),
        },
        {
          uuid: uid,
          now: () =>
            `2026-10-${String(10 + j + (i % 5)).padStart(2, "0")}T${String(12 + (i % 6)).padStart(2, "0")}:30:00Z`,
        },
      );
      IFAM.apply(d, p);
    }
  });
  d.Encaminhamentos.forEach((e, i) => {
    if (i > 0) {
      e.status = i === 1 ? "ENCAMINHADO" : "CONCLUIDO";
      e.encaminhadoEm = e.criadoEm;
      e.encaminhadoPor = "demo-admin";
      if (i === 2) {
        e.concluidoEm = e.criadoEm;
        e.concluidoPor = "demo-admin";
      }
    }
  });
  d.Ocorrencias.push({
    id: uid(),
    alunoId: "aluno-0",
    anoLetivo: 2025,
    dataHoraAbordagem: "2025-09-12T13:00:00Z",
    registradoEm: "2025-09-12T13:00:00Z",
    assistenteId: "demo-admin",
    irregularidadesJson: '["CAMISA"]',
    observacao: "Exemplo do ano anterior.",
    status: "ATIVA",
  });
  return d;
}
