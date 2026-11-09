# Security

There is no released or supported runtime yet.

Do not disclose vulnerabilities, secrets or private artifact content in a public issue. Use GitHub's private vulnerability reporting for this repository when available. Otherwise contact the maintainer privately through the contact information on their GitHub profile before sharing technical details.

The implementation runs locally on loopback and serves only the selected change manifest. A per-process capability authorizes review requests; Host/Origin checks and CSP restrict browser access. Raw HTML remains escaped, external images do not load, and the reader never writes canonical Markdown. These boundaries do not isolate the process from local users who can modify it or its files.

Review snapshots may contain private source. Storage is owner-only outside the repository, remains until explicit removal, and is never uploaded by SpecTater. Keep capability URLs and review-state files private. Do not commit state, browser profiles or exported private feedback. File, request and state size limits fail visibly; no automatic retention cleanup runs.

Contract and browser tests exercise filesystem escape, active Markdown, foreign request and persistence failures. An independent security review remains a release prerequisite; automated tests are not that review.
