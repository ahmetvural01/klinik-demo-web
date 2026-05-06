/* eslint-disable no-console */
import Redis from "ioredis";

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL tanimli degil.");
    process.exit(1);
  }

  const pub = new Redis(url);
  const sub = new Redis(url);
  pub.on("error", () => {});
  sub.on("error", () => {});

  const channel = "ks:realtime:verify";
  const payload = JSON.stringify({ ping: true, at: new Date().toISOString() });

  const received = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 3000);
    sub.subscribe(channel, () => {
      sub.on("message", (_ch, msg) => {
        clearTimeout(timeout);
        resolve(msg === payload);
      });
    });
  });

  await pub.publish(channel, payload);
  const ok = await received;

  pub.disconnect();
  sub.disconnect();

  if (!ok) {
    console.error("Redis pub/sub dogrulamasi basarisiz.");
    process.exit(1);
  }

  console.log("Redis pub/sub dogrulamasi basarili.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
