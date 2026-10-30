const result = await Bun.build({
  entrypoints: ["packages/api-client/src/index.ts"],
  outdir: "packages/api-client/dist",
  target: "browser",
  metafile: true,
});

if (!result.success)
  throw new AggregateError(result.logs, "Client build failed");

if (!result.metafile) throw new Error("Client build metadata is missing");
const inputs = Object.keys(result.metafile.inputs);
const forbidden = inputs.filter((path) =>
  /(^|\/)(apps\/api|prisma|@prisma|elysia)(\/|$)/.test(path),
);
if (forbidden.length) {
  throw new Error(
    `Server runtime entered browser bundle: ${forbidden.join(", ")}`,
  );
}
if (!inputs.some((path) => path.includes("@elysia/eden"))) {
  throw new Error("Browser build must include the Eden HTTP client");
}
console.log(`Browser client built; ${inputs.length} inputs, no server runtime`);
