//! Fuzz target for the token-bucket rate limiter.
//!
//! Exercises `RateLimiter::check()` with arbitrary f64 token values to
//! uncover panics, overflows, or logic errors in the refill/consume logic.

#![no_main]

use libfuzzer_sys::fuzz_target;
use httpora_core::middleware::rate_limit::RateLimiter;

fuzz_target!(|data: &[u8]| {
    if data.len() < 8 {
        return;
    }

    // Interpret first 8 bytes as a f64 token amount.
    let buf: [u8; 8] = match data[..8].try_into() {
        Ok(b) => b,
        Err(_) => return,
    };
    let tokens = f64::from_le_bytes(buf);

    // Use a sane capacity to avoid OOM-equivalent issues in fuzzing.
    let limiter = RateLimiter::token_bucket(100, 10.0);

    // The call must never panic regardless of the token value.
    let _ = limiter.check(tokens);
    let _ = limiter.check(tokens);
});
