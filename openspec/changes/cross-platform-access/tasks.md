# Tasks

## 1. Windows and WSL

- [x] 1.1 Windows state directory, profile-scoped privacy check, mode-free file checks and no directory fsync in `src/storage.js` and `src/agent.js`; verify with `bun run test` on Windows CI.
- [x] 1.2 Run `openspec` through `cmd.exe` with restricted arguments, hide the detached server's console, open the browser with PowerShell, split `$BROWSER` on `;`, fall back to PowerShell in WSL; verify with `bun run test`.
- [x] 1.3 Shell for the OpenCode plugin and a `powershell` Copilot hook on Windows; verify with `bun run test`.

## 2. Remote access

- [x] 2.1 Detect tmux sessions attached over SSH; verify with `bun run test`.
- [x] 2.2 Detect Tailscale, add the tailnet listener and loopback-only agent routes; verify with `bun run test`.
- [x] 2.3 Opt-in Herdr notification once per delivered batch; verify with `bun run test`.

## 3. Delivery

- [x] 3.1 Linux, macOS and Windows CI job running the contract and smoke tests.
- [x] 3.2 README and SECURITY.md updates; verify with `bun run check`.
