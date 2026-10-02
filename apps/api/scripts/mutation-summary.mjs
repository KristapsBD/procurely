// Prints a Markdown summary of reports/mutation/mutation.json (mutation score per file).
import { readFileSync } from 'node:fs';

const report = JSON.parse(
  readFileSync('reports/mutation/mutation.json', 'utf8'),
);
const rows = [];
let killed = 0;
let total = 0;
for (const [file, { mutants }] of Object.entries(report.files)) {
  // The statuses Stryker counts toward the score; compile and runtime errors are excluded.
  const valid = mutants.filter((m) =>
    ['Killed', 'Timeout', 'Survived', 'NoCoverage'].includes(m.status),
  );
  const dead = valid.filter((m) =>
    ['Killed', 'Timeout'].includes(m.status),
  ).length;
  killed += dead;
  total += valid.length;
  rows.push(
    `| ${file} | ${dead} | ${valid.length} | ${valid.length ? ((dead / valid.length) * 100).toFixed(1) : '-'}% |`,
  );
}
console.log('## Mutation score (report only, does not block merges)\n');
console.log(
  '| File | Killed | Mutants | Score |\n| --- | ---: | ---: | ---: |',
);
console.log(rows.join('\n'));
console.log(
  `\n**Total: ${killed}/${total} (${total ? ((killed / total) * 100).toFixed(1) : '-'}%)**. Full HTML report: the \`mutation-report\` artifact of this run.`,
);
