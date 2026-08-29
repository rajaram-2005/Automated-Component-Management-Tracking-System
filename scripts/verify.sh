#!/usr/bin/env bash
#
# verify.sh — local build & test verification for the Compound Management System.
#
# This is the primary way to confirm the project compiles and all tests pass
# before merging. It is fully self-contained: it stops with clear guidance if
# the required toolchain (JDK 17+, Maven 3.9+) is missing, and it uses the
# Maven Wrapper (./mvnw) if one is present.
#
# Usage:
#   ./scripts/verify.sh          # run from anywhere; resolves repo root
#   VERIFY_SKIP_CLEAN=1 ./scripts/verify.sh   # skip the destructive `clean`
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Compound Management System — build & test verification"
echo "    Workdir: $REPO_ROOT"

# --- JDK check ------------------------------------------------------------
if ! command -v java >/dev/null 2>&1; then
    echo ""
    echo "ERROR: 'java' was not found on PATH. Install JDK 17+."
    echo ""
    echo "  Debian/Ubuntu:   sudo apt install openjdk-17-jdk"
    echo "  macOS (brew):    brew install openjdk@17"
    echo "  Any platform:    https://sdkman.io   (sdk install java 17.0.x-tem)"
    echo "  Adoptium:        https://adoptium.net   (download Temurin 17)"
    echo ""
    exit 1
fi
echo "    Java:  $(java -version 2>&1 | head -n 1)"

# --- Maven resolution -----------------------------------------------------
MAVEN_CMD="mvn"
if [ -x "$REPO_ROOT/mvnw" ]; then
    MAVEN_CMD="./mvnw"
    echo "    Maven: $MAVEN_CMD (Maven Wrapper detected)"
elif ! command -v mvn >/dev/null 2>&1; then
    echo ""
    echo "ERROR: Maven was not found and no './mvnw' Maven Wrapper is present."
    echo ""
    echo "  Install Maven 3.9+  ->  https://maven.apache.org/install.html"
    echo "  Debian/Ubuntu:   sudo apt install maven"
    echo "  macOS (brew):    brew install maven"
    echo ""
    echo "  OR add the Maven Wrapper so this script finds './mvnw':"
    echo "      mvn -q -N wrapper:wrapper -Dmaven=3.9.9"
    echo "      git add mvnw mvnw.cmd .mvn && git commit -m 'Add Maven Wrapper'"
    echo ""
    exit 1
fi

# --- Run the build ---------------------------------------------------------
CMD_ARGS=()
if [ "${VERIFY_SKIP_CLEAN:-0}" != "1" ]; then
    CMD_ARGS+=(-B clean)
fi
CMD_ARGS+=(verify)

echo "    Maven: $MAVEN_CMD"
echo "==> Running: $MAVEN_CMD ${CMD_ARGS[*]}"
echo ""
"$MAVEN_CMD" "${CMD_ARGS[@]}"

echo ""
echo "==> Verification passed: compile + tests succeeded."
