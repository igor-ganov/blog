// PostToolUse hook: run the LLM-smell linter on a just-written article.
//
// Wired in .claude/settings.json on Write|Edit. It reads the hook payload from
// stdin, and when the edited file is a Markdown article under src/content it runs
// scripts/llm-smell.ts on that one file. If the linter finds error-level smells it
// exits 2 — the convention that feeds stderr back to the model — so the smells must
// be fixed before moving on. Any other file, or a clean article, exits 0 silently.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

const safeParse = (payload: string): unknown => {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
};

const filePathFrom = (payload: string): string | undefined => {
  const data = safeParse(payload);
  if (typeof data !== 'object' || data === null) return undefined;
  const record = data as Record<string, unknown>;
  const input = record.tool_input as Record<string, unknown> | undefined;
  const response = record.tool_response as Record<string, unknown> | undefined;
  const candidate = input?.file_path ?? response?.filePath ?? response?.file_path;
  return typeof candidate === 'string' ? candidate : undefined;
};

const isArticle = (file: string): boolean =>
  /(^|[\\/])src[\\/]content[\\/].+\.md$/i.test(file);

const main = async (): Promise<void> => {
  const payload = await readStdin().catch(() => '');
  if (payload.trim() === '') return;

  const file = filePathFrom(payload);
  if (file === undefined || !isArticle(file)) return;

  const here = dirname(fileURLToPath(import.meta.url));
  const linter = join(here, 'llm-smell.ts');
  const result = spawnSync('bun', [linter, file], { encoding: 'utf8' });

  // exit 1 from the linter means error-level smells were found.
  if (result.status === 1) {
    const report = stripAnsi(`${result.stdout ?? ''}${result.stderr ?? ''}`).trim();
    process.stderr.write(
      `LLM-smell linter found machine-generated tells in this article. Fix them before continuing (see the llm-smells skill for rewrites):\n\n${report}\n`,
    );
    process.exit(2);
  }
};

await main();
