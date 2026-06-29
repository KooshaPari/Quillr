use httpora_core::error::HttptoraError;
use httpora_core::middleware::retry::RetryLayer;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

#[tokio::test]
async fn retry_succeeds_on_first_attempt() {
    let retry = RetryLayer::new(3, Duration::from_millis(10));
    let result = retry.execute(|| async { Ok::<_, String>(42) }).await;
    assert_eq!(result.unwrap(), 42);
}

#[tokio::test]
async fn retry_exhausted() {
    let retry = RetryLayer::new(2, Duration::from_millis(10));
    let counter = AtomicUsize::new(0);
    let result = retry
        .execute(|| async {
            counter.fetch_add(1, Ordering::SeqCst);
            Err::<(), String>("fail".into())
        })
        .await;
    assert!(result.is_err());
    assert_eq!(counter.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn retry_succeeds_after_one_failure() {
    let retry = RetryLayer::new(3, Duration::from_millis(10));
    let counter = AtomicUsize::new(0);
    let result = retry
        .execute(|| async {
            let prev = counter.fetch_add(1, Ordering::SeqCst);
            if prev < 1 {
                Err::<(), String>("fail".into())
            } else {
                Ok::<_, String>(())
            }
        })
        .await;
    assert!(result.is_ok());
    assert_eq!(counter.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn retry_error_contains_reason() {
    let retry = RetryLayer::new(1, Duration::from_millis(10));
    let result = retry
        .execute(|| async { Err::<(), String>("something broke".into()) })
        .await;
    match result {
        Err(HttptoraError::RetryExhausted { attempts, reason }) => {
            assert_eq!(attempts, 1);
            assert!(
                reason.contains("broke"),
                "reason should mention error: {reason}"
            );
        }
        other => panic!("expected RetryExhausted, got {other:?}"),
    }
}
