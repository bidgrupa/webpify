//! Conversion error type. The WASM wrapper turns it into a JS `Error` message.

#[derive(Debug, thiserror::Error)]
pub enum ConvertError {
    #[error("Could not decode image: {0}")]
    Decode(#[from] image::ImageError),
    #[error("Could not read image: {0}")]
    Io(#[from] std::io::Error),
    #[error("Encoding failed: {0}")]
    Encode(String),
    #[error("Invalid parameters: {0}")]
    Invalid(String),
}

pub type ConvertResult<T> = Result<T, ConvertError>;
