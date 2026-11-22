import path from "node:path";

export function configuration(env = process.env, args = process.argv) {
  const production = env.NODE_ENV === "production";
  const demo = args.includes("--demo") || env.DEMO_MODE === "true";
  const origin = new URL(
    env.APP_URL || env.RENDER_EXTERNAL_URL || "http://localhost:3000",
  );
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "APP_URL deve conter somente a origem, sem caminho, senha ou parâmetros.",
    );
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("APP_URL inválida.");
  if (production && (demo || origin.protocol !== "https:"))
    throw new Error("Produção exige HTTPS e DEMO_MODE=false.");
  if (!demo && !env.DATABASE_URL) {
    for (const key of [
      "SPREADSHEET_ID",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ])
      if (!env[key])
        throw new Error(
          `Configure ${key}. Para testar sem Google, use npm run demo.`,
        );
    if (env.SHEETS_EXCLUSIVE_WRITER !== "true")
      throw new Error(
        "Desative os escritores antigos e configure SHEETS_EXCLUSIVE_WRITER=true.",
      );
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT inválida.");
  return {
    production,
    databaseUrl: env.DATABASE_URL,
    passwordLogin: Boolean(!demo && env.DATABASE_URL),
    demo,
    port,
    origin: origin.origin,
    secure: origin.protocol === "https:",
    host: env.HOST || (env.RENDER ? "0.0.0.0" : "127.0.0.1"),
    dataDir: path.resolve(env.DATA_DIR || "./data"),
    spreadsheetId: env.SPREADSHEET_ID,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    credentialsJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    allowedDomain: (env.GOOGLE_ALLOWED_DOMAIN || "").toLowerCase(),
    logoPath: env.LOGO_PATH || "",
  };
}
