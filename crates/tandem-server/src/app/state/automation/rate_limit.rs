use crate::util::time::now_ms;
use std::collections::HashMap;

#[derive(Debug, Default, Clone)]
pub struct ProviderRateLimitStatus {
    pub active_requests: usize,
    pub is_throttled: bool,
    pub throttled_until_ms: Option<u64>,
}

#[derive(Debug, Default)]
pub struct RateLimitManager {
    providers: HashMap<String, ProviderRateLimitStatus>,
}

impl RateLimitManager {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }

    pub fn record_throttle(&mut self, provider: &str, retry_after_ms: u64) {
        let status = self.providers.entry(provider.to_string()).or_default();
        status.is_throttled = true;
        status.throttled_until_ms = Some(now_ms() + retry_after_ms);
    }

    pub fn is_provider_throttled(&self, provider: &str) -> bool {
        if let Some(status) = self.providers.get(provider) {
            if status.is_throttled {
                if let Some(until) = status.throttled_until_ms {
                    return now_ms() < until;
                }
                return true;
            }
        }
        false
    }

    pub fn clear_throttle(&mut self, provider: &str) {
        if let Some(status) = self.providers.get_mut(provider) {
            status.is_throttled = false;
            status.throttled_until_ms = None;
        }
    }
}
