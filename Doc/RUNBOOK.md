# Runbook

Operational reference for VOLTRACK: a static web app (HTML/JS/AudioWorklets) served by unprivileged nginx.

## Endpoints

| Path            | Purpose                                                   | Caching                 |
| --------------- | --------------------------------------------------------- | ----------------------- |
| `/healthz`      | Liveness/readiness probe (`200 ok`)                       | none (not logged)       |
| `/version.json` | Build metadata: `version`, `commit`, `builtAt`            | `no-store`              |
| `/assets/*`     | Content-hashed bundles                                    | `immutable`, 1 year     |
| `/worklets/*`   | AudioWorklet DSP (not hashed)                             | `no-cache` (revalidate) |
| `/*`            | Pages (`/acid` and `/acid.html` both work); unknown → 404 | `no-cache`              |

## Verify what is deployed

```bash
curl -s https://<host>/version.json          # commit must match the git SHA you expect
curl -sI https://<host>/ | grep -i content-security-policy
```

Every pipeline deploy does this automatically, and fails if the live commit isn't the commit being deployed.

## Deployments

| Target              | Trigger                       | How                                                                                     |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| GHCR image          | push to `main`, tags `v*.*.*` | multi-arch build, SBOM + provenance, tags `main`, `sha-…`, semver, `latest`             |
| GitHub Pages (demo) | push to `main`                | static build with the Pages base path, then `/version.json` verification                |
| K8s staging         | push to `main` (opt-in)       | `helm upgrade --atomic` with the image **digest**, then `helm test` and a version check |
| K8s production      | tag `v*.*.*` (opt-in)         | same as staging, gated by environment approval                                          |

### Cutting a release

```bash
npm version minor          # bumps package.json and creates tag vX.Y.0
git push --follow-tags     # CI publishes the image, creates the GitHub Release (+ Helm chart), deploys to production after approval
```

CI refuses a tag that doesn't match `package.json`.

## Rollback

**Kubernetes.** Deploys are `--atomic`, so a failed rollout rolls back automatically. To roll back a good-but-unwanted release:

```bash
helm -n voltrack history voltrack
helm -n voltrack rollback voltrack <REVISION> --wait
curl -s localhost:8080/version.json   # after: kubectl -n voltrack port-forward svc/voltrack 8080:80
```

Or re-run the `deploy-production` job of an earlier successful pipeline run. It deploys that run's immutable digest.

**GitHub Pages.** Re-run the `pages` job of the last good run, or `git revert` the bad commit and push.

**Image.** Images are immutable by digest. Pin a known-good one with `--set image.digest=sha256:…`.

## Troubleshooting

| Symptom                                                                | Cause / fix                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "AudioWorklet is unavailable" / POWER ON does nothing                  | Page isn't a **secure context**. Serve over HTTPS (Ingress TLS) or use `localhost` (`kubectl port-forward`). Chrome also logs that `Cross-Origin-Opener-Policy` was ignored.                         |
| Pod `CrashLoopBackOff`, nginx can't write a pid/temp file              | `/tmp` must be writable: the chart mounts an `emptyDir`. Keep it if you change `readOnlyRootFilesystem`.                                                                                             |
| Console shows `Refused to load … Content Security Policy`              | A new external resource was added. Update `deployments/nginx/security-headers.conf`. The E2E suite fails on any console error, so this is caught in CI.                                              |
| Security headers missing on some responses                             | nginx doesn't inherit `add_header` into a `location` that sets its own. Every location must `include /etc/nginx/snippets/security-headers.conf`.                                                     |
| Users see stale DSP after deploy                                       | Worklets are `no-cache` (revalidated), assets are content-hashed. Check `/version.json` for the commit, then hard-refresh.                                                                           |
| `npm ci` fails in CI/Docker with "lock file out of sync" (`@emnapi/*`) | The lockfile was regenerated on Windows and lost Linux-only optional deps (an npm bug). Regenerate on Linux: `docker run --rm -v "$PWD:/app" -w /app node:24-alpine npm install --package-lock-only` |
| Trivy gate fails                                                       | A fixable CRITICAL CVE in the base image. Merge the Dependabot docker PR (or bump `NGINX_VERSION`) and re-run.                                                                                       |
| `helm upgrade` times out                                               | `kubectl -n <ns> describe pods` / `get events`. Usual suspects: image pull (GHCR package private → add `imagePullSecrets` or make it public), probes, resource limits.                               |

## Logs

nginx writes one JSON object per request to stdout, ready for Loki/CloudWatch/ELK:

```bash
kubectl -n voltrack logs -l app.kubernetes.io/name=voltrack --tail=100 | jq -c 'select(.status >= 400)'
docker logs voltrack | jq -r '[.time, .status, .uri] | @tsv'
```
