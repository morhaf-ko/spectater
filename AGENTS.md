# Project guidance

Read README.md and CONTRIBUTING.md before working. Behaviour is specified in `openspec/specs`; put behaviour changes in an OpenSpec change under `openspec/changes` and keep code, specs and tests in step.

- Native OpenSpec is the authority for roots, schemas and artifact paths. Do not reimplement discovery.
- Markdown on disk is canonical. SpecTater never writes it.
- Agent commands print exactly one JSON object with `status` and `next_step`; keep statuses and exit codes stable and documented in README.md.
- Review feedback, replies and ending a review never imply approval to implement, merge or deploy.
- No accounts, hosted services, telemetry or embedded models. Hooks only report open reviews; they never drive the agent.
- Keep runtime dependencies minimal and the browser client framework-free.
- Run `bun run check` before proposing a change.
