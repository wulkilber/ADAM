import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBatch,
  decodeRows,
  cell,
  SheetsRepository,
} from "../server/storage.js";
import { DiskJournal, acquireInstance } from "../server/coordination.js";
import { SCHEMA } from "../server/schema.js";

test("Leitura conserva posição real depois de linhas vazias e matrícula textual", () => {
  const rows = [
    SCHEMA.Alunos,
    ["a", "Teste", "00001", "Info", "1A", "true", "", "", "u", "1"],
    [],
    ["b", "Segundo", "00002", "Info", "1A", "true", "", "", "u", "2"],
  ];
  const decoded = decodeRows("Alunos", rows);
  assert.equal(decoded[1]._row, 3);
  assert.equal(decoded[0].matricula, "00001");
  assert.equal(decoded[0].ativo, true);
  assert.equal(decoded[1].versao, 2);
  const batch = buildBatch(
    {
      db: { Alunos: decoded },
      next: { Alunos: 4 },
      sheets: { Alunos: { sheetId: 3, gridProperties: { rowCount: 100 } } },
    },
    [{ table: "Alunos", row: { ...decoded[1], nome: "Editado" } }],
  );
  assert.equal(batch.requests[0].updateCells.start.rowIndex, 3);
});
test("Sheets recebe strings literais para fórmulas, apóstrofos e zeros", () => {
  for (const value of ["=1+1", "+SUM(A1)", "@teste", "'texto", "00001"])
    assert.deepEqual(cell(value), { userEnteredValue: { stringValue: value } });
});
test("Cabeçalhos ou IDs duplicados interrompem leitura", () => {
  assert.throws(() => decodeRows("Alunos", [["errado"]]));
  const row = ["a", "Teste", "00001"];
  assert.throws(
    () => decodeRows("Alunos", [SCHEMA.Alunos, row, row]),
    (e) => e.code === "SCHEMA_MISMATCH",
  );
});
test("Um único batch contém múltiplas abas e expande grade quando necessário", () => {
  const snap = {
    db: { Alunos: [], Auditoria: [] },
    next: { Alunos: 1, Auditoria: 1 },
    sheets: {
      Alunos: { sheetId: 1, gridProperties: { rowCount: 1 } },
      Auditoria: { sheetId: 2, gridProperties: { rowCount: 10 } },
    },
  };
  const batch = buildBatch(snap, [
    { table: "Alunos", row: { id: "a", matricula: "00001" } },
    { table: "Auditoria", row: { id: "b" } },
  ]);
  assert.equal(batch.requests.length, 3);
  assert.equal(batch.requests[0].appendDimension.length, 1);
});
test("Cliente não repete automaticamente gravações com resultado desconhecido", async () => {
  let count = 0;
  const repo = new SheetsRepository(
    {
      request: async (options) => {
        count++;
        assert.equal(options.retry, false);
        assert.equal(options.retryConfig.retry, 0);
        throw new Error("timeout");
      },
    },
    "test",
  );
  await assert.rejects(
    repo.commit({ requests: [] }),
    (e) => e.code === "OPERATION_PENDING",
  );
  assert.equal(count, 1);
});
test("Journal persiste após recriação do serviço e trava impede segunda instância", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "adam-test-"));
  try {
    const release = await acquireInstance(dir);
    await assert.rejects(
      acquireInstance(dir),
      (e) => e.code === "WRITER_LOCKED",
    );
    await new DiskJournal(dir).put({
      operation: { id: "a" },
      batch: { requests: [] },
    });
    assert.equal((await new DiskJournal(dir).get()).operation.id, "a");
    await new DiskJournal(dir).clear();
    assert.equal(await new DiskJournal(dir).get(), null);
    await release();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
