import fs from "node:fs";

const TOKEN = /\$\{([A-Z][A-Z0-9_]*)\}/g;

export function renderMigrationTask(template, values) {
  const required = [...new Set([...template.matchAll(TOKEN)].map((match) => match[1]))];
  const missing = required.filter((name) => !values[name]);
  if (missing.length) throw new Error(`Missing template values: ${missing.join(", ")}`);

  const rendered = template.replace(TOKEN, (_, name) => values[name]);
  if (TOKEN.test(rendered)) throw new Error("Rendered task contains unresolved tokens");
  const task = JSON.parse(rendered);
  const image = task.containerDefinitions?.[0]?.image ?? "";
  if (!/@sha256:[0-9a-f]{64}$/.test(image)) {
    throw new Error("Migration image must use an immutable sha256 digest");
  }
  if (task.runtimePlatform?.cpuArchitecture !== "X86_64") {
    throw new Error("Migration task must use X86_64");
  }
  return `${JSON.stringify(task, null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [templatePath, outputPath] = process.argv.slice(2);
  if (!templatePath || !outputPath) {
    throw new Error("Usage: render-migration-task.mjs TEMPLATE OUTPUT");
  }
  fs.writeFileSync(outputPath, renderMigrationTask(fs.readFileSync(templatePath, "utf8"), process.env));
}
