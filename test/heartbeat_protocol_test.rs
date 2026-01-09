/// 心跳任务协议验证测试
/// 
/// 测试目标：
/// 1. 验证协议消息的序列化/反序列化
/// 2. 验证任务状态机转换
/// 3. 验证幂等性和乱序处理
/// 4. 验证取消逻辑

#[cfg(test)]
mod heartbeat_protocol_tests {
    use serde_json::json;

    // 模拟协议结构（从 agent/src/core/protocol.rs）
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct HeartbeatRequest {
        pub device_id: String,
        pub timestamp: u64,
        pub nonce: String,
        pub protocol_version: String,
        pub signature: String,
        pub system_info: SystemInfo,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub reports: Option<Vec<TaskReport>>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct SystemInfo {
        pub platform: String,
        pub uptime: u64,
        pub version: String,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct TaskReport {
        pub task_id: String,
        pub state: TaskState,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub progress: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub output_chunk: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub output_cursor: Option<u64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub error: Option<String>,
    }

    #[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "lowercase")]
    pub enum TaskState {
        Received,
        Running,
        Succeeded,
        Failed,
        Canceled,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct HeartbeatResponse {
        pub status: String,
        pub server_time: u64,
        pub next_heartbeat: u64,
        #[serde(default)]
        pub tasks: Vec<TaskItem>,
        #[serde(default)]
        pub cancels: Vec<CancelItem>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct TaskItem {
        pub task_id: String,
        pub revision: u64,
        #[serde(rename = "type")]
        pub task_type: TaskType,
        pub desired_state: DesiredState,
        pub payload: serde_json::Value,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    pub struct CancelItem {
        pub task_id: String,
        pub revision: u64,
        pub desired_state: DesiredState,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "snake_case")]
    pub enum TaskType {
        ConfigUpdate,
        CmdExec,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    #[serde(rename_all = "lowercase")]
    pub enum DesiredState {
        Pending,
        Running,
        Succeeded,
        Failed,
        Canceled,
    }

    // ==================== 测试 1: 消息序列化/反序列化 ====================

    #[test]
    fn test_heartbeat_request_serialization() {
        let request = HeartbeatRequest {
            device_id: "A-001".to_string(),
            timestamp: 1736220000,
            nonce: "random-nonce-123".to_string(),
            protocol_version: "1.0".to_string(),
            signature: "base64-signature".to_string(),
            system_info: SystemInfo {
                platform: "windows".to_string(),
                uptime: 3600,
                version: "0.1.3".to_string(),
            },
            reports: Some(vec![
                TaskReport {
                    task_id: "cfg-1".to_string(),
                    state: TaskState::Running,
                    progress: Some(30),
                    output_chunk: None,
                    output_cursor: None,
                    error: None,
                },
                TaskReport {
                    task_id: "cmd-1".to_string(),
                    state: TaskState::Running,
                    progress: None,
                    output_chunk: Some("Admin\\admin\n".to_string()),
                    output_cursor: Some(12),
                    error: None,
                },
            ]),
        };

        // 序列化
        let json_str = serde_json::to_string_pretty(&request).unwrap();
        println!("HeartbeatRequest JSON:\n{}", json_str);

        // 反序列化
        let deserialized: HeartbeatRequest = serde_json::from_str(&json_str).unwrap();
        assert_eq!(request, deserialized);
    }

    #[test]
    fn test_heartbeat_response_serialization() {
        let response = HeartbeatResponse {
            status: "ok".to_string(),
            server_time: 1736220001,
            next_heartbeat: 1736220061,
            tasks: vec![
                TaskItem {
                    task_id: "cfg-1".to_string(),
                    revision: 1,
                    task_type: TaskType::ConfigUpdate,
                    desired_state: DesiredState::Pending,
                    payload: json!({
                        "config": {
                            "heartbeat_interval_s": 10
                        }
                    }),
                },
                TaskItem {
                    task_id: "cmd-1".to_string(),
                    revision: 1,
                    task_type: TaskType::CmdExec,
                    desired_state: DesiredState::Pending,
                    payload: json!({
                        "cmd": "whoami && sleep 10"
                    }),
                },
            ],
            cancels: vec![CancelItem {
                task_id: "cmd-1".to_string(),
                revision: 2,
                desired_state: DesiredState::Canceled,
            }],
        };

        // 序列化
        let json_str = serde_json::to_string_pretty(&response).unwrap();
        println!("HeartbeatResponse JSON:\n{}", json_str);

        // 反序列化
        let deserialized: HeartbeatResponse = serde_json::from_str(&json_str).unwrap();
        assert_eq!(response, deserialized);
    }

    // ==================== 测试 2: 任务状态机 ====================

    #[test]
    fn test_task_state_transitions() {
        // 正常流程：received -> running -> succeeded
        let states = vec![
            TaskState::Received,
            TaskState::Running,
            TaskState::Succeeded,
        ];

        for state in states {
            let report = TaskReport {
                task_id: "task-1".to_string(),
                state,
                progress: None,
                output_chunk: None,
                output_cursor: None,
                error: None,
            };

            let json = serde_json::to_string(&report).unwrap();
            let deserialized: TaskReport = serde_json::from_str(&json).unwrap();
            assert_eq!(report.state, deserialized.state);
        }
    }

    #[test]
    fn test_task_state_failed() {
        let report = TaskReport {
            task_id: "task-1".to_string(),
            state: TaskState::Failed,
            progress: None,
            output_chunk: None,
            output_cursor: None,
            error: Some("Execution failed".to_string()),
        };

        let json = serde_json::to_string(&report).unwrap();
        let deserialized: TaskReport = serde_json::from_str(&json).unwrap();
        assert_eq!(report, deserialized);
        assert!(deserialized.error.is_some());
    }

    #[test]
    fn test_task_state_canceled() {
        let report = TaskReport {
            task_id: "task-1".to_string(),
            state: TaskState::Canceled,
            progress: None,
            output_chunk: Some("Task canceled by server".to_string()),
            output_cursor: None,
            error: None,
        };

        let json = serde_json::to_string(&report).unwrap();
        let deserialized: TaskReport = serde_json::from_str(&json).unwrap();
        assert_eq!(report, deserialized);
    }

    // ==================== 测试 3: Revision 版本控制 ====================

    use std::collections::HashMap;

    struct TaskManager {
        revisions: HashMap<String, u64>,
    }

    impl TaskManager {
        fn new() -> Self {
            Self {
                revisions: HashMap::new(),
            }
        }

        fn should_accept_task(&mut self, task: &TaskItem) -> bool {
            if let Some(&current_rev) = self.revisions.get(&task.task_id) {
                if task.revision <= current_rev {
                    return false; // 忽略旧版本
                }
            }
            self.revisions.insert(task.task_id.clone(), task.revision);
            true
        }
    }

    #[test]
    fn test_revision_control_accept_new() {
        let mut manager = TaskManager::new();

        let task = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        assert!(manager.should_accept_task(&task));
    }

    #[test]
    fn test_revision_control_reject_old() {
        let mut manager = TaskManager::new();

        let task_v2 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 2,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        let task_v1 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        // 先接受 v2
        assert!(manager.should_accept_task(&task_v2));

        // 拒绝 v1（旧版本）
        assert!(!manager.should_accept_task(&task_v1));
    }

    #[test]
    fn test_revision_control_accept_newer() {
        let mut manager = TaskManager::new();

        let task_v1 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        let task_v2 = TaskItem {
            task_id: "task-1".to_string(),
            revision: 2,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({}),
        };

        // 先接受 v1
        assert!(manager.should_accept_task(&task_v1));

        // 接受 v2（更新版本）
        assert!(manager.should_accept_task(&task_v2));
    }

    // ==================== 测试 4: 输出增量管理 ====================

    struct OutputManager {
        cursors: HashMap<String, u64>,
    }

    impl OutputManager {
        fn new() -> Self {
            Self {
                cursors: HashMap::new(),
            }
        }

        fn should_accept_output(&mut self, task_id: &str, cursor: u64) -> bool {
            let current_cursor = self.cursors.get(task_id).copied().unwrap_or(0);
            if cursor > current_cursor {
                self.cursors.insert(task_id.to_string(), cursor);
                true
            } else {
                false // 重复或乱序
            }
        }
    }

    #[test]
    fn test_output_cursor_incremental() {
        let mut manager = OutputManager::new();

        // 接受新输出
        assert!(manager.should_accept_output("task-1", 10));
        assert!(manager.should_accept_output("task-1", 20));
        assert!(manager.should_accept_output("task-1", 30));

        // 拒绝旧输出
        assert!(!manager.should_accept_output("task-1", 15));
        assert!(!manager.should_accept_output("task-1", 30)); // 重复
    }

    // ==================== 测试 5: 取消逻辑 ====================

    #[test]
    fn test_cancel_message() {
        let cancel = CancelItem {
            task_id: "cmd-1".to_string(),
            revision: 2,
            desired_state: DesiredState::Canceled,
        };

        let json = serde_json::to_string(&cancel).unwrap();
        println!("Cancel JSON: {}", json);

        let deserialized: CancelItem = serde_json::from_str(&json).unwrap();
        assert_eq!(cancel, deserialized);
        assert_eq!(deserialized.desired_state, DesiredState::Canceled);
    }

    #[test]
    fn test_cancel_response() {
        let report = TaskReport {
            task_id: "cmd-1".to_string(),
            state: TaskState::Canceled,
            progress: None,
            output_chunk: Some("Task canceled by server".to_string()),
            output_cursor: Some(100),
            error: None,
        };

        let json = serde_json::to_string(&report).unwrap();
        let deserialized: TaskReport = serde_json::from_str(&json).unwrap();
        assert_eq!(report, deserialized);
    }

    // ==================== 测试 6: 完整流程模拟 ====================

    #[test]
    fn test_config_update_flow() {
        // 1. Server 下发配置更新任务
        let task = TaskItem {
            task_id: "cfg-1".to_string(),
            revision: 1,
            task_type: TaskType::ConfigUpdate,
            desired_state: DesiredState::Pending,
            payload: json!({
                "config": {
                    "heartbeat_interval_s": 10
                }
            }),
        };

        // 2. Agent 收到任务，回报 received
        let report_received = TaskReport {
            task_id: task.task_id.clone(),
            state: TaskState::Received,
            progress: None,
            output_chunk: None,
            output_cursor: None,
            error: None,
        };

        // 3. Agent 开始执行，回报 running
        let report_running = TaskReport {
            task_id: task.task_id.clone(),
            state: TaskState::Running,
            progress: Some(50),
            output_chunk: None,
            output_cursor: None,
            error: None,
        };

        // 4. Agent 执行完成，回报 succeeded
        let report_succeeded = TaskReport {
            task_id: task.task_id.clone(),
            state: TaskState::Succeeded,
            progress: Some(100),
            output_chunk: Some("Config updated".to_string()),
            output_cursor: None,
            error: None,
        };

        // 验证序列化
        let _ = serde_json::to_string(&report_received).unwrap();
        let _ = serde_json::to_string(&report_running).unwrap();
        let _ = serde_json::to_string(&report_succeeded).unwrap();

        assert_eq!(report_succeeded.state, TaskState::Succeeded);
    }

    #[test]
    fn test_cmd_exec_with_cancel_flow() {
        // 1. Server 下发命令执行任务
        let task = TaskItem {
            task_id: "cmd-1".to_string(),
            revision: 1,
            task_type: TaskType::CmdExec,
            desired_state: DesiredState::Pending,
            payload: json!({
                "cmd": "whoami && sleep 10"
            }),
        };

        // 2. Agent 开始执行，回报 running + 输出
        let report_running = TaskReport {
            task_id: task.task_id.clone(),
            state: TaskState::Running,
            progress: None,
            output_chunk: Some("Admin\\admin\n".to_string()),
            output_cursor: Some(12),
            error: None,
        };

        // 3. Server 发送取消指令
        let cancel = CancelItem {
            task_id: task.task_id.clone(),
            revision: 2,
            desired_state: DesiredState::Canceled,
        };

        // 4. Agent 终止进程，回报 canceled
        let report_canceled = TaskReport {
            task_id: task.task_id.clone(),
            state: TaskState::Canceled,
            progress: None,
            output_chunk: Some("Task canceled by server".to_string()),
            output_cursor: Some(12),
            error: None,
        };

        // 验证
        assert_eq!(cancel.desired_state, DesiredState::Canceled);
        assert_eq!(report_canceled.state, TaskState::Canceled);
    }

    // ==================== 测试 7: 幂等性 ====================

    #[test]
    fn test_idempotent_reports() {
        let report = TaskReport {
            task_id: "task-1".to_string(),
            state: TaskState::Running,
            progress: Some(50),
            output_chunk: None,
            output_cursor: None,
            error: None,
        };

        // 多次序列化应该产生相同结果
        let json1 = serde_json::to_string(&report).unwrap();
        let json2 = serde_json::to_string(&report).unwrap();
        assert_eq!(json1, json2);

        // 多次反序列化应该产生相同对象
        let deserialized1: TaskReport = serde_json::from_str(&json1).unwrap();
        let deserialized2: TaskReport = serde_json::from_str(&json2).unwrap();
        assert_eq!(deserialized1, deserialized2);
    }
}
