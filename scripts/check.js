import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const dir of ["server", "shared", "public", "scripts", "test"])
  for (const name of readdirSync(dir)) {
    if (!/\.(js|cjs)$/.test(name)) continue;
    const result = spawnSync(process.execPath, ["--check", `${dir}/${name}`], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(1);
  }
console.log("Sintaxe dos arquivos JavaScript verificada.");
