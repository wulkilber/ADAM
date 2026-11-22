import {
  randomBytes,
  randomUUID,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { fault } from "./errors.js";

const scrypt = promisify(derive);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const username = (v) =>
  typeof v === "string" && v.length <= 128 ? v.trim().toLowerCase() : "";
export function validateUsername(value) {
  const name = username(value);
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(name))
    fault("VALIDATION_ERROR", "Informe um usuário de 3 a 40 caracteres.");
  return name;
}
export async function passwordRecord(password) {
  if (
    typeof password !== "string" ||
    password.length < 6 ||
    Buffer.byteLength(password) > 256
  )
    fault(
      "VALIDATION_ERROR",
      "Use uma senha de pelo menos 6 caracteres e até 256 bytes.",
    );
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    digest: (await scrypt(password, salt, 32, options)).toString("hex"),
    revision: randomUUID(),
  };
}
export async function verifyPassword(password, credentials) {
  const valid =
    typeof password === "string" && Buffer.byteLength(password) <= 256;
  const digest = await scrypt(
    valid ? password : "",
    credentials?.salt ?? "dummy-invalid-account",
    32,
    options,
  );
  const expected = Buffer.from(credentials?.digest ?? "0".repeat(64), "hex");
  return (
    valid &&
    Boolean(credentials) &&
    expected.length === digest.length &&
    timingSafeEqual(digest, expected)
  );
}
