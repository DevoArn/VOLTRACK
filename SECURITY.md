# Security

Report privately via _Security → Report a vulnerability_. Images are published to GHCR with SBOM and provenance attestations: verify with `docker buildx imagetools inspect ghcr.io/devoarn/voltrack:<tag> --format "{{json .Provenance}}"`. CI scans every image with Trivy and the source with CodeQL.
