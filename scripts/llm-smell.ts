// LLM-smell linter for prose content.
//
// Scans Markdown under src/content for the lexical and rhetorical tells that
// betray machine-generated text — the filler phrases, marketing verbs, and
// throat-clearing transitions a human technical writer would not reach for.
// Fenced code blocks and frontmatter are skipped so real code is never flagged.
//
// Run:  bun run scripts/llm-smell.ts            (scans src/content)
//       bun run scripts/llm-smell.ts path ...   (scans given files/dirs)
//
// A line may opt out with a trailing or preceding HTML comment:
//   <!-- llm-smell-disable-line delve -->        suppress one rule
//   <!-- llm-smell-disable-line -->              suppress all rules on the line
//
// Exit code is non-zero when any `error`-severity smell is found, so CI fails.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

type Severity = 'error' | 'warn';
type Lang = 'all' | 'en' | 'it' | 'ru';

interface Rule {
  readonly id: string;
  readonly re: RegExp;
  readonly hint: string;
  readonly severity: Severity;
  // Which language a rule applies to, matched against the file's locale (derived
  // from its src/content/<kind>/<locale>/ path). Omitted = English. 'all' = every
  // language (emoji, markdown-structural tells).
  readonly lang?: Lang;
}

// The catalogue. `error` rules are near-certain AI tells that genuine technical
// prose almost never uses; they block CI. `warn` rules are softer style nudges.
// Keep each pattern case-insensitive and anchored on word boundaries so that
// technical terms ("elevated privileges", "realmode") are not caught.
const rules: readonly Rule[] = [
  // — Signature filler verbs and nouns —
  { id: 'delve', re: /\bdelv(e|es|ing|ed)\b/i, hint: 'Just say "look at" / "go into".', severity: 'error' },
  { id: 'tapestry', re: /\btapestr(y|ies)\b/i, hint: 'Drop the metaphor.', severity: 'error' },
  { id: 'realm', re: /\bin the realm of\b/i, hint: 'Say "in".', severity: 'error' },
  { id: 'landscape', re: /\b(navigat\w+|evolving|changing|shifting|complex)\s+landscape\b/i, hint: 'Name the actual thing, not "the landscape".', severity: 'error' },
  { id: 'testament', re: /\b(a|is a|stands as a)\s+testament to\b/i, hint: 'Show the evidence instead.', severity: 'error' },
  { id: 'embark', re: /\bembark(s|ed|ing)?\s+on\b/i, hint: 'Say "start".', severity: 'error' },
  { id: 'journey', re: /\b(our|your|this|the)\s+journey\b/i, hint: 'It is not a journey; name the task.', severity: 'warn' },
  { id: 'leverage-verb', re: /\bleverag(e|es|ing)\s+(the|our|your|a|its|their|this|these|those|advanced|powerful)\b/i, hint: 'Say "use".', severity: 'error' },
  { id: 'harness', re: /\bharness(es|ing|ed)?\s+(the\s+)?(power|potential|strength)\b/i, hint: 'Say "use".', severity: 'error' },
  { id: 'unlock', re: /\bunlock(s|ing|ed)?\s+(the\s+)?(power|potential|secrets|value|true)\b/i, hint: 'Drop it.', severity: 'error' },
  { id: 'unleash', re: /\bunleash(es|ing|ed)?\b/i, hint: 'Drop it.', severity: 'error' },
  { id: 'elevate', re: /\belevate(s|d)?\s+(your|the|our)\b/i, hint: 'Drop the marketing verb.', severity: 'error' },
  { id: 'next-level', re: /\bto the next level\b/i, hint: 'Drop it.', severity: 'error' },
  { id: 'supercharge', re: /\bsupercharg(e|es|ed|ing)\b/i, hint: 'Drop it.', severity: 'error' },
  { id: 'game-changer', re: /\bgame[-\s]?chang(er|ers|ing)\b/i, hint: 'Drop it.', severity: 'error' },
  { id: 'revolutionize', re: /\brevolutioni[sz](e|es|ed|ing)\b/i, hint: 'Overclaim — drop it.', severity: 'error' },
  { id: 'cutting-edge', re: /\b(cutting[-\s]edge|state[-\s]of[-\s]the[-\s]art|bleeding[-\s]edge)\b/i, hint: 'Name the actual version/tech.', severity: 'error' },
  { id: 'plethora', re: /\bplethora\b/i, hint: 'Say "many" or give the number.', severity: 'error' },
  { id: 'myriad', re: /\bmyriad\b/i, hint: 'Say "many" or give the number.', severity: 'error' },

  // — Throat-clearing and meta-commentary —
  { id: 'worth-noting', re: /\bit'?s\s+worth\s+noting\b|\bit\s+is\s+worth\s+noting\b/i, hint: 'If it is worth noting, just note it.', severity: 'error' },
  { id: 'important-to-note', re: /\bit'?s\s+important\s+to\s+(note|remember|understand|realize|mention)\b|\bit\s+is\s+important\s+to\s+(note|remember|understand|realize|mention)\b/i, hint: 'State the point directly.', severity: 'error' },
  { id: 'needless-to-say', re: /\bneedless to say\b/i, hint: 'Then do not say it.', severity: 'error' },
  { id: 'when-it-comes-to', re: /\bwhen it comes to\b/i, hint: 'Say "for" / "with".', severity: 'error' },
  { id: 'in-todays-world', re: /\bin today'?s\s+(fast[-\s]paced|digital|modern|ever[-\s]changing|connected)\s+world\b/i, hint: 'Cut the scene-setting.', severity: 'error' },
  { id: 'at-the-end-of-the-day', re: /\bat the end of the day\b/i, hint: 'Cut the filler.', severity: 'error' },
  { id: 'first-and-foremost', re: /\bfirst and foremost\b/i, hint: 'Say "first".', severity: 'error' },
  { id: 'look-no-further', re: /\blook no further\b/i, hint: 'Cut it.', severity: 'error' },
  { id: 'rest-assured', re: /\brest assured\b/i, hint: 'Cut it.', severity: 'error' },

  // — Rhetorical scaffolding —
  { id: 'not-just-but', re: /\b(it'?s|its|this is|that'?s)\s+not\s+just\b[^.?!]{1,60}?\b(it'?s|but|—|–)\b/i, hint: 'The "not just X, it\'s Y" cadence is an AI tell.', severity: 'error' },
  { id: 'isnt-just', re: /\bisn'?t\s+just\b[^.?!]{1,60}?\b(it'?s|but|—|–)\b/i, hint: 'Same cadence — rephrase plainly.', severity: 'error' },
  { id: 'not-only-but-also', re: /\bnot only\b[^.?!]{1,80}?\bbut also\b/i, hint: 'Flatten the parallelism.', severity: 'warn' },
  { id: 'more-than-just', re: /\bmore than just\b/i, hint: 'Rephrase plainly.', severity: 'warn' },
  { id: 'dive', re: /\b(let'?s|we'?ll|to)\s+dive\s+(in|into)\b|\bdiv(e|ing)\s+deep\b/i, hint: 'Say "look at".', severity: 'error' },
  { id: 'whether-audience', re: /\bwhether you'?re\b[^.?!]{1,60}?\bor\b/i, hint: 'Drop the "whether you\'re a X or a Y" framing.', severity: 'error' },
  { id: 'in-conclusion', re: /\b(in conclusion|in summary|to sum up|to wrap up)\b/i, hint: 'End on the point, not a label.', severity: 'error' },

  // — Assistant register that leaks into articles —
  { id: 'assistant-voice', re: /\b(as an ai|i hope this helps|i'?m sorry,? but|feel free to|great question|certainly!|of course!|here'?s a breakdown)\b/i, hint: 'Chat-assistant register — remove.', severity: 'error' },

  // — Softer marketing adjectives (warn only) —
  { id: 'seamless', re: /\bseamless(ly)?\b/i, hint: 'Show it works; do not assert "seamless".', severity: 'warn' },
  { id: 'effortless', re: /\beffortless(ly)?\b/i, hint: 'Rarely true — cut or qualify.', severity: 'warn' },
  { id: 'transition-pileup', re: /^\s*(furthermore|moreover|additionally),/i, hint: 'Sentence-leading transition; usually deletable.', severity: 'warn' },
  { id: 'comprehensive', re: /\bcomprehensive\b/i, hint: 'Often filler — cut or be specific.', severity: 'warn' },
  { id: 'holistic', re: /\bholistic\b/i, hint: 'Vague — name the parts.', severity: 'warn' },

  // — Cadence / structural tells (heuristic; warn only). A regex cannot police
  // rhythm in general — triads, balanced antithesis, and em-dash-heavy prose are
  // the house style of this very site — so these catch only the few high-precision
  // shapes that genuine articles here never use. The real cadence gate is the
  // `llm-smells` skill plus a human (or LLM-judge) read.
  { id: 'dramatic-opener', re: /(?:^|[.!?]\s+)(yes|no|and|but|so|now|here|sure|look|again|right)\s+[—–]/i, hint: 'Dramatic "Yes —" / "But —" opener; rephrase plainly.', severity: 'warn' },
  { id: 'question-heading', re: /^#{2,}\s+.*\?\s*$/, hint: 'Rhetorical question heading reads as AI; make it a statement.', severity: 'warn', lang: 'all' },

  // — Russian AI tells (apply to ru/ files). Cyrillic is not a JS \w/\b class,
  // so these use explicit Cyrillic letter classes instead of word boundaries.
  { id: 'ru-pogruzimsya', re: /(давайте\s+)?погруз(имся|иться|итесь)/i, hint: 'Канцелярит ИИ: «разберём» / «посмотрим».', severity: 'error', lang: 'ru' },
  { id: 'ru-v-sovremennom-mire', re: /в\s+(современном|сегодняшнем|цифровом|динамичном)\s+мире/i, hint: 'Уберите «в современном мире».', severity: 'error', lang: 'ru' },
  { id: 'ru-stoit-otmetit', re: /(стоит|следует|важно)\s+(отметить|упомянуть|заметить|подчеркнуть)/i, hint: 'Скажите по сути.', severity: 'error', lang: 'ru' },
  { id: 'ru-kogda-delo', re: /когда\s+дело\s+(доходит|касается)/i, hint: 'Скажите «для» / «с».', severity: 'error', lang: 'ru' },
  { id: 'ru-raskryt-potencial', re: /раскры(ть|вает|вая)\s+(весь\s+)?потенциал/i, hint: 'Маркетинг — уберите.', severity: 'error', lang: 'ru' },
  { id: 'ru-novyj-uroven', re: /(вывести\s+на|поднять\s+на|на)\s+новый\s+уровень/i, hint: 'Уберите штамп.', severity: 'error', lang: 'ru' },
  { id: 'ru-besshovno', re: /(бесшовн[а-яё]*|беспрепятственн[а-яё]*)/i, hint: 'Не «бесшовно» — покажите.', severity: 'error', lang: 'ru' },
  { id: 'ru-revolucionnyj', re: /(революционн[а-яё]*|инновационн[а-яё]*)/i, hint: 'Перебор — уберите.', severity: 'error', lang: 'ru' },
  { id: 'ru-shirokij-spektr', re: /(широк[а-яё]+\s+спектр|целый\s+ряд|богат[а-яё]+\s+опыт)/i, hint: 'Назовите конкретику.', severity: 'error', lang: 'ru' },
  { id: 'ru-igraet-rol', re: /(играет|является)\s+(ключев[а-яё]+|важн[а-яё]+|критическ[а-яё]+)\s+(роль|элемент[а-яё]*|фактор[а-яё]*)/i, hint: 'Скажите, что делает.', severity: 'error', lang: 'ru' },
  { id: 'ru-v-zaklyuchenie', re: /(в\s+заключение|подводя\s+итог|подытоживая)/i, hint: 'Завершайте мыслью, не ярлыком.', severity: 'error', lang: 'ru' },
  { id: 'ru-v-etoj-state', re: /в\s+(этой|данной)\s+стат(ье|ьи)\s+мы/i, hint: 'Не анонсируйте — пишите по делу.', severity: 'error', lang: 'ru' },
  { id: 'ru-pervostepennoe', re: /(первостепенн[а-яё]+\s+значени[а-яё]+|крайне\s+важн[а-яё]+|чрезвычайно\s+важн[а-яё]+)/i, hint: 'Без пафоса.', severity: 'warn', lang: 'ru' },
  { id: 'ru-transition', re: /^\s*(более\s+того|кроме\s+того|таким\s+образом|следовательно),/i, hint: 'Связка в начале — обычно лишняя.', severity: 'warn', lang: 'ru' },

  // — Italian AI tells (apply to it/ files) —
  { id: 'it-immergiamoci', re: /\b(immergiamoci|immergiti|addentriamoci|approfondiamo)\b/i, hint: 'Tell da IA: dì «vediamo» / «guardiamo».', severity: 'error', lang: 'it' },
  { id: 'it-nel-mondo-di', re: /\bnel\s+mondo\s+(di|della|dello|delle)\b/i, hint: 'Togli «nel mondo di».', severity: 'error', lang: 'it' },
  { id: 'it-era-digitale', re: /\bnell['’]era\s+(digitale|moderna)\b|\bnel\s+panorama\b/i, hint: 'Togli la scenografia.', severity: 'error', lang: 'it' },
  { id: 'it-vale-la-pena', re: /\bvale\s+la\s+pena\s+(di\s+)?(notare|sottolineare|menzionare)\b/i, hint: 'Dillo e basta.', severity: 'error', lang: 'it' },
  { id: 'it-importante-notare', re: /è\s+importante\s+(notare|sottolineare|ricordare)/i, hint: 'Vai dritto al punto.', severity: 'error', lang: 'it' },
  { id: 'it-quando-si-tratta', re: /\bquando\s+si\s+tratta\s+di\b/i, hint: 'Dì «per» / «con».', severity: 'error', lang: 'it' },
  { id: 'it-sfruttare-potenza', re: /\bsfrutta(re|ndo)\s+(appieno\s+)?(la\s+potenza|il\s+potenziale)\b/i, hint: 'Dì «usa».', severity: 'error', lang: 'it' },
  { id: 'it-sbloccare', re: /\bsblocca(re|ndo)\s+(il\s+)?(potenziale|valore)\b/i, hint: 'Togli.', severity: 'error', lang: 'it' },
  { id: 'it-livello-successivo', re: /\bal\s+livello\s+successivo\b/i, hint: 'Togli il cliché.', severity: 'error', lang: 'it' },
  { id: 'it-rivoluzionario', re: /\b(rivoluzionari\w+|all['’]avanguardia|di\s+ultima\s+generazione)\b/i, hint: 'Esagerato — togli.', severity: 'error', lang: 'it' },
  { id: 'it-senza-soluzione', re: /\bsenza\s+soluzione\s+di\s+continuità\b|\bsenza\s+sforzo\b/i, hint: 'Non dichiarare «seamless» — dimostralo.', severity: 'error', lang: 'it' },
  { id: 'it-miriade', re: /\b(una\s+miriade\s+di|un['’]ampia\s+gamma\s+di|una\s+vasta\s+gamma\s+di)\b/i, hint: 'Dì un numero o «molti».', severity: 'error', lang: 'it' },
  { id: 'it-in-conclusione', re: /\b(in\s+conclusione|per\s+riassumere|in\s+sintesi|riassumendo)\b/i, hint: 'Chiudi sul punto, non con un’etichetta.', severity: 'error', lang: 'it' },
  { id: 'it-gioca-ruolo', re: /\b(gioca|svolge)\s+un\s+ruolo\s+(cruciale|fondamentale|chiave)\b/i, hint: 'Dì cosa fa, concretamente.', severity: 'error', lang: 'it' },
  { id: 'it-in-questo-articolo', re: /\bin\s+questo\s+articolo\s+(esploreremo|vedremo|analizzeremo)\b/i, hint: 'Non annunciare l’articolo — scrivilo.', severity: 'error', lang: 'it' },
  { id: 'it-fondamentale', re: /(è\s+fondamentale|di\s+fondamentale\s+importanza)/i, hint: 'Senza enfasi.', severity: 'warn', lang: 'it' },

  // — No emoji (house rule) — but allow the dingbat check/cross marks
  // (U+2713–2718) that articles use as plain yes/no markers in tables and
  // quoted CLI output.
  { id: 'emoji', re: /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2719}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u, hint: 'No emoji in articles.', severity: 'error', lang: 'all' },
];

// Derive the file's locale from its src/content/<kind>/<locale>/ path; default
// to English for anything outside that layout.
const localeOfFile = (file: string): Lang => {
  const match = file.replace(/\\/g, '/').match(/\/content\/(?:kb|blog|pages)\/(en|it|ru)\//);
  return match?.[1] === 'it' ? 'it' : match?.[1] === 'ru' ? 'ru' : 'en';
};

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: Rule;
  readonly text: string;
}

const disableRe = /<!--\s*llm-smell-disable-line\s*([\w-]*)\s*-->/i;

const collectMarkdown = async (path: string): Promise<readonly string[]> => {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => undefined);
  if (entries === undefined) return path.endsWith('.md') ? [path] : [];
  const nested = await Promise.all(
    entries.map((entry) => collectMarkdown(join(path, entry.name))),
  );
  return nested.flat();
};

// A line is suppressed for a rule when this line OR the previous line carries a
// matching disable comment (a bare comment suppresses every rule).
const suppressedFor = (lines: readonly string[], index: number, ruleId: string): boolean => {
  const candidates = [lines[index] ?? '', index > 0 ? (lines[index - 1] ?? '') : ''];
  return candidates.some((candidate) => {
    const match = candidate.match(disableRe);
    if (match === null) return false;
    const target = match[1]?.trim();
    return target === undefined || target === '' || target === ruleId;
  });
};

const scanFile = async (file: string): Promise<readonly Finding[]> => {
  const raw = await readFile(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const fileLocale = localeOfFile(file);
  const active = rules.filter((rule) => {
    const lang = rule.lang ?? 'en';
    return lang === 'all' || lang === fileLocale;
  });
  const findings: Finding[] = [];
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === '---';
  // Page copy lives in Markdown frontmatter (src/content/pages/**), so scan it as
  // prose. Article frontmatter (kb/blog) stays skipped — there only the body is prose.
  const scanFrontmatter = /[/\\]content[/\\]pages[/\\]/.test(file);

  const scanLine = (line: string, index: number): void => {
    for (const rule of active) {
      const match = rule.re.exec(line);
      if (match === null) continue;
      if (suppressedFor(lines, index, rule.id)) continue;
      findings.push({ file, line: index + 1, column: match.index + 1, rule, text: match[0] });
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (index > 0 && trimmed === '---') {
        inFrontmatter = false;
        return;
      }
      if (scanFrontmatter && index > 0) scanLine(line, index);
      return;
    }
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    scanLine(line, index);
  });
  return findings;
};

const colors = {
  red: (s: string): string => `[31m${s}[0m`,
  yellow: (s: string): string => `[33m${s}[0m`,
  dim: (s: string): string => `[2m${s}[0m`,
  bold: (s: string): string => `[1m${s}[0m`,
};

const main = async (): Promise<void> => {
  const targets = process.argv.slice(2);
  const roots = targets.length > 0 ? targets : ['src/content'];
  const cwd = process.cwd();
  const files = (await Promise.all(roots.map((root) => collectMarkdown(resolve(cwd, root))))).flat();
  const findings = (await Promise.all(files.map(scanFile))).flat();

  const errors = findings.filter((f) => f.rule.severity === 'error');
  const warns = findings.filter((f) => f.rule.severity === 'warn');

  for (const f of findings) {
    const where = colors.dim(`${relative(cwd, f.file)}:${f.line}:${f.column}`);
    const tag = f.rule.severity === 'error' ? colors.red('smell') : colors.yellow('style');
    console.log(`${where} ${tag} ${colors.bold(f.rule.id)} "${f.text}" — ${f.rule.hint}`);
  }

  const scanned = `${files.length} file${files.length === 1 ? '' : 's'}`;
  if (findings.length === 0) {
    console.log(colors.dim(`llm-smell: clean (${scanned}).`));
    return;
  }
  console.log(
    colors.dim(
      `llm-smell: ${errors.length} smell(s), ${warns.length} style note(s) across ${scanned}.`,
    ),
  );
  if (errors.length > 0) process.exitCode = 1;
};

await main();
