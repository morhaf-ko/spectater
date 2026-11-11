# Proposal

## Why

SpecTater refuses to run on Windows, cannot tell that a tmux pane on a Mac or Linux desktop is being used over SSH, and reaches another device only through an SSH tunnel or a hand-configured proxy. Reviewers on Windows, in multiplexers such as tmux and Herdr, and on phones or laptops elsewhere on their tailnet should get a working review URL without extra setup, as comparable tools already provide.

## What changes

- Support Windows: private storage under `%LOCALAPPDATA%\SpecTater` inside the user profile, server records and state checked without POSIX modes, `openspec.cmd` and `spectater.cmd` run through `cmd.exe` with restricted arguments, a hidden detached server, the default browser opened with PowerShell `Start-Process`, `;`-separated `$BROWSER`, and Copilot hooks with a `powershell` command.
- In WSL, fall back to the Windows browser when `xdg-open` is missing.
- Treat a tmux pane as remote when tmux reports `SSH_CONNECTION` for its session.
- When Tailscale is running with MagicDNS and no public URL applies, also listen on the tailnet IPv4 and print a MagicDNS review URL. `SPECTATER_TAILSCALE=0` turns it off. Agent commands stay loopback-only.
- With `SPECTATER_HERDR_CHIME=1` inside Herdr, show one Herdr notification when the agent starts waiting.
- Run the contract tests and smoke test on Linux, macOS and Windows in CI.

## Capabilities

### Modified capabilities

- `workflow-handoff`: Windows and WSL opening, Windows server start, tmux detection, tailnet review URL, Herdr notification.
- `change-reading`: the tailnet listener and host join loopback as accepted.
- `review-feedback`: Windows private storage.

## Impact

`src/access.js`, `src/agent.js`, `src/discovery.js`, `src/hooks.js`, `src/server.js`, `src/storage.js`, `bin/spectater.js`, tests, `.github/workflows/check.yml`, README.md and SECURITY.md. No status, exit code or stored state format changes; `access.mode` gains no new value.
