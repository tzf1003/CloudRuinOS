// server/src/terminal/handlers.rs
// HTTP API 处理器

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use super::models::*;
use super::service::TerminalService;

/// 创建会话
pub async fn create_session_handler(
    State(service): State<Arc<TerminalService>>,
    Json(req): Json<SessionCreateRequest>,
) -> impl IntoResponse {
    match service.create_session("user-123", req).await {
        Ok(session_id) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "session_id": session_id })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

/// 发送输入
pub async fn send_input_handler(
    State(service): State<Arc<TerminalService>>,
    Json(req): Json<SessionInputRequest>,
) -> impl IntoResponse {
    match service.send_input(req).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

/// 调整窗口
pub async fn resize_session_handler(
    State(service): State<Arc<TerminalService>>,
    Json(req): Json<SessionResizeRequest>,
) -> impl IntoResponse {
    match service.resize_session(req).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

/// 关闭会话
pub async fn close_session_handler(
    State(service): State<Arc<TerminalService>>,
    Path(session_id): Path<String>,
    Query(params): Query<CloseParams>,
) -> impl IntoResponse {
    match service.close_session(&session_id, params.force.unwrap_or(false)).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

#[derive(Deserialize)]
pub struct CloseParams {
    force: Option<bool>,
}

/// 获取输出
pub async fn get_output_handler(
    State(service): State<Arc<TerminalService>>,
    Path(session_id): Path<String>,
    Query(params): Query<OutputParams>,
) -> impl IntoResponse {
    match service.get_output(&session_id, params.from_cursor.unwrap_or(0)).await {
        Ok(output) => (StatusCode::OK, Json(output)),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

#[derive(Deserialize)]
pub struct OutputParams {
    from_cursor: Option<u64>,
}

/// 列出会话
pub async fn list_sessions_handler(
    State(service): State<Arc<TerminalService>>,
) -> impl IntoResponse {
    match service.list_sessions("user-123").await {
        Ok(sessions) => (StatusCode::OK, Json(sessions)),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        ),
    }
}

/// 心跳处理（Agent 调用）
pub async fn heartbeat_handler(
    State(service): State<Arc<TerminalService>>,
    Json(heartbeat): Json<HeartbeatRequest>,
) -> impl IntoResponse {
    // 处理上报
    for report in heartbeat.reports {
        if let Err(e) = service.handle_report(report).await {
            eprintln!("Failed to handle report: {}", e);
        }
    }

    // 获取待下发任务
    let tasks = service.get_pending_tasks(&heartbeat.agent_id).await;

    let response = HeartbeatResponse {
        tasks,
        cancels: vec![],
    };

    (StatusCode::OK, Json(response))
}

#[derive(Deserialize)]
pub struct HeartbeatRequest {
    agent_id: String,
    timestamp: String,
    reports: Vec<SessionReport>,
}

#[derive(Serialize)]
pub struct HeartbeatResponse {
    tasks: Vec<TerminalTask>,
    cancels: Vec<CancelTask>,
}

#[derive(Serialize)]
pub struct CancelTask {
    task_id: String,
    reason: String,
}
