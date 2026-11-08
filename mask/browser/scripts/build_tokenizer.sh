#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.108 --locked --root "$PWD/.tools/wasm-bindgen"
cargo build --manifest-path tokenizer/Cargo.toml --target wasm32-unknown-unknown --release --locked
.tools/wasm-bindgen/bin/wasm-bindgen --target web --out-dir public/tokenizer tokenizer/target/wasm32-unknown-unknown/release/mask_tokenizer.wasm
