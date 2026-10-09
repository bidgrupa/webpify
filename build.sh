#!/usr/bin/env bash
# Build the Rust converter to WebAssembly and generate the JS glue into extension/pkg.
# Needs: rustup (the toolchain in rust-toolchain.toml installs itself)
#        cargo install wasm-bindgen-cli --version 0.2.129 --locked
#        zip
set -euo pipefail
cd "$(dirname "$0")"

# Reproducible output: Rust embeds source paths in panic messages, so map this checkout
# and the cargo registry to fixed names. Anyone building the same commit with the pinned
# toolchain (e.g. Mozilla's add-on reviewers) then gets a byte-identical .wasm.
# This env var replaces the rustflags in .cargo/config.toml, so simd128 is repeated here.
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS="-C target-feature=+simd128 --remap-path-prefix=$PWD=/webpify --remap-path-prefix=$cargo_home=/cargo"

cargo build --release --locked --target wasm32-unknown-unknown

# --target web: ES module glue, imported by the background script.
# --force-enable-abort-handler: lets the module rebuild itself after a panic
#   (see set_on_abort in src/wasm.rs); wasm32 panics abort by default.
wasm-bindgen \
  --target web \
  --no-typescript \
  --force-enable-abort-handler \
  --out-dir extension/pkg \
  target/wasm32-unknown-unknown/release/webpify.wasm

ls -lh extension/pkg/webpify_bg.wasm | awk '{print "wasm size: " $5}'

# Zip for loading as a temporary add-on in Firefox-based browsers. Flatpak builds (Firefox,
# Zen) pick files through the desktop portal, which shares only the picked file: loading
# manifest.json leaves the rest of the extension out of reach, a single zip works.
# Rewritten in place, so a Reload in about:debugging picks up the new build.
# (Store packages come from release.sh.)
mkdir -p dist
(cd extension && zip -q -r -FS ../dist/webpify.zip . -x '.*')
ls -lh dist/webpify.zip | awk '{print "dev zip: dist/webpify.zip (" $5 ")"}'
