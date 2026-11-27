# VOLTRACK

[![CI/CD](https://github.com/DevoArn/VOLTRACK/actions/workflows/ci.yml/badge.svg)](https://github.com/DevoArn/VOLTRACK/actions/workflows/ci.yml)
[![CodeQL](https://github.com/DevoArn/VOLTRACK/actions/workflows/codeql.yml/badge.svg)](https://github.com/DevoArn/VOLTRACK/actions/workflows/codeql.yml)

![VOLTRACK](Doc/images/start.png)

Three browser synthesizers: a Eurorack modular, the ACIDLINE BL-1 bassline synth and the HALCYON VA-8 polysynth. Web Audio, Docker, Helm. GPLv3.

**Live:** https://devoarn.github.io/VOLTRACK/

## Run

```bash
docker compose up -d --build     # http://localhost:8080
npm ci && npm run dev            # development, http://localhost:5173
```

Web Audio needs a secure context: `localhost` or HTTPS.

## Test

```bash
npm run check                    # lint, format, typecheck, unit + DSP tests
npm run test:e2e                 # Playwright (PW_CHANNEL=chrome to use installed Chrome)
```

## CI/CD

| Trigger      | Jobs                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| Pull request | lint, tests, image build, Trivy scan, Playwright E2E, Helm deploy to kind    |
| `main`       | above, plus image push to `ghcr.io/devoarn/voltrack` and GitHub Pages deploy |
| Tag `vX.Y.Z` | GitHub Release with Helm chart, optional production deploy (manual approval) |

Release: `npm version minor && git push --follow-tags`.
Kubernetes deploys are off by default. To enable them, set the variable `K8S_DEPLOY_ENABLED=true` and the environment secret `KUBE_CONFIG`.

## Docs

- [Doc/SYNTHS.md](Doc/SYNTHS.md): the instruments
- [Doc/RUNBOOK.md](Doc/RUNBOOK.md): deploy, rollback, troubleshooting

## License

GPL-3.0-or-later, see [LICENSE](LICENSE).
