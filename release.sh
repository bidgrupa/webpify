#!/usr/bin/env bash
# Build, test and package a release. Outputs land in dist/; see RELEASING.md for uploading.
set -euo pipefail
cd "$(dirname "$0")"

./build.sh
cargo test --locked --quiet
node scripts/package.mjs
