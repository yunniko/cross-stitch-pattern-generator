// Offline trial: does Jev (TypeSafe System One) triage G-111's moderation cases
// well enough to plan on? Sends each hand-labelled case in moderation-cases.json
// to the HTTP API once, stores every answer, and prints the metrics the review
// reads. Nothing here is part of the app.
//
//   node scripts/jev-trial/run-moderation-trial.mjs --dry-run   # build requests, send nothing
//   node scripts/jev-trial/run-moderation-trial.mjs             # needs TYPESAFE_API_KEY
//   node scripts/jev-trial/run-moderation-trial.mjs --limit=3     # first three cases, a smoke test
//   node scripts/jev-trial/run-moderation-trial.mjs --score-only  # recompute from saved answers

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CASES = join(here, "moderation-cases.json");
const ANSWERS = join(here, "moderation-answers.json");
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const CONCURRENCY = 4;
const PRICE_PER_MTOK = 0.042; // input only; output is free (docs.typesafe.ai/models, 2026-10-08)

const FLAGS = ["spam", "abusive", "off_topic", "personal_data"];
const ACTIONS = ["allow", "review", "remove"];

const WHERE = {
  comment: "a comment posted under a page of the user guide of a cross-stitch chart app",
  chart: "the description of a cross-stitch chart a user published to the app's public gallery",
};

// One narrow judgment per question; high value means yes (docs: primitives/noul).
const QUESTIONS = {
  spam: {
    type: "noul",
    instructions:
      "`text` is spam: advertising, scams, phishing, or links and offers posted to promote something rather than to take part in the discussion.",
    criteria: {
      true: "Mass-posted or unsolicited promotion, scams, phishing, or links to unrelated sites, including on-topic sales offers.",
      false:
        "A genuine comment or chart description, including one that names a useful resource, complains about the app, or mentions the writer's own work in passing.",
    },
  },
  abusive: {
    type: "noul",
    instructions: "`text` insults, harasses, threatens or demeans a person or a group of people.",
    criteria: {
      true: "Insults or slurs aimed at people, threats, harassment of a named person, or contempt for a group.",
      false:
        "Harsh words about the app, a tool, a pattern or one's own stitching; craft slang such as frogging, ripping out or killing a thread; dark or violent subjects of a chart; self-directed hyperbole.",
    },
  },
  off_topic: {
    type: "noul",
    instructions: "`text` has nothing to do with cross-stitch, needlework, charts, threads, or the app it is posted in.",
  },
  personal_data: {
    type: "noul",
    instructions:
      "`text` reveals contact details or private information about a person: an email address, a phone number, a home address, login details, or private facts such as health about a named individual.",
  },
  action: {
    type: "score",
    instructions: "What should the moderator of a friendly cross-stitch community do with `text`, posted as `where` (`page_or_title`)?",
    criteria: [
      "Leave it up: on-topic or harmless, even if blunt, critical, sarcastic, sad or off-topic chit-chat.",
      "Hold it for a person to look at: self-promotion, a personal jab, someone's contact details, a report about another user, a sign someone may be in danger, or anything unclear.",
      "Take it down: spam, scams, phishing, abuse, threats, slurs, or exposing someone else's private details.",
    ],
  },
};

const stateOf = (c) => ({ where: WHERE[c.kind], page_or_title: c.where, text: c.text });

async function ask(c, key) {
  const body = JSON.stringify({ model: MODEL, state: stateOf(c), questions: QUESTIONS });
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body,
    });
    const ms = Math.round(performance.now() - started);
    if ((res.status === 429 || res.status === 529) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${c.id}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return { id: c.id, ms, ...JSON.parse(text) };
  }
}

async function run(cases, key) {
  const out = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < cases.length) {
        const i = next++;
        out[i] = await ask(cases[i], key);
        process.stderr.write(".");
      }
    })
  );
  process.stderr.write("\n");
  return out;
}

// --- metrics -------------------------------------------------------------

function auc(pos, neg) {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return pos.length && neg.length ? wins / (pos.length * neg.length) : NaN;
}

function atThreshold(rows, t) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const { y, p } of rows) {
    if (p >= t) y ? tp++ : fp++;
    else y ? fn++ : tn++;
  }
  return { t, tp, fp, fn, tn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) };
}

const pct = (x) => `${(100 * x).toFixed(0)}%`;
const lang = (c) => (/[áčďéěíňóřšťúůýž]/i.test(c.text + c.where) ? "cs" : "en");

function report(cases, answers) {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const rows = cases.map((c) => ({ c, a: byId.get(c.id) }));
  const lines = [];
  const log = (s = "") => lines.push(s);

  const tokens = answers.reduce((s, a) => s + (a.usage?.input_tokens ?? 0), 0);
  const ms = answers.map((a) => a.ms).sort((x, y) => x - y);
  log(`Model: ${answers[0]?.model}; cases: ${answers.length}`);
  log(
    `Input tokens: ${tokens} (≈ $${((tokens / 1e6) * PRICE_PER_MTOK).toFixed(4)}); ` +
      `latency p50 ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.floor(ms.length * 0.9)]} ms, max ${ms.at(-1)} ms`
  );
  log();
  log("| flag | positives | AUC | at 0.5: precision / recall | misses at 0.5 | false alarms at 0.5 |");
  log("|---|---|---|---|---|---|");
  for (const f of FLAGS) {
    const r = rows.map(({ c, a }) => ({ id: c.id, y: c.flags.includes(f), p: a.answers[f].noul }));
    const m = atThreshold(r, 0.5);
    const misses = r.filter((x) => x.y && x.p < 0.5).map((x) => `${x.id} (${x.p.toFixed(2)})`);
    const alarms = r.filter((x) => !x.y && x.p >= 0.5).map((x) => `${x.id} (${x.p.toFixed(2)})`);
    const a = auc(
      r.filter((x) => x.y).map((x) => x.p),
      r.filter((x) => !x.y).map((x) => x.p)
    );
    log(
      `| ${f} | ${m.tp + m.fn} | ${a.toFixed(3)} | ${pct(m.precision)} / ${pct(m.recall)} | ${misses.join(", ") || "—"} | ${alarms.join(", ") || "—"} |`
    );
  }

  // Action: the Score's most probable level vs the hand label.
  const level = (a) => {
    const p = a.answers.action.probabilities;
    return ACTIONS[Number(Object.keys(p).reduce((x, y) => (p[x] >= p[y] ? x : y)))];
  };
  const confusion = (subset) => {
    const m = Object.fromEntries(ACTIONS.map((h) => [h, Object.fromEntries(ACTIONS.map((j) => [j, 0]))]));
    for (const { c, a } of subset) m[c.action][level(a)]++;
    return m;
  };
  const table = (title, subset) => {
    const m = confusion(subset);
    const agree = subset.filter(({ c, a }) => c.action === level(a)).length;
    log();
    log(`${title}: agreement ${agree}/${subset.length} (${pct(agree / subset.length)})`);
    log();
    log("| hand \\ Jev | allow | review | remove |");
    log("|---|---|---|---|");
    for (const h of ACTIONS) log(`| ${h} | ${ACTIONS.map((j) => m[h][j]).join(" | ")} |`);
  };
  table("Action, all cases", rows);
  table(
    "Action, English",
    rows.filter(({ c }) => lang(c) === "en")
  );
  table(
    "Action, Czech",
    rows.filter(({ c }) => lang(c) === "cs")
  );
  table(
    "Action, cases marked hard",
    rows.filter(({ c }) => c.hard)
  );

  // The two errors that matter: harm left up, and harmless taken down.
  const leftUp = rows.filter(({ c, a }) => c.action === "remove" && level(a) === "allow");
  const takenDown = rows.filter(({ c, a }) => c.action === "allow" && level(a) === "remove");
  log();
  log(`Harmful left up (hand remove, Jev allow): ${leftUp.map(({ c }) => c.id).join(", ") || "none"}`);
  log(`Harmless taken down (hand allow, Jev remove): ${takenDown.map(({ c }) => c.id).join(", ") || "none"}`);

  // Calibration of the action Score: confidence buckets vs agreement.
  log();
  log("| action confidence | cases | agreement |");
  log("|---|---|---|");
  for (const [lo, hi] of [
    [0, 0.5],
    [0.5, 0.7],
    [0.7, 0.85],
    [0.85, 1.01],
  ]) {
    const b = rows.filter(({ a }) => a.answers.action.confidence >= lo && a.answers.action.confidence < hi);
    const ok = b.filter(({ c, a }) => c.action === level(a)).length;
    log(`| ${lo}–${Math.min(hi, 1)} | ${b.length} | ${b.length ? pct(ok / b.length) : "—"} |`);
  }

  log();
  log("Disagreements (id, hand → Jev, P(allow/review/remove), note):");
  for (const { c, a } of rows.filter(({ c, a }) => c.action !== level(a))) {
    const p = a.answers.action.probabilities;
    log(`- ${c.id} ${c.action} → ${level(a)} (${[0, 1, 2].map((i) => (p[i] ?? 0).toFixed(2)).join("/")}) ${c.hard ?? ""}`);
  }
  return lines.join("\n");
}

// --- main ----------------------------------------------------------------

const args = new Set(process.argv.slice(2));
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
const cases = JSON.parse(readFileSync(CASES, "utf8")).cases.slice(0, limit);

for (const c of cases) {
  if (!WHERE[c.kind] || !ACTIONS.includes(c.action) || c.flags.some((f) => !FLAGS.includes(f))) throw new Error(`bad case ${c.id}`);
}

if (args.has("--dry-run")) {
  const sample = { model: MODEL, state: stateOf(cases[0]), questions: QUESTIONS };
  console.log(JSON.stringify(sample, null, 2));
  console.log(`\n${cases.length} cases valid; ${CONCURRENCY} at a time; nothing sent.`);
} else {
  let answers;
  if (args.has("--score-only")) {
    if (!existsSync(ANSWERS)) throw new Error("no saved answers; run without --score-only first");
    answers = JSON.parse(readFileSync(ANSWERS, "utf8"));
  } else {
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) throw new Error("TYPESAFE_API_KEY is not set");
    answers = await run(cases, key);
    writeFileSync(ANSWERS, JSON.stringify(answers, null, 1) + "\n");
  }
  console.log(report(cases, answers));
}
