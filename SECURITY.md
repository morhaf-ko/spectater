# Security

Report vulnerabilities privately through [GitHub security advisories](https://github.com/morhaf-ko/spectater/security/advisories/new). Do not open a public issue, and do not include private review content or review URLs.

## Model

SpecTater is a local tool for one user.

- The server binds to `127.0.0.1`. Every data request needs the random token in the review URL. It accepts a `Host` of `localhost` or `127.0.0.1` on any port, so SSH and editor forwards work, plus the host of a configured `publicUrl` or codespace URL; other hosts are refused, which blocks DNS rebinding. An `Origin` must match the request's own loopback host or the public origin, and browser mutations require same-origin JSON.
- SpecTater never starts tunnels or proxies. With `publicUrl`, anyone who can reach your proxy and holds a review URL can read and comment on that review, so keep the proxy private (for example tailnet-only `tailscale serve`, never Funnel) and the codespace port private.
- Agent commands read the URL from an owner-only (`0600`) server record in the state directory.
- Markdown renders without raw HTML, scripts, remote images or relative links. A restrictive Content Security Policy is set. SpecTater never writes to your Markdown.
- Native OpenSpec selects the files to serve. Paths that escape the change, symlinks out of it and non-regular files are refused. Reads are size-limited.
- Review state is stored owner-only outside Git repositories, written atomically, and protected by a writer lock. Corrupt state is reported, never replaced.
- Diffs run `git diff --no-index` on private temporary copies with external diff drivers and textconv disabled, a 3-second limit and 256 KiB of output.

Other processes running as the same user can read the state directory and server record; SpecTater does not defend against them. Review state keeps copies of your Markdown until you delete it.
