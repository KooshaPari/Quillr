#![no_main]
use libfuzzer_sys::fuzz_target;
use httpora_core::{RateLimiter, RetryLayer, CircuitBreaker};
use std::time::Duration;

fuzz_target!(|data: &[u8]| {
    // Fuzz RateLimiter construction
    if data.len() >= 8 {
        let capacity = u64::from_be_bytes(data[..8].try_into().unwrap());
        let rate = f64::from_bits(u64::from_be_bytes(data[8..16].try_into().unwrap_or(u64::MAX)));
        let _ = RateLimiter::token_bucket(capacity, rate);
    }

    // Fuzz RetryLayer construction
    if data.len() >= 8 {
        let max_retries = u32::from_be_bytes(data[..4].try_into().unwrap());
        let delay_ms = u64::from_be_bytes(data[4..12].try_into().unwrap_or(1000));
        let _ = RetryLayer::new(max_retries, Duration::from_millis(delay_ms));
    }

    // Fuzz CircuitBreaker construction
    if data.len() >= 8 {
        let threshold = f64::from_bits(u64::from_be_bytes(data[..8].try_into().unwrap_or(0.5_f64.to_bits())));
        let timeout_secs = u64::from_be_bytes(data[8..16].try_into().unwrap_or(30));
        let _ = CircuitBreaker::new(threshold, Duration::from_secs(timeout_secs));
    }
});
