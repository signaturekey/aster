import { createApp } from "@api/app";
import { createDatabase } from "@api/db/client";
import { createConversationStreams } from "@api/modules/conversations/streams";
import { createAuth } from "@api/modules/identity/service";

const databaseURL = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;
if (!databaseURL || !secret || secret.length < 32) {
  throw new Error(
    "DATABASE_URL and BETTER_AUTH_SECRET (at least 32 characters) are required",
  );
}
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? baseURL)
  .split(",")
  .map((value) => new URL(value.trim()).origin);
const db = createDatabase(databaseURL);
const auth = createAuth(db, { baseURL, secret, trustedOrigins });
const streams = createConversationStreams(db);
const app = createApp(db, auth, trustedOrigins, streams);

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

app.listen(port, (server) => {
  console.log(`Server listening on http://localhost:${server.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    // Close long-lived SSE responses before waiting for the HTTP server to drain.
    streams.close();
    app
      .stop()
      .then(() => db.$disconnect())
      .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
      });
  });
}
