import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3001";
let stopping = false;
let restartCount = 0;

const print = (msg) => {
  const ts = new Date().toISOString();
  console.log(`[dev-stable ${ts}] ${msg}`);
};

process.on("SIGINT", () => {
  stopping = true;
  print("SIGINT alindi, supervisor kapaniyor.");
});

process.on("SIGTERM", () => {
  stopping = true;
  print("SIGTERM alindi, supervisor kapaniyor.");
});

function run() {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", `npm run dev -- -p ${PORT}`], {
        stdio: "inherit",
        env: process.env,
      })
    : spawn("npm", ["run", "dev", "--", "-p", PORT], {
        stdio: "inherit",
        env: process.env,
      });

  child.on("exit", (code, signal) => {
    if (stopping) {
      process.exit(code ?? 0);
      return;
    }

    restartCount += 1;
    const delay = Math.min(5000, 1000 + restartCount * 500);
    print(`next dev kapandi (code=${code ?? "null"}, signal=${signal ?? "null"}). ${delay}ms sonra yeniden baslatiliyor...`);
    setTimeout(run, delay);
  });
}

print(`Stabil mod basladi. Port: ${PORT}`);
run();
