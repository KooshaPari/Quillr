//! Fuzz target for CORS configuration origin matching.
//!
//! Exercises `CorsConfig::origin_allowed()` with arbitrary origin strings
//! to uncover panics, logic errors, or incorrect allow/deny decisions.

#![no_main]

use libfuzzer_sys::fuzz_target;
use httpora_core::middleware::cors::CorsConfig;

fuzz_target!(|data: &[u8]| {
    if let Ok(origin) = std::str::from_utf8(data) {
        // Test against a permissive config (wildcard allow).
        let permissive = CorsConfig::permissive();
        let _ = permissive.origin_allowed(origin);

        // Test against a restrictive config with specific origins.
        let mut restrictive = CorsConfig::permissive();
        restrictive.allowed_origins = vec!["https://example.com".into()];
        let _ = restrictive.origin_allowed(origin);

        // Test against an empty allow-list.
        restrictive.allowed_origins.clear();
        let _ = restrictive.origin_allowed(origin);

        // Test against multiple specific origins.
        restrictive.allowed_origins = vec![
            "https://foo.example.com".into(),
            "https://bar.example.com".into(),
            "http://localhost:3000".into(),
        ];
        let _ = restrictive.origin_allowed(origin);

        // Test with credentials flag toggled (affects wildcard behaviour).
        let with_creds = CorsConfig {
            allow_credentials: true,
            allowed_origins: vec!["*".into()],
            ..CorsConfig::permissive()
        };
        let _ = with_creds.origin_allowed(origin);
    }
});
