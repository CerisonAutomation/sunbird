use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use metrics::{counter, describe_counter, describe_gauge, gauge, histogram};
use metrics_exporter_prometheus::PrometheusBuilder;
use std::sync::OnceLock;

pub const TEXT_CONTENT_TYPE: &str = "text/plain; version=0.0.4; charset=utf-8";

static RECORDER: OnceLock<metrics_exporter_prometheus::PrometheusHandle> = OnceLock::new();

/// Standalone Prometheus scrape listener, bound to `SUNBIRD_METRICS_BIND_ADDR`
/// when configured. Kept separate from the main service so ops metrics stay
/// reachable even while the primary port is saturated.
pub fn metrics_endpoint_app() -> Router {
    Router::new().route("/metrics", get(metrics_handler))
}

async fn metrics_handler() -> Response {
    match Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, TEXT_CONTENT_TYPE)
        .body(axum::body::Body::from(render()))
    {
        Ok(response) => response,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub fn install() -> metrics_exporter_prometheus::PrometheusHandle {
    if let Some(handle) = RECORDER.get() {
        return handle.clone();
    }
    let handle = PrometheusBuilder::new()
        .install_recorder()
        .expect("install prometheus recorder once");
    register_descriptions();
    seed_core_metrics();
    let _ = RECORDER.set(handle.clone());
    handle
}

pub fn render() -> String {
    install().render()
}

fn register_descriptions() {
    describe_counter!(
        "sunbird_health_requests_total",
        "HTTP readiness and liveness probe requests processed"
    );
    describe_counter!(
        "sunbird_join_intents_total",
        "Protocol join intents accepted into the control channel"
    );
    describe_counter!(
        "sunbird_reconnect_tokens_issued_total",
        "Reconnect seat tokens issued by the service"
    );
    describe_counter!(
        "sunbird_connections_open_total",
        "HTTP requests handled by the main service"
    );
    describe_gauge!(
        "sunbird_service_ready",
        "1 when the service is initialized and ready to accept protocol traffic"
    );
    describe_gauge!(
        "sunbird_rooms_active",
        "Rooms currently held in memory; zero until authoritative Phase 3"
    );
}

fn seed_core_metrics() {
    gauge!("sunbird_service_ready").set(1.0);
    gauge!("sunbird_rooms_active").set(0.0);
    let _ = histogram!("sunbird_tick_duration_seconds");
    let _ = histogram!("sunbird_snapshot_bytes");
}

pub fn note_health() {
    counter!("sunbird_health_requests_total").increment(1);
}

pub fn note_http_request() {
    counter!("sunbird_connections_open_total").increment(1);
}

pub fn note_join_intent() {
    counter!("sunbird_join_intents_total").increment(1);
}

pub fn note_reconnect_token_issued() {
    counter!("sunbird_reconnect_tokens_issued_total").increment(1);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_render_contains_names() {
        note_health();
        let body = render();
        assert!(body.contains("sunbird_health_requests_total"));
        assert!(body.contains("sunbird_service_ready"));
    }
}
