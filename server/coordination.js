import { mkdir, open, readFile, rename, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { fault } from "./errors.js";

// Exactly one live writer per spreadsheet. The directory must be private, persistent and unique.
export async function acquireInstance(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(dataDir, "writer.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (e) {
    if (e.code === "EEXIST")
      fault(
        "WRITER_LOCKED",
        "Trava de escritor existente. Confirme que não há outra instância; consulte docs/OPERACAO.md antes de removê-la.",
        503,
      );
    throw e;
  }
  return async () => {
    await rmdir(lock);
  };
}
export class SerialExecutor {
  tail = Promise.resolve();
  pending = 0;
  async run(fn) {
    if (this.pending >= 50)
      fault("BUSY_RETRY", "Servidor ocupado. Repita a mesma tentativa.", 503);
    this.pending++;
    const result = this.tail.then(fn);
    this.tail = result.catch(() => {});
    try {
      return await result;
    } finally {
      this.pending--;
    }
  }
}
export class DiskJournal {
  constructor(dir) {
    this.file = path.join(dir, "pending.json");
  }
  async get() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async put(value) {
    const tmp = this.file + ".tmp";
    const file = await open(tmp, "w", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(tmp, this.file);
    // Directory sync is supported on Linux deployments, optional on Windows development.
    try {
      const dir = await open(path.dirname(this.file), "r");
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch (e) {
      if (!["EINVAL", "EPERM", "EISDIR"].includes(e.code)) throw e;
    }
  }
  async clear() {
    try {
      await unlink(this.file);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}
export class MemoryJournal {
  value = null;
  async get() {
    return this.value;
  }
  async put(v) {
    this.value = structuredClone(v);
  }
  async clear() {
    this.value = null;
  }
}
