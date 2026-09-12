# CI workflow

`test.yml` here is the GitHub Actions workflow for this repo: unit tests and
lint, plus the end-to-end suite against a real Community Solid Server.

**It needs to be moved into place by hand**, once, by someone whose credentials
carry the `workflow` scope:

```bash
mkdir -p .github/workflows
git mv docs/ci/test.yml .github/workflows/test.yml
git rm docs/ci/README.md
git commit -m "Enable CI"
```

It is parked here rather than dropped because the tokens available to the agent
that wrote it are refused by GitHub for any path under `.github/workflows/` —
an OAuth app cannot create or update a workflow without that scope, and neither
the git push nor the REST API would take it.

The e2e job installs Chromium with its OS dependencies; the suite starts and
tears down its own Solid server, so nothing else needs provisioning.
