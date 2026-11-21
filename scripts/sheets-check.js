import { GoogleAuth } from "google-auth-library";
import { SheetsRepository } from "../server/storage.js";
import { settings } from "../server/service.js";

try {
  if (!process.env.SPREADSHEET_ID) throw new Error("Configure SPREADSHEET_ID.");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    ...(process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) }
      : {}),
  });
  const repo = new SheetsRepository(
      await auth.getClient(),
      process.env.SPREADSHEET_ID,
    ),
    { db } = await repo.read();
  settings(db);
  console.log("Cabeçalhos das oito abas verificados. Nenhum dado foi gravado.");
  for (const [name, rows] of Object.entries(db))
    console.log(`${name}: ${rows.length} registros`);
  const pending = db.Operacoes.filter((o) => o.estado !== "CONCLUIDA").length;
  if (pending)
    throw new Error(
      `${pending} operações antigas precisam ser reconciliadas no Apps Script.`,
    );
} catch (e) {
  console.error("Verificação falhou: " + (e.code || e.message));
  process.exitCode = 1;
}
