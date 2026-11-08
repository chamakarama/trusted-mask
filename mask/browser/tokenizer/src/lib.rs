use serde_json::{json, Value};
use tokenizers::{Encoding, PaddingDirection, PaddingParams, PaddingStrategy, Tokenizer,
    TruncationDirection, TruncationParams, TruncationStrategy};
use wasm_bindgen::prelude::*;

fn error(e: impl std::fmt::Display) -> JsValue { JsValue::from_str(&e.to_string()) }
fn view(e: &Encoding) -> Value {
    json!({"input_ids": e.get_ids(), "attention_mask": e.get_attention_mask(),
        "token_type_ids": e.get_type_ids(), "offset_mapping": e.get_offsets()})
}

#[wasm_bindgen]
pub struct BrowserTokenizer { inner: Tokenizer, pad_id: u32, limit: usize, stride: usize }

#[wasm_bindgen]
impl BrowserTokenizer {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str, pad_id: u32, limit: usize, stride: usize) -> Result<Self, JsValue> {
        if limit < 8 || limit > 512 || stride >= limit - 2 { return Err(error("Invalid token window")); }
        tokenizers::utils::parallelism::set_parallelism(false);
        Ok(Self { inner: Tokenizer::from_bytes(source.as_bytes()).map_err(error)?, pad_id, limit, stride })
    }
    pub fn token_id(&self, token: &str) -> Option<u32> { self.inner.token_to_id(token) }
    pub fn encode(&mut self, text: &str, pair: Option<String>, windowed: bool) -> Result<String, JsValue> {
        if windowed && pair.is_some() { return Err(error("Paired inputs must not be truncated")); }
        self.inner.with_truncation(if windowed { Some(TruncationParams {
            max_length: self.limit, stride: self.stride, strategy: TruncationStrategy::LongestFirst,
            direction: TruncationDirection::Right,
        }) } else { None }).map_err(error)?;
        self.inner.with_padding(if windowed { Some(PaddingParams {
            strategy: PaddingStrategy::BatchLongest, direction: PaddingDirection::Right,
            pad_to_multiple_of: None, pad_id: self.pad_id, pad_type_id: 0, pad_token: "[PAD]".into(),
        }) } else { None });
        let enc = match pair.as_deref() {
            Some(p) => self.inner.encode_char_offsets((text, p), true),
            None => self.inner.encode_char_offsets(text, true),
        }.map_err(error)?;
        let windows: Vec<Value> = std::iter::once(&enc).chain(enc.get_overflowing().iter()).map(view).collect();
        Ok(json!({"windows": windows}).to_string())
    }
}
