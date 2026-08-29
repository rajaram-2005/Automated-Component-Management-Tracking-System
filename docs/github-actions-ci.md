# GitHub Actions CI workflow

This project is set up for a CI pipeline that builds, tests, packages, and produces
a container image. The workflow is documented here because the commit that would
have shipped it as a live `.github/workflows/ci.yml` was **removed from this
branch** — the GitHub App token used to push this branch does not have the
`workflows` permission required to create/update workflow files.

## How to re-enable

1. Recreate the file at `.github/workflows/ci.yml` with the contents below.
2. Push it with a token or account that has the **Workflows** permission
   (repo Settings → Actions → General → Workflow permissions, or use a personal
   access token with `workflows: write`).

The workflow triggers on pushes/PRs to `master` / `main`.

## `ci.yml`

```yaml
name: CI

on:
  push:
    branches: [ master, main ]
  pull_request:
    branches: [ master, main ]

jobs:
  build:
    name: Build, test & package
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
          cache: maven

      - name: Verify with Maven
        run: mvn -B -q verify

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: surefire-reports
          path: target/surefire-reports
          if-no-files-found: ignore

      - name: Build Docker image
        if: github.ref == 'refs/heads/master' || github.ref == 'refs/heads/main'
        run: docker build -t compound-management-system:latest .
```

> `mvn verify` runs the unit tests plus the Spring context boot test against an
> isolated in-memory H2, so the pipeline needs no external database.
