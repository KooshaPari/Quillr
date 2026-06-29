use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::HttptoraError;

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Normal operation; all requests pass through.
    Closed,
    /// Fast-fail state; requests raise `CircuitOpen` immediately.
    Open,
    /// Probe state; a limited number of requests are allowed to test service health.
    HalfOpen,
}

/// Configuration for the circuit breaker.
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Fraction of recent requests that must fail to trip the breaker (0.0–1.0).
    pub failure_threshold: f64,
    /// Seconds to wait in OPEN before transitioning to HALF_OPEN.
    pub reset_timeout: Duration,
    /// Minimum requests in the rolling window before the threshold is evaluated.
    pub min_requests: usize,
    /// Rolling window length for failure-rate calculation.
    pub window_size: usize,
    /// Probe requests allowed through in HALF_OPEN state.
    pub half_open_max_requests: usize,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 0.5,
            reset_timeout: Duration::from_secs(30),
            min_requests: 5,
            window_size: 10,
            half_open_max_requests: 1,
        }
    }
}

/// A thread-safe circuit breaker with three states: Closed, Open, Half-Open.
///
/// # Example
///
/// ```
/// use httpora_core::CircuitBreaker;
/// use std::time::Duration;
///
/// let cb = CircuitBreaker::new(0.5, Duration::from_secs(30));
/// assert_eq!(cb.state(), httpora_core::middleware::circuit_breaker::CircuitState::Closed);
/// ```
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    inner: Mutex<BreakerInner>,
}

struct BreakerInner {
    state: CircuitState,
    window: Vec<bool>, // true = success, false = failure
    opened_at: Option<Instant>,
    half_open_probe_count: usize,
}

impl CircuitBreaker {
    /// Create a circuit breaker with the default configuration overridden by
    /// the given failure threshold and reset timeout.
    pub fn new(failure_threshold: f64, reset_timeout: Duration) -> Self {
        Self {
            config: CircuitBreakerConfig {
                failure_threshold,
                reset_timeout,
                ..Default::default()
            },
            inner: Mutex::new(BreakerInner {
                state: CircuitState::Closed,
                window: Vec::new(),
                opened_at: None,
                half_open_probe_count: 0,
            }),
        }
    }

    /// Create a circuit breaker with a fully custom configuration.
    pub fn with_config(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            inner: Mutex::new(BreakerInner {
                state: CircuitState::Closed,
                window: Vec::new(),
                opened_at: None,
                half_open_probe_count: 0,
            }),
        }
    }

    /// Return the current circuit state.
    pub fn state(&self) -> CircuitState {
        self.inner.lock().unwrap().state
    }

    /// Call before each downstream request.
    ///
    /// Returns `Ok(())` if the request may proceed, or
    /// `Err(HttptoraError::CircuitOpen)` if the circuit is open.
    pub fn before_request(&self) -> Result<(), HttptoraError> {
        let mut inner = self.inner.lock().unwrap();

        if inner.state == CircuitState::Open {
            let elapsed = Instant::now().duration_since(inner.opened_at.unwrap_or(Instant::now()));
            if elapsed >= self.config.reset_timeout {
                #[cfg(feature = "tracing")]
                tracing::info!("circuit breaker transitioning from Open to HalfOpen");
                inner.state = CircuitState::HalfOpen;
                inner.half_open_probe_count = 0;
            } else {
                #[cfg(feature = "tracing")]
                tracing::warn!("circuit breaker is Open; request blocked");
                return Err(HttptoraError::CircuitOpen);
            }
        }

        if inner.state == CircuitState::HalfOpen {
            if inner.half_open_probe_count >= self.config.half_open_max_requests {
                #[cfg(feature = "tracing")]
                tracing::warn!(
                    half_open_probe_count = inner.half_open_probe_count,
                    "circuit breaker HalfOpen probe limit reached"
                );
                return Err(HttptoraError::CircuitOpen);
            }
            inner.half_open_probe_count += 1;
            #[cfg(feature = "tracing")]
            tracing::debug!(
                probe = inner.half_open_probe_count,
                "circuit breaker allowing HalfOpen probe"
            );
        }

        Ok(())
    }

    /// Record a successful request outcome.
    pub fn on_success(&self) {
        let mut inner = self.inner.lock().unwrap();

        if inner.state == CircuitState::HalfOpen {
            #[cfg(feature = "tracing")]
            tracing::info!("circuit breaker probe succeeded; closing circuit");
            // Probe succeeded — close the circuit.
            inner.state = CircuitState::Closed;
            inner.window.clear();
            return;
        }

        inner.window.push(true);
        if inner.window.len() > self.config.window_size {
            inner.window.remove(0);
        }
    }

    /// Record a failed request outcome.
    pub fn on_failure(&self) {
        let mut inner = self.inner.lock().unwrap();

        if inner.state == CircuitState::HalfOpen {
            #[cfg(feature = "tracing")]
            tracing::warn!("circuit breaker probe failed; reopening circuit");
            // Probe failed — reopen.
            inner.opened_at = Some(Instant::now());
            inner.state = CircuitState::Open;
            return;
        }

        inner.window.push(false);
        if inner.window.len() > self.config.window_size {
            inner.window.remove(0);
        }
        self.evaluate(&mut inner);
    }

    fn evaluate(&self, inner: &mut BreakerInner) {
        if inner.window.len() < self.config.min_requests {
            return;
        }
        let failures = inner.window.iter().filter(|&&s| !s).count();
        let rate = failures as f64 / inner.window.len() as f64;
        if rate >= self.config.failure_threshold {
            #[cfg(feature = "tracing")]
            tracing::warn!(
                failure_rate = rate,
                threshold = self.config.failure_threshold,
                "circuit breaker tripping Open"
            );
            inner.state = CircuitState::Open;
            inner.opened_at = Some(Instant::now());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn circuit_starts_closed() {
        let cb = CircuitBreaker::new(0.5, Duration::from_secs(30));
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.before_request().is_ok());
    }

    #[test]
    fn circuit_opens_on_failure_threshold() {
        // Low threshold to trip easily.
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 0.3,
            min_requests: 3,
            window_size: 10,
            ..Default::default()
        });

        // 3 successes
        cb.on_success();
        cb.on_success();
        cb.on_success();
        assert_eq!(cb.state(), CircuitState::Closed);

        // 2 failures — 2/5 = 0.4 >= 0.3 → trips
        cb.on_failure();
        cb.on_failure();
        assert_eq!(cb.state(), CircuitState::Open);
        assert!(cb.before_request().is_err());
    }

    #[test]
    fn half_open_probe_success_closes_circuit() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 0.0,
            reset_timeout: Duration::from_millis(0),
            min_requests: 1,
            ..Default::default()
        });
        cb.on_failure(); // trips immediately (threshold 0.0)
        assert_eq!(cb.state(), CircuitState::Open);

        // Since reset_timeout is 0ms, before_request transitions to half-open
        assert!(cb.before_request().is_ok());
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Probe succeeds → circuit closes
        cb.on_success();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn half_open_probe_failure_reopens() {
        let cb = CircuitBreaker::with_config(CircuitBreakerConfig {
            failure_threshold: 0.0,
            reset_timeout: Duration::from_millis(0),
            min_requests: 1,
            ..Default::default()
        });
        cb.on_failure(); // trips
        assert_eq!(cb.state(), CircuitState::Open);

        // Transitions to half-open
        assert!(cb.before_request().is_ok());
        assert_eq!(cb.state(), CircuitState::HalfOpen);

        // Probe fails → circuit reopens
        cb.on_failure();
        assert_eq!(cb.state(), CircuitState::Open);
    }
}
