# Security

Report vulnerabilities privately through [GitHub security advisories](https://github.com/morhaf-ko/spectater/security/advisories/new). Do not open a public issue, and do not include private review content or review URLs.

## Model

SpecTater is a local tool for one user.

- The server binds to `127.0.0.1`. Every data request needs the random token in the review URL. Requests with a foreign `Host` or `Origin` are refused, and browser mutations require same-origin JSON.
- Agent commands read the URL from an owner-only (`0600`) server record in the state directory.
- Markdown renders without raw HTML, scripts, remote images or relative links. A restrictive Content Security Policy is set. SpecTater never writes to your Markdown.
- Native OpenSpec selects the files to serve. Paths that escape the change, symlinks out of it and non-regular files are refused. Reads are size-limited.
- Review state is stored owner-only outside Git repositories, written atomically, and protected by a writer lock. Corrupt state is reported, never replaced.
- Diffs run `git diff --no-index` on private temporary copies with external diff drivers and textconv disabled, a 3-second limit and 256 KiB of output.

Other processes running as the same user can read the state directory and server record; SpecTater does not defend against them. Review state keeps copies of your Markdown until you delete it.
