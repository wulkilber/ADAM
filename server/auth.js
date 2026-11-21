import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { fault } from "./errors.js";

const token = () => randomBytes(32).toString("base64url");
export function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter((x) => x.includes("="))
      .map((s) => {
        const i = s.indexOf("=");
        return [s.slice(0, i).trim(), s.slice(i + 1)];
      }),
  );
}
export class Auth {
  sessions = new Map();
  challenges = new Map();
  constructor(config, { client } = {}) {
    this.config = config;
    this.name = config.secure ? "__Host-adam" : "adam";
    this.client =
      client ||
      new OAuth2Client(
        config.clientId,
        config.clientSecret,
        config.origin + "/auth/google/callback",
      );
  }
  cleanup() {
    const now = Date.now();
    for (const map of [this.sessions, this.challenges])
      for (const [key, v] of map) if (v.expires <= now) map.delete(key);
  }
  cookie(name, value, seconds = 28800) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.config.secure ? "; Secure" : ""}`;
  }
  create(email) {
    this.cleanup();
    if (this.sessions.size >= 10000)
      fault("BUSY_RETRY", "Limite de sessões atingido.", 503);
    const id = token(),
      session = { email, csrf: token(), expires: Date.now() + 8 * 3600000 };
    this.sessions.set(id, session);
    return { id, session, cookie: this.cookie(this.name, id) };
  }
  session(req) {
    this.cleanup();
    const id = cookies(req)[this.name],
      session = this.sessions.get(id);
    if (!session)
      fault("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.", 401);
    return session;
  }
  logout(req) {
    this.sessions.delete(cookies(req)[this.name]);
    return this.cookie(this.name, "", 0);
  }
  csrf(req, session) {
    if (
      req.headers.origin !== this.config.origin ||
      !same(req.headers["x-csrf-token"], session.csrf)
    )
      fault("FORBIDDEN", "Origem ou confirmação de sessão inválida.", 403);
  }
  start() {
    this.cleanup();
    if (this.challenges.size >= 1000)
      fault("BUSY_RETRY", "Muitas tentativas de acesso. Aguarde.", 503);
    const state = token(),
      nonce = token(),
      verifier = token(),
      binding = token();
    this.challenges.set(state, {
      nonce,
      verifier,
      binding,
      expires: Date.now() + 600000,
    });
    const url = this.client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return { url, cookie: this.cookie(this.name + "-oauth", binding, 600) };
  }
  async callback(req, url) {
    this.cleanup();
    const state = url.searchParams.get("state"),
      pending = this.challenges.get(state);
    this.challenges.delete(state);
    if (!pending || !same(cookies(req)[this.name + "-oauth"], pending.binding))
      fault("UNAUTHENTICATED", "Tentativa de login inválida ou expirada.", 401);
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error"))
      fault("UNAUTHENTICATED", "Login Google não concluído.", 401);
    const { tokens } = await this.client.getToken({
      code,
      codeVerifier: pending.verifier,
    });
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.clientId,
    });
    const p = ticket.getPayload();
    if (!p || !p.email_verified || !p.email || p.nonce !== pending.nonce)
      fault("UNAUTHENTICATED", "Identidade Google não verificada.", 401);
    if (this.config.allowedDomain && p.hd !== this.config.allowedDomain)
      fault("FORBIDDEN", "Use a conta do domínio autorizado.", 403);
    return p.email.toLowerCase();
  }
}
