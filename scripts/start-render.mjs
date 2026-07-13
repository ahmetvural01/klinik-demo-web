import { spawn } from "node:child_process";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

await run("npx", ["prisma", "migrate", "deploy"], {
  PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
});

await run("npx", ["next", "start", "-H", "0.0.0.0"]);
