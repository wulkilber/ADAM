import { SCHEMA } from "./schema.js";
import { AppError, fault } from "./errors.js";

export const emptyDatabase = () =>
  Object.fromEntries(Object.keys(SCHEMA).map((name) => [name, []]));
export function decodeRows(name, values = []) {
  const header = values[0] || [];
  if (JSON.stringify(header) !== JSON.stringify(SCHEMA[name]))
    fault(
      "SCHEMA_MISMATCH",
      `Cabeçalhos incompatíveis ou aba ausente: ${name}. Nenhum dado foi alterado.`,
      503,
    );
  const seen = new Set();
  return values
    .slice(1)
    .map((row, index) => {
      if (!row.some((v) => v !== "")) return null;
      const item = { _row: index + 1 }; // Real zero-based sheet row, including blank gaps.
      SCHEMA[name].forEach((key, col) => {
        let value = row[col] ?? "";
        if (["ativo", "ativoParaRegistro"].includes(key))
          value = String(value).toLowerCase() === "true";
        if (["versao", "ano", "anoLetivo"].includes(key)) value = Number(value);
        item[key] = value;
      });
      const id = String(item[SCHEMA[name][0]]);
      if (!id || seen.has(id))
        fault("SCHEMA_MISMATCH", `ID vazio ou duplicado na aba ${name}.`, 503);
      seen.add(id);
      return item;
    })
    .filter(Boolean);
}
export function cell(value) {
  const text = value == null ? "" : String(value);
  if (text.length > 45000)
    fault("VALIDATION_ERROR", "Conteúdo excede o limite de uma célula.");
  // stringValue is literal: no formula interpretation, apostrophe prefixes or loss of leading zeros.
  return { userEnteredValue: { stringValue: text } };
}
export function buildBatch(snapshot, writes) {
  const positions = new Map();
  const next = { ...snapshot.next };
  for (const [table, rows] of Object.entries(snapshot.db)) {
    const key = SCHEMA[table][0];
    for (const row of rows) positions.set(`${table}:${row[key]}`, row._row);
  }
  const requests = [],
    needed = {};
  for (const { table, row } of writes) {
    if (!SCHEMA[table]) fault("VALIDATION_ERROR", "Aba desconhecida.");
    const id = row[SCHEMA[table][0]],
      key = `${table}:${id}`;
    if (id === undefined || id === "")
      fault("VALIDATION_ERROR", "Registro sem identificador.");
    let index = positions.get(key);
    if (index === undefined) {
      index = next[table]++;
      positions.set(key, index);
    }
    needed[table] = Math.max(needed[table] || 0, index + 1);
    requests.push({
      updateCells: {
        start: {
          sheetId: snapshot.sheets[table].sheetId,
          rowIndex: index,
          columnIndex: 0,
        },
        rows: [{ values: SCHEMA[table].map((k) => cell(row[k])) }],
        fields: "userEnteredValue",
      },
    });
  }
  for (const [table, n] of Object.entries(needed)) {
    const sheet = snapshot.sheets[table];
    if (n > sheet.gridProperties.rowCount)
      requests.unshift({
        appendDimension: {
          sheetId: sheet.sheetId,
          dimension: "ROWS",
          length: n - sheet.gridProperties.rowCount,
        },
      });
  }
  return { requests };
}
export class SheetsRepository {
  constructor(client, spreadsheetId) {
    this.client = client;
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  }
  async request(url, method = "GET", data) {
    return (
      await this.client.request({
        url,
        method,
        data,
        timeout: 30000,
        retry: false,
        retryConfig: { retry: 0, noResponseRetries: 0 },
      })
    ).data;
  }
  async read() {
    const names = Object.keys(SCHEMA);
    const ranges = new URLSearchParams({
      valueRenderOption: "FORMATTED_VALUE",
    });
    names.forEach((n) => ranges.append("ranges", `'${n}'!A:Z`));
    const [meta, data] = await Promise.all([
      this.request(`${this.base}?fields=sheets(properties)`),
      this.request(`${this.base}/values:batchGet?${ranges}`),
    ]);
    const sheets = Object.fromEntries(
      meta.sheets.map((s) => [s.properties.title, s.properties]),
    );
    const db = {},
      next = {};
    names.forEach((name, i) => {
      if (!sheets[name]) fault("SCHEMA_MISMATCH", `Aba ausente: ${name}.`, 503);
      const rows = data.valueRanges[i].values || [];
      db[name] = decodeRows(name, rows);
      next[name] = Math.max(rows.length, 1);
    });
    return { db, next, sheets };
  }
  async prepare(snapshot, writes) {
    return buildBatch(snapshot, writes);
  }
  async commit(batch) {
    // All cells, operation result and audit events are sent as ONE atomic Sheets request.
    // Never append/retry automatically: a timeout can mean the server already applied the batch.
    try {
      await this.request(`${this.base}:batchUpdate`, "POST", batch);
    } catch (e) {
      throw new AppError(
        "OPERATION_PENDING",
        "O resultado da gravação ainda precisa ser confirmado. Repita a mesma tentativa.",
        503,
      );
    }
  }
}
export class MemoryRepository {
  constructor(db) {
    this.db = structuredClone(db);
  }
  async read() {
    return { db: structuredClone(this.db) };
  }
  async prepare(snapshot, writes) {
    return { writes: structuredClone(writes) };
  }
  async commit(batch) {
    const next = structuredClone(this.db);
    for (const { table, row } of batch.writes) {
      const key = SCHEMA[table][0],
        i = next[table].findIndex((r) => String(r[key]) === String(row[key]));
      if (i < 0) next[table].push(structuredClone(row));
      else next[table][i] = structuredClone(row);
    }
    this.db = next;
  }
}
export function publicRow(row) {
  const { _row, ...data } = row;
  return data;
}
