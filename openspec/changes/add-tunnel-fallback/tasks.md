# Tasks

## 1. Tunnel fallback for public access

- [x] 1.1 Add failing tests: `accessFor` adds `command` and `localUrl` to `public` access in a tunnel-capable remote session only, `handoffFor` names both as a fallback, and the CLI's proxied remote `open` reports them; verify with `bun test test/access.test.js test/agent-loop.test.js`.
- [x] 1.2 Implement the fallback in `src/access.js`; verify the tests from 1.1 pass.
- [x] 1.3 Update the `workflow` text, the skill and README (`access.mode` table and `LocalForward`); verify with `bun run check`.
