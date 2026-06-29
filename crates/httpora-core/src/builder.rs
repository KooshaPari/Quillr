use std::collections::HashMap;

use crate::error::HttptoraError;

/// Lightweight HTTP response representation.
#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
    pub headers: HashMap<String, String>,
}

impl HttpResponse {
    pub fn ok(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// Lightweight HTTP request representation.
#[derive(Debug, Clone)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub body: Vec<u8>,
    pub headers: HashMap<String, String>,
    pub query: HashMap<String, String>,
}

/// Fluent builder for constructing HTTP responses.
///
/// # Example
///
/// ```
/// use httpora_core::builder::ResponseBuilder;
///
/// let resp = ResponseBuilder::json(200, &serde_json::json!({"ok": true})).unwrap();
/// assert_eq!(resp.status, 200);
/// ```
pub struct ResponseBuilder;

impl ResponseBuilder {
    /// Build a JSON response with Content-Type set.
    #[cfg(feature = "serde_json")]
    pub fn json(status: u16, payload: &serde_json::Value) -> Result<HttpResponse, HttptoraError> {
        let body = serde_json::to_vec(payload).map_err(|e| HttptoraError::ParseError {
            detail: e.to_string(),
        })?;
        let mut headers = HashMap::new();
        headers.insert("Content-Type".into(), "application/json".into());
        Ok(HttpResponse {
            status,
            body,
            headers,
        })
    }

    /// Build a plain-text response.
    pub fn text(status: u16, message: &str) -> HttpResponse {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".into(), "text/plain; charset=utf-8".into());
        HttpResponse {
            status,
            body: message.as_bytes().to_vec(),
            headers,
        }
    }

    /// Build a 204 No Content response.
    pub fn no_content() -> HttpResponse {
        HttpResponse {
            status: 204,
            body: Vec::new(),
            headers: HashMap::new(),
        }
    }

    /// Build an HTTP 429 rate-limit response.
    #[cfg(feature = "serde_json")]
    pub fn rate_limited(retry_after_secs: u64) -> Result<HttpResponse, HttptoraError> {
        use serde_json::json;
        let mut resp = Self::json(429, &json!({"error": "rate_limited"}))?;
        resp.headers
            .insert("Retry-After".into(), retry_after_secs.to_string());
        Ok(resp)
    }
}

/// Helpers for extracting typed data from [`HttpRequest`] objects.
pub struct RequestExtractor;

impl RequestExtractor {
    /// Parse the request body as JSON.
    #[cfg(feature = "serde_json")]
    pub fn json_body(request: &HttpRequest) -> Result<serde_json::Value, HttptoraError> {
        serde_json::from_slice(&request.body).map_err(|e| HttptoraError::ParseError {
            detail: e.to_string(),
        })
    }

    /// Extract the Bearer token from the Authorization header, or `None`.
    ///
    /// Returns `None` if the header is missing, does not use `Bearer` scheme, or
    /// if the token value is empty or contains invalid characters.
    pub fn bearer_token(request: &HttpRequest) -> Option<String> {
        let auth = request
            .headers
            .get("Authorization")
            .or_else(|| request.headers.get("authorization"))?;
        let token = auth.strip_prefix("Bearer ")?;
        let token = token.trim();
        // Validate: must not be empty and must contain only token-printable characters
        if token.is_empty()
            || !token.chars().all(|c| {
                c.is_alphanumeric()
                    || c == '-'
                    || c == '_'
                    || c == '.'
                    || c == '~'
                    || c == '+'
                    || c == '/'
            })
        {
            return None;
        }
        Some(token.to_owned())
    }

    /// Case-insensitive header lookup.
    pub fn header<'a>(request: &'a HttpRequest, name: &str) -> Option<&'a str> {
        let lower = name.to_ascii_lowercase();
        request
            .headers
            .iter()
            .find(|(k, _)| k.to_ascii_lowercase() == lower)
            .map(|(_, v)| v.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(auth_header: Option<&str>) -> HttpRequest {
        let mut headers = HashMap::new();
        if let Some(val) = auth_header {
            headers.insert("Authorization".into(), val.into());
        }
        HttpRequest {
            method: "GET".into(),
            path: "/".into(),
            body: Vec::new(),
            headers,
            query: HashMap::new(),
        }
    }

    #[test]
    fn bearer_token_extracts_valid_jwt() {
        let req = make_request(Some("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.xXx"));
        assert_eq!(
            RequestExtractor::bearer_token(&req),
            Some("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.xXx".into())
        );
    }

    #[test]
    fn bearer_token_returns_none_when_missing() {
        let req = make_request(None);
        assert_eq!(RequestExtractor::bearer_token(&req), None);
    }

    #[test]
    fn bearer_token_returns_none_for_wrong_scheme() {
        let req = make_request(Some("Basic dXNlcjpwYXNz"));
        assert_eq!(RequestExtractor::bearer_token(&req), None);
    }

    #[test]
    fn bearer_token_returns_none_for_empty_token() {
        let req = make_request(Some("Bearer "));
        assert_eq!(RequestExtractor::bearer_token(&req), None);
    }

    #[test]
    fn bearer_token_returns_none_for_token_with_invalid_chars() {
        // Tokens with whitespace/newlines should be rejected
        let req = make_request(Some("Bearer token\nwith\nnewlines"));
        assert_eq!(RequestExtractor::bearer_token(&req), None);
    }

    #[test]
    fn bearer_token_case_insensitive_header() {
        let mut headers = HashMap::new();
        headers.insert("authorization".into(), "Bearer case-test-token".into());
        let req = HttpRequest {
            method: "GET".into(),
            path: "/".into(),
            body: Vec::new(),
            headers,
            query: HashMap::new(),
        };
        assert_eq!(
            RequestExtractor::bearer_token(&req),
            Some("case-test-token".into())
        );
    }

    #[test]
    fn bearer_token_trims_whitespace() {
        let req = make_request(Some("Bearer   spaced-token   "));
        assert_eq!(
            RequestExtractor::bearer_token(&req),
            Some("spaced-token".into())
        );
    }

    #[test]
    fn header_case_insensitive_lookup() {
        let mut headers = HashMap::new();
        headers.insert("Content-Type".into(), "application/json".into());
        let req = HttpRequest {
            method: "GET".into(),
            path: "/".into(),
            body: Vec::new(),
            headers,
            query: HashMap::new(),
        };
        assert_eq!(
            RequestExtractor::header(&req, "content-type"),
            Some("application/json")
        );
        assert_eq!(
            RequestExtractor::header(&req, "CONTENT-TYPE"),
            Some("application/json")
        );
    }
}
