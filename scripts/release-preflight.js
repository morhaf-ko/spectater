// Read-only check of the repository settings the Release workflow depends on.
// GITHUB_TOKEN cannot read these settings, so maintainers run this locally with `gh`.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repo = process.argv[2] || 'morhaf-ko/spectater';
const gh = async (...args) => JSON.parse((await exec('gh', args)).stdout);

const problems = [];
const permissions = await gh('api', `repos/${repo}/actions/permissions/workflow`);
if (!permissions.can_approve_pull_request_reviews)
  problems.push(
    'release-please cannot open release pull requests.',
    `  gh api -X PUT repos/${repo}/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`,
  );
const variables = new Set(
  (await gh('variable', 'list', '-R', repo, '--json', 'name')).map((v) => v.name),
);
for (const name of ['CI_RUNNER', 'LIGHT_RUNNER', 'RELEASE_RUNNER'])
  if (!variables.has(name))
    problems.push(
      `Repository variable ${name} is not set.`,
      `  gh variable set ${name} -R ${repo} --body ubuntu-24.04`,
    );

if (problems.length) {
  console.error(`Release setup for ${repo} is incomplete:\n${problems.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Release setup for ${repo}: GitHub settings ready.`);
console.log(
  'npm trusted publishing cannot be read without 2FA. Confirm once with `npm trust list spectater`; it must name workflow release.yml and environment npm.',
);
