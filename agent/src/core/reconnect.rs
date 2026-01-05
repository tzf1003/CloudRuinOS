use anyhow::{anyhow, Result};
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, info, warn};

/// 重连策略
#[derive(Debug, Clone)]
pub struct ReconnectStrategy {
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub backoff_factor: f64,
    pub max_attempts: Option<u32>,
    pub jitter: bool,
}

/// 重连管理器
#[derive(Debug)]
pub struct ReconnectManager {
    strategy: ReconnectStrategy,
    current_attempt: u32,
    current_delay: Duration,
    last_attempt: Option<Instant>,
}

/// 重连结果
#[derive(Debug)]
pub enum ReconnectResult {
    Success,
    Failed(String),
    MaxAttemptsReached,
}

impl ReconnectStrategy {
    /// 创建指数退避策略
    pub fn exponential_backoff() -> Self {
        Self {
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            backoff_factor: 2.0,
            max_attempts: Some(10),
            jitter: true,
        }
    }

    /// 创建固定间隔策略
    pub fn fixed_interval(interval: Duration) -> Self {
        Self {
            initial_delay: interval,
            max_delay: interval,
            backoff_factor: 1.0,
            max_attempts: None,
            jitter: false,
        }
    }

    /// 创建线性退避策略
    pub fn linear_backoff() -> Self {
        Self {
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            backoff_factor: 1.0,
            max_attempts: Some(20),
            jitter: true,
        }
    }

    /// 创建自定义策略
    pub fn custom(
        initial_delay: Duration,
        max_delay: Duration,
        backoff_factor: f64,
        max_attempts: Option<u32>,
        jitter: bool,
    ) -> Self {
        Self {
            initial_delay,
            max_delay,
            backoff_factor,
            max_attempts,
            jitter,
        }
    }
}

impl ReconnectManager {
    /// 创建新的重连管理器
    pub fn new(strategy: ReconnectStrategy) -> Self {
        Self {
            current_delay: strategy.initial_delay,
            strategy,
            current_attempt: 0,
            last_attempt: None,
        }
    }

    /// 重置重连状态
    pub fn reset(&mut self) {
        self.current_attempt = 0;
        self.current_delay = self.strategy.initial_delay;
        self.last_attempt = None;
        debug!("Reconnect manager reset");
    }

    /// 检查是否应该尝试重连
    pub fn should_reconnect(&self) -> bool {
        if let Some(max_attempts) = self.strategy.max_attempts {
            if self.current_attempt >= max_attempts {
                return false;
            }
        }
        true
    }

    /// 获取下次重连延迟
    pub fn next_delay(&self) -> Duration {
        let mut delay = self.current_delay;

        // 添加抖动以避免雷群效应
        if self.strategy.jitter {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let jitter_factor = rng.gen_range(0.5..1.5);
            delay = Duration::from_millis((delay.as_millis() as f64 * jitter_factor) as u64);
        }

        delay.min(self.strategy.max_delay)
    }

    /// 等待重连延迟
    pub async fn wait_for_reconnect(&mut self) -> Result<()> {
        if !self.should_reconnect() {
            return Err(anyhow!("Maximum reconnect attempts reached"));
        }

        let delay = self.next_delay();
        info!(
            "Waiting {:?} before reconnect attempt {} (max: {:?})",
            delay,
            self.current_attempt + 1,
            self.strategy.max_attempts
        );

        sleep(delay).await;

        self.current_attempt += 1;
        self.last_attempt = Some(Instant::now());

        // 更新下次延迟
        self.update_delay();

        Ok(())
    }

    /// 更新延迟时间
    fn update_delay(&mut self) {
        match self.strategy.backoff_factor {
            factor if factor > 1.0 => {
                // 指数退避
                let new_delay_ms = (self.current_delay.as_millis() as f64 * factor) as u64;
                self.current_delay =
                    Duration::from_millis(new_delay_ms).min(self.strategy.max_delay);
            }
            1.0 => {
                // 线性退避或固定间隔
                if self.strategy.initial_delay != self.strategy.max_delay {
                    // 线性退避
                    let increment = self.strategy.initial_delay;
                    self.current_delay =
                        (self.current_delay + increment).min(self.strategy.max_delay);
                }
                // 固定间隔不需要更新
            }
            _ => {
                // 无效的退避因子，保持当前延迟
                warn!("Invalid backoff factor: {}", self.strategy.backoff_factor);
            }
        }
    }

    /// 记录成功连接
    pub fn record_success(&mut self) {
        info!(
            "Connection successful after {} attempts",
            self.current_attempt
        );
        self.reset();
    }

    /// 记录连接失败
    pub fn record_failure(&mut self, error: &str) {
        warn!(
            "Connection attempt {} failed: {}",
            self.current_attempt + 1,
            error
        );
    }

    /// 获取当前尝试次数
    pub fn current_attempt(&self) -> u32 {
        self.current_attempt
    }

    /// 获取最大尝试次数
    pub fn max_attempts(&self) -> Option<u32> {
        self.strategy.max_attempts
    }

    /// 获取上次尝试时间
    pub fn last_attempt_time(&self) -> Option<Instant> {
        self.last_attempt
    }

    /// 获取当前延迟
    pub fn current_delay(&self) -> Duration {
        self.current_delay
    }

    /// 执行重连逻辑
    pub async fn reconnect_with_retry<F, Fut>(&mut self, mut connect_fn: F) -> ReconnectResult
    where
        F: FnMut() -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        while self.should_reconnect() {
            // 等待重连延迟
            if self.wait_for_reconnect().await.is_err() {
                return ReconnectResult::MaxAttemptsReached;
            }

            // 尝试连接
            match connect_fn().await {
                Ok(_) => {
                    self.record_success();
                    return ReconnectResult::Success;
                }
                Err(_e) => {
                    let error_msg = _e.to_string();
                    self.record_failure(&error_msg);

                    // 如果达到最大尝试次数，返回失败
                    if !self.should_reconnect() {
                        return ReconnectResult::MaxAttemptsReached;
                    }
                }
            }
        }

        ReconnectResult::MaxAttemptsReached
    }
}

impl Default for ReconnectStrategy {
    fn default() -> Self {
        Self::exponential_backoff()
    }
}

impl Default for ReconnectManager {
    fn default() -> Self {
        Self::new(ReconnectStrategy::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::time::{timeout, Instant};

    #[tokio::test]
    async fn test_exponential_backoff() {
        let strategy = ReconnectStrategy::exponential_backoff();
        let mut manager = ReconnectManager::new(strategy);

        // 第一次延迟应该是初始延迟
        let first_delay = manager.next_delay();
        assert!(first_delay >= Duration::from_millis(500)); // 考虑抖动
        assert!(first_delay <= Duration::from_millis(1500));

        // 模拟失败并更新延迟
        manager.wait_for_reconnect().await.unwrap();
        let second_delay = manager.next_delay();

        // 第二次延迟应该更长（指数增长）
        assert!(second_delay > first_delay || second_delay >= Duration::from_secs(1));
    }

    #[tokio::test]
    async fn test_fixed_interval() {
        let interval = Duration::from_millis(100);
        let strategy = ReconnectStrategy::fixed_interval(interval);
        let mut manager = ReconnectManager::new(strategy);

        // 所有延迟应该相同
        let first_delay = manager.next_delay();
        manager.wait_for_reconnect().await.unwrap();
        let second_delay = manager.next_delay();

        assert_eq!(first_delay, interval);
        assert_eq!(second_delay, interval);
    }

    #[tokio::test]
    async fn test_max_attempts() {
        let strategy = ReconnectStrategy::custom(
            Duration::from_millis(10),
            Duration::from_millis(50),
            2.0,
            Some(3), // 最多 3 次尝试
            false,
        );
        let mut manager = ReconnectManager::new(strategy);

        // 前 3 次应该允许重连
        assert!(manager.should_reconnect());
        manager.wait_for_reconnect().await.unwrap();

        assert!(manager.should_reconnect());
        manager.wait_for_reconnect().await.unwrap();

        assert!(manager.should_reconnect());
        manager.wait_for_reconnect().await.unwrap();

        // 第 4 次应该被拒绝
        assert!(!manager.should_reconnect());
    }

    #[tokio::test]
    async fn test_reconnect_with_retry_success() {
        let strategy = ReconnectStrategy::custom(
            Duration::from_millis(10),
            Duration::from_millis(50),
            1.5,
            Some(5),
            false,
        );
        let mut manager = ReconnectManager::new(strategy);

        let attempt_count = Arc::new(AtomicUsize::new(0));
        let attempt_count_clone = attempt_count.clone();

        let connect_fn = move || {
            let count = attempt_count_clone.fetch_add(1, Ordering::SeqCst);
            async move {
                if count < 2 {
                    // 前两次失败
                    Err(anyhow!("Connection failed"))
                } else {
                    // 第三次成功
                    Ok(())
                }
            }
        };

        let result = manager.reconnect_with_retry(connect_fn).await;

        match result {
            ReconnectResult::Success => {
                assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
                assert_eq!(manager.current_attempt(), 0); // 应该被重置
            }
            _ => panic!("Expected success"),
        }
    }

    #[tokio::test]
    async fn test_reconnect_with_retry_max_attempts() {
        let strategy = ReconnectStrategy::custom(
            Duration::from_millis(10),
            Duration::from_millis(50),
            1.5,
            Some(2), // 只允许 2 次尝试
            false,
        );
        let mut manager = ReconnectManager::new(strategy);

        let connect_fn = || async {
            // 总是失败
            Err(anyhow!("Connection always fails"))
        };

        let result = manager.reconnect_with_retry(connect_fn).await;

        match result {
            ReconnectResult::MaxAttemptsReached => {
                assert_eq!(manager.current_attempt(), 2);
            }
            _ => panic!("Expected max attempts reached"),
        }
    }

    #[tokio::test]
    async fn test_reset() {
        let strategy = ReconnectStrategy::exponential_backoff();
        let mut manager = ReconnectManager::new(strategy);

        // 进行一些尝试
        manager.wait_for_reconnect().await.unwrap();
        manager.wait_for_reconnect().await.unwrap();

        assert_eq!(manager.current_attempt(), 2);
        assert!(manager.current_delay() > Duration::from_secs(1));

        // 重置
        manager.reset();

        assert_eq!(manager.current_attempt(), 0);
        assert_eq!(manager.current_delay(), Duration::from_secs(1));
    }
}
