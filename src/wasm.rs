//! JavaScript bindings (wasm32 only).

use wasm_bindgen::prelude::*;

use crate::Options;

/// Runs once when the module is instantiated.
#[wasm_bindgen(start)]
fn start() {
    // Print Rust panic messages to the console instead of a bare "unreachable".
    console_error_panic_hook::set_once();
    // A panic aborts the WASM instance. Ask wasm-bindgen to build a fresh one on
    // the next call instead of throwing "Module terminated" forever.
    wasm_bindgen::handler::set_on_abort(wasm_bindgen::handler::schedule_reinit);
}

/// No-op. Call it before `convertToWebp`: if a previous call panicked, the
/// generated glue rebuilds the instance here. `convertToWebp` copies its input
/// into WASM memory *before* that check, so it can't safely be the first call
/// after a panic.
#[wasm_bindgen(js_name = ensureReady)]
pub fn ensure_ready() {}

/// Convert an encoded JPEG/PNG/BMP to WebP. `max_dimension` 0 keeps the size.
/// Throws an `Error` with a readable message on failure.
#[wasm_bindgen(js_name = convertToWebp)]
pub fn convert_to_webp(
    bytes: &[u8],
    quality: f32,
    max_dimension: u32,
    lossless: bool,
) -> Result<Vec<u8>, JsError> {
    let opts = Options {
        quality,
        max_dimension: (max_dimension > 0).then_some(max_dimension),
        lossless,
    };
    crate::convert(bytes, &opts).map_err(|e| JsError::new(&e.to_string()))
}

/// Test hook: panics on purpose so `tests/wasm-smoke.mjs` can check that the
/// module recovers (see `start`).
#[wasm_bindgen(js_name = debugPanic)]
pub fn debug_panic() {
    panic!("debugPanic called");
}
