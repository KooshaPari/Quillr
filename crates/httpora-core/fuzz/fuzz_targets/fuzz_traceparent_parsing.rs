//! Fuzz target for W3C TraceContext `traceparent` header parsing.
//!
//! Exercises `httpora_core::middleware::otel::parse_traceparent()` with
//! arbitrary byte sequences to uncover panics, infinite loops, or logic bugs
//! in the header field parser.

#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(s) = std::str::from_utf8(data) {
        // parse_traceparent is not pub-exported from the crate's top-level
        // lib.rs under default features — it lives behind #[cfg(feature = "tower")]
        // in otel.rs. We exercise it via an assertion-free call that must
        // never panic regardless of input.
        #[cfg(feature = "tower")]
        {
            let _ = httpora_core::middleware::otel::parse_traceparent(s);
        }
    }
});
