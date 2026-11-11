# Design

## Windows privacy

NTFS reports no POSIX owner or mode bits, so the existing `0o077` and uid checks cannot hold. Windows user profiles grant access to the user, SYSTEM and Administrators only, so the state directory must resolve inside `os.homedir()`; files inside it are then treated as private. `%LOCALAPPDATA%` satisfies this by default.

## Running npm shims on Windows

Node refuses to spawn `.cmd` files without a shell. OpenSpec arguments are therefore passed to `cmd.exe` only when every argument matches `[\w.:/@-]+`, and a CLI missing from `PATH` with any `PATHEXT` extension is reported before spawning.

## Browser opening on Windows

`powershell.exe -Command Start-Process '<url>'` opens the default browser through ShellExecute and keeps the URL fragment that carries the capability. The URL is single-quoted with `'` doubled, so nothing in it is interpreted.

## Tailnet listener

A second `net` listener on the tailnet IPv4 hands its sockets to the same HTTP server, so host, origin and capability checks are unchanged. Its MagicDNS origin becomes the active public origin. Agent routes check the socket's local address and refuse anything that is not loopback. A configured `publicUrl` or codespace URL takes precedence, because `tailscale serve` on the same port would otherwise compete with the listener.

## Multiplexer detection

tmux updates `SSH_CONNECTION` in the session environment on every attach, so `tmux show-environment SSH_CONNECTION` reflects the current client. Herdr exposes no client information, so Herdr on a desktop host still needs `SPECTATER_REMOTE=1`, or works without it when Tailscale provides the URL.
