import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, fault, statusFor } from "./errors.js";
import { makePdf } from "./pdf.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function body(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    fault("VALIDATION_ERROR", "Envie JSON.", 415);
  let data = "",
    bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32768)
      fault("VALIDATION_ERROR", "Requisição muito grande.", 413);
    data += chunk;
  }
  try {
    return JSON.parse(data);
  } catch {
    fault("VALIDATION_ERROR", "JSON inválido.");
  }
}
export function createServer({ config, auth, service }) {
  const hits = new Map();
  let loginWindow = 0;
  let loginAttempts = 0;
  return http.createServer(
    { requestTimeout: 45000, headersTimeout: 10000, maxHeaderSize: 16384 },
    async (req, res) => {
      const requestId = randomUUID();
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      // Existing UI uses inline event handlers. All data interpolations remain escaped.
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      if (config.secure)
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      const json = (status, data) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data));
      };
      const redirect = (url, cookie) => {
        if (cookie) res.setHeader("Set-Cookie", cookie);
        res.writeHead(302, { Location: url });
        res.end();
      };
      try {
        const url = new URL(req.url, config.origin);
        if (req.method === "GET" && url.pathname === "/healthz")
          return json(200, { status: "ok" });
        if (req.method === "GET" && url.pathname === "/api/config")
          return json(200, {
            demo: config.demo,
            passwordLogin: Boolean(config.passwordLogin),
            ocorrenciasPersonalizadas: Boolean(
              config.demo || config.passwordLogin,
            ),
          });
        if (
          req.method === "POST" &&
          url.pathname === "/auth/password" &&
          config.passwordLogin
        ) {
          if (req.headers.origin !== config.origin)
            fault("FORBIDDEN", "Origem inválida.", 403);
          const window = Math.floor(Date.now() / 60000);
          if (window !== loginWindow) {
            loginWindow = window;
            loginAttempts = 0;
          }
          if (++loginAttempts > 50)
            fault("BUSY_RETRY", "Muitas tentativas. Aguarde um minuto.", 429);
          const subject = await service.login(await body(req));
          const logged = auth.create(subject);
          res.setHeader("Set-Cookie", logged.cookie);
          return json(200, { ok: true });
        }
        if (req.method === "GET" && url.pathname === "/auth/google") {
          if (config.demo || config.passwordLogin)
            fault(
              "NOT_FOUND",
              "Login Google indisponível na demonstração.",
              404,
            );
          const attempt = auth.start();
          return redirect(attempt.url, attempt.cookie);
        }
        if (req.method === "GET" && url.pathname === "/auth/google/callback") {
          if (config.demo || config.passwordLogin)
            fault("NOT_FOUND", "Rota indisponível.", 404);
          try {
            const email = await auth.callback(req, url);
            await service.execute("obterSessao", {}, email);
            const logged = auth.create(email);
            return redirect("/", [
              logged.cookie,
              auth.cookie(auth.name + "-oauth", "", 0),
            ]);
          } catch (e) {
            console.error(
              JSON.stringify({
                requestId,
                event: "login_failed",
                code: e.code || "AUTH_PROVIDER_ERROR",
              }),
            );
            return redirect(
              "/?login=failed",
              auth.cookie(auth.name + "-oauth", "", 0),
            );
          }
        }
        if (req.method === "POST" && url.pathname === "/auth/demo") {
          if (!config.demo) fault("NOT_FOUND", "Demonstração desativada.", 404);
          if (req.headers.origin !== config.origin)
            fault("FORBIDDEN", "Origem inválida.", 403);
          await body(req);
          const logged = auth.create("demo@example.invalid");
          res.setHeader("Set-Cookie", logged.cookie);
          return json(200, { ok: true });
        }
        if (req.method === "GET" && url.pathname === "/auth/session") {
          const s = auth.session(req),
            data = await service.execute("obterSessao", {}, s.email);
          return json(200, {
            ok: true,
            data: { ...data, csrf: s.csrf },
            requestId,
          });
        }
        if (req.method === "POST" && url.pathname === "/auth/logout") {
          const s = auth.session(req);
          auth.csrf(req, s);
          res.setHeader("Set-Cookie", auth.logout(req));
          return json(200, { ok: true });
        }
        if (req.method === "POST" && url.pathname.startsWith("/api/")) {
          const s = auth.session(req);
          auth.csrf(req, s);
          const time = Date.now();
          for (const [key, v] of hits) if (time > v.end) hits.delete(key);
          const limit = hits.get(s.csrf) || { count: 0, end: time + 60000 };
          hits.set(s.csrf, limit);
          if (++limit.count > 120)
            fault("BUSY_RETRY", "Muitas solicitações. Aguarde um minuto.", 429);
          const name = url.pathname.slice(5),
            p = await body(req);
          let data = await service.execute(name, p, s.email);
          if (name === "trocarSenha" && config.passwordLogin) {
            auth.logout(req);
            res.setHeader("Set-Cookie", auth.create(data).cookie);
            data = null;
          }
          if (name === "gerarPdfEncaminhamento") {
            const pdf = await makePdf(data, { logoPath: config.logoPath });
            if (pdf.length > 5000000)
              fault(
                "SERVICE_UNAVAILABLE",
                "PDF excede o limite de entrega.",
                503,
              );
            data = {
              base64: pdf.toString("base64"),
              mime: "application/pdf",
              nome: `Encaminhamento-${data.encaminhamento.id}.pdf`,
            };
          }
          return json(200, { ok: true, data, requestId });
        }
        const files = {
          "/": ["public/index.html", "text/html"],
          "/style.css": ["public/style.css", "text/css"],
          "/app.js": ["public/app.js", "application/javascript"],
          "/theme.js": ["public/theme.js", "application/javascript"],
          "/core.js": ["shared/core.cjs", "application/javascript"],
          "/assets/ifam-claro.png": [
            "public/assets/ifam-claro.png",
            "image/png",
          ],
          "/assets/ifam-escuro.png": [
            "public/assets/ifam-escuro.png",
            "image/png",
          ],
        };
        if (req.method === "GET" && Object.hasOwn(files, url.pathname)) {
          const [file, type] = files[url.pathname];
          res.writeHead(200, {
            "Content-Type": type.startsWith("image/")
              ? type
              : type + "; charset=utf-8",
          });
          return res.end(await readFile(path.join(root, file)));
        }
        fault("NOT_FOUND", "Endereço não encontrado.", 404);
      } catch (e) {
        const known =
          e instanceof AppError ||
          [
            "UNAUTHENTICATED",
            "FORBIDDEN",
            "VALIDATION_ERROR",
            "NOT_FOUND",
            "ANO_LETIVO_INATIVO",
            "POLITICA_APOS_LIMITE_NAO_DEFINIDA",
            "VERSION_CONFLICT",
            "MATRICULA_ALREADY_EXISTS",
            "INVALID_STATUS_TRANSITION",
          ].includes(e.code);
        console.error(
          JSON.stringify({
            requestId,
            event: "request_failed",
            code: known ? e.code : "INTERNAL_ERROR",
          }),
        );
        if (!res.headersSent)
          json(known ? statusFor(e) : 500, {
            ok: false,
            error: {
              code: known ? e.code : "SERVICE_UNAVAILABLE",
              message: known
                ? e.message
                : "Serviço indisponível. Informe o identificador da requisição ao responsável.",
            },
            requestId,
          });
        else res.end();
      }
    },
  );
}
