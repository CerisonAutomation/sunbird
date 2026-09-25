mod auth;
mod config;
mod legacy;
mod metrics;
mod rooms;
mod validate;
mod ws;

use anyhow::Context;
use axum::{
    extract::State,
    http::{header, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use config::{Config, Environment};
use parking_lot::RwLock;
use serde::Serialize;
use std::{sync::Arc, time::Duration};
use sunbird_protocol::{
    Limits, ProtocolError, SeatGrant, ServerMessage, MAX_JSON_PAYLOAD_BYTES, PROTOCOL_VERSION,
};
use tokio::{net::TcpListener, signal, sync::watch};
use tower_http::{
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use uuid::Uuid;

type SharedState = Arc<Shared>;
type ShutdownTx = watch::Sender<bool>;

#[derive(Clone)]
struct Shared {
    config: Config,
    issuer: auth::SeatTokenIssuer,
    protocol_limits: Limits,
    state: Arc<RuntimeState>,
    rooms: Arc<rooms::RoomManager>,
    legacy_rooms: Arc<legacy::LegacyRooms>,
}

struct RuntimeState {
    ready: RwLock<bool>,
    started_at_unix: RwLock<i64>,
}

impl RuntimeState {
    fn new() -> Self {
        Self {
            ready: RwLock::new(false),
            started_at_unix: RwLock::new(time::OffsetDateTime::now_utc().unix_timestamp()),
        }
    }
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let config = Config::from_env().context("invalid SUNBIRD configuration")?;
    let shutdown_grace = config.shutdown_grace;
    let bind_addr = config.bind_addr;
    info!(
        bind_addr = %bind_addr,
        environment = %config.environment.as_str(),
        origins = ?config.public_origins,
        "sunbird service configuration validated"
    );

    let room_manager = Arc::new(rooms::RoomManager::new());
    ws::spawn_sweeper(room_manager.clone());
    let legacy_rooms = Arc::new(legacy::LegacyRooms::new());
    legacy::spawn_tick(legacy_rooms.clone());
    let shared = Arc::new(Shared {
        issuer: auth::SeatTokenIssuer::new(&config.reconnect_secret, config.reconnect_grace),
        protocol_limits: Limits::current(),
        config,
        state: Arc::new(RuntimeState::new()),
        rooms: room_manager,
        legacy_rooms,
    });
    let listener = TcpListener::bind(bind_addr)
        .await
        .with_context(|| format!("cannot bind {bind_addr}"))?;
    let bound = listener
        .local_addr()
        .context("failed to resolve listener address")?;
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let app = build_app(shared.clone(), shutdown_rx.clone());

    *shared.state.ready.write() = true;
    *shared.state.started_at_unix.write() = time::OffsetDateTime::now_utc().unix_timestamp();

    if let Some(metrics_bind) = shared.config.metrics_bind {
        let metrics_app = metrics::metrics_endpoint_app();
        let metrics_listener = TcpListener::bind(metrics_bind)
            .await
            .with_context(|| format!("cannot bind metrics address {metrics_bind}"))?;
        let metrics_addr = metrics_listener
            .local_addr()
            .context("failed to resolve metrics address")?;
        metrics::install();
        tokio::spawn(async move {
            info!(%metrics_addr, "metrics listener started");
            if let Err(err) = axum::serve(metrics_listener, metrics_app).await {
                error!(%err, "metrics listener failed");
            }
        });
    }

    info!(%bound, "sunbird service started");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await
        .context("service terminated with an error")?;

    *shared.state.ready.write() = false;
    info!(
        grace_seconds = shutdown_grace.as_secs(),
        "shutdown complete"
    );
    Ok(())
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "sunbird_server=info,tower_http=info".into()),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_target(false)
                .with_current_span(false)
                .with_span_list(false),
        )
        .init();
}

fn build_app(shared: SharedState, shutdown_rx: watch::Receiver<bool>) -> Router {
    let cors = cors_layer(&shared.config);
    let ws_socket_state = ws::SocketState {
        rooms: shared.rooms.clone(),
        issuer: Arc::new(shared.issuer.clone()),
        allowed_origins: shared.config.public_origins.clone(),
    };
    let legacy_socket_state = legacy::LegacySocketState {
        rooms: shared.legacy_rooms.clone(),
        allowed_origins: shared.config.public_origins.clone(),
    };
    let ws_router = Router::new()
        .route("/v1/ws", get(ws::ws_handler))
        .with_state(ws_socket_state);
    // The legacy simple-protocol socket the browser ships with today.
    let legacy_router = Router::new()
        .route("/ws", get(legacy::legacy_ws_handler))
        .with_state(legacy_socket_state);
    Router::new()
        .merge(ws_router)
        .merge(legacy_router)
        .route("/health", get(health))
        .route("/healthz", get(health))
        .route("/ready", get(ready))
        .route("/readyz", get(ready))
        .route("/metrics", get(metrics_plain))
        .route("/v1/hello", get(protocol_hello))
        .route("/v1/reconnect-token", post(issue_reconnect_token))
        .route("/v1/degrade", get(degrade_status))
        .route("/v1/rooms", get(room_stats))
        .layer(TraceLayer::new_for_http())
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(3),
        ))
        .layer(RequestBodyLimitLayer::new(MAX_JSON_PAYLOAD_BYTES))
        .layer(cors)
        .layer(axum::middleware::from_fn(
            move |request, next: axum::middleware::Next| {
                let rx = shutdown_rx.clone();
                async move {
                    if *rx.borrow() {
                        return StatusCode::SERVICE_UNAVAILABLE.into_response();
                    }
                    metrics::note_http_request();
                    next.run(request).await
                }
            },
        ))
        .with_state(shared)
}

fn cors_layer(config: &Config) -> CorsLayer {
    let layer = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE]);
    if config.public_origins.iter().any(|origin| origin == "*") {
        layer.allow_origin(Any)
    } else {
        let origins = config
            .public_origins
            .iter()
            .filter_map(|origin| HeaderValue::from_str(origin).ok())
            .collect::<Vec<_>>();
        layer.allow_origin(origins)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    service: String,
    protocol_version: u32,
    uptime_seconds: i64,
}

async fn health(State(shared): State<SharedState>) -> Json<HealthResponse> {
    metrics::note_health();
    Json(HealthResponse {
        status: "ok",
        service: shared.config.app_identity(),
        protocol_version: PROTOCOL_VERSION,
        uptime_seconds: time::OffsetDateTime::now_utc().unix_timestamp()
            - *shared.state.started_at_unix.read(),
    })
}

async fn ready(State(shared): State<SharedState>) -> Response {
    metrics::note_health();
    if *shared.state.ready.read() && shared.config.reconnect_grace_ready() {
        Json(HealthResponse {
            status: "ready",
            service: shared.config.app_identity(),
            protocol_version: PROTOCOL_VERSION,
            uptime_seconds: time::OffsetDateTime::now_utc().unix_timestamp()
                - *shared.state.started_at_unix.read(),
        })
        .into_response()
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(HealthResponse {
                status: "not_ready",
                service: shared.config.app_identity(),
                protocol_version: PROTOCOL_VERSION,
                uptime_seconds: time::OffsetDateTime::now_utc().unix_timestamp()
                    - *shared.state.started_at_unix.read(),
            }),
        )
            .into_response()
    }
}

async fn metrics_plain() -> Response {
    metrics::note_health();
    match Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, metrics::TEXT_CONTENT_TYPE)
        .body(axum::body::Body::from(metrics::render()))
    {
        Ok(response) => response,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn protocol_hello(State(shared): State<SharedState>) -> Json<ServerMessage> {
    metrics::note_health();
    Json(ServerMessage::Hello {
        version: PROTOCOL_VERSION,
        server_name: shared.config.app_identity(),
        limits: shared.protocol_limits.clone(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DegradeResponse {
    multiplayer_ready: bool,
    reason: &'static str,
    fallback: &'static str,
}

/// Capability gate for the browser. Phase 3: authoritative rooms are live on
/// `/v1/ws`, so multiplayer is claimable; the fallback string still tells
/// clients what to do if the socket cannot be established.
async fn degrade_status(State(shared): State<SharedState>) -> Json<DegradeResponse> {
    metrics::note_health();
    let external_ready = shared.config.environment != Environment::Development;
    Json(DegradeResponse {
        multiplayer_ready: true,
        reason: "authoritative-rooms-live",
        fallback: if external_ready {
            "local-practice-only"
        } else {
            "local-practice-mode"
        },
    })
}

/// Ops snapshot of the room registry: room/seat/started counts.
async fn room_stats(State(shared): State<SharedState>) -> Json<rooms::RoomStats> {
    metrics::note_health();
    Json(shared.rooms.stats())
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReconnectTokenRequest {
    player_id: Uuid,
    room_id: Uuid,
    seat_id: Uuid,
    generation: u64,
}

async fn issue_reconnect_token(
    State(shared): State<SharedState>,
    Json(request): Json<ReconnectTokenRequest>,
) -> Result<Json<SeatGrant>, ApiError> {
    metrics::note_join_intent();
    // Ownership check: the seat must exist AND the requested generation
    // must be the seat's CURRENT generation. Seat ids are public (roster
    // broadcasts), so issuing for an arbitrary (seat, generation) pair
    // would let any room member mint a hijack token for a disconnected
    // pilot.
    match shared
        .rooms
        .seat_generation(request.room_id, request.seat_id)
    {
        None => Err(ApiError {
            status: StatusCode::NOT_FOUND,
            error: ProtocolError::SeatNotFound,
        })?,
        Some(current) if current != request.generation => Err(ApiError {
            status: StatusCode::CONFLICT,
            error: ProtocolError::InvalidReconnectToken,
        })?,
        Some(_) => {}
    }
    let token = shared
        .issuer
        .issue(
            request.player_id,
            request.room_id,
            request.seat_id,
            request.generation,
        )
        .map_err(|err| ApiError::internal(err.to_string()))?;
    metrics::note_reconnect_token_issued();
    Ok(Json(SeatGrant {
        room_id: request.room_id,
        seat_id: request.seat_id,
        player_id: request.player_id,
        generation: request.generation,
        reconnect_token: token,
    }))
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    error: ProtocolError,
}

impl ApiError {
    fn internal(message: String) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error: ProtocolError::Rejected { message },
        }
    }

    #[allow(dead_code)]
    fn invalid(message: String) -> Self {
        Self {
            status: StatusCode::UNPROCESSABLE_ENTITY,
            error: ProtocolError::InvalidMessage { reason: message },
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ServerMessage::Error {
                version: PROTOCOL_VERSION,
                error: self.error,
            }),
        )
            .into_response()
    }
}

async fn shutdown_signal(tx: ShutdownTx) {
    let ctrl_c = async {
        if let Err(err) = signal::ctrl_c().await {
            error!(%err, "failed to install ctrl-c handler");
        }
    };
    #[cfg(unix)]
    let terminate = async {
        match signal::unix::signal(signal::unix::SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(err) => error!(%err, "failed to install sigterm handler"),
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("shutdown signal received");
    let _ = tx.send(true);
}

#[cfg(test)]
mod tests {
    use super::*;
    use sunbird_protocol::{parse_client_message, ClientMessage};

    fn test_shared() -> SharedState {
        Arc::new(Shared {
            config: Config::development_default(),
            issuer: auth::SeatTokenIssuer::new(
                b"01234567890123456789012345678901",
                Duration::from_secs(30),
            ),
            protocol_limits: Limits::current(),
            state: Arc::new(RuntimeState::new()),
            rooms: Arc::new(rooms::RoomManager::new()),
            legacy_rooms: Arc::new(legacy::LegacyRooms::new()),
        })
    }

    #[tokio::test]
    async fn ready_flips_when_state_writable() {
        let shared = test_shared();
        assert!(!*shared.state.ready.read());
        *shared.state.ready.write() = true;
        assert!(*shared.state.ready.read());
    }

    #[tokio::test]
    async fn hello_shape_uses_protocol_version() {
        let shared = test_shared();
        let Json(message) = protocol_hello(State(shared)).await;
        let encoded = serde_json::to_value(message).expect("encode");
        assert_eq!(encoded["version"], 1);
        assert_eq!(encoded["type"], "hello");
    }

    #[tokio::test]
    async fn token_issue_requires_a_real_seat() {
        let shared = test_shared();
        // Random seat ids must be rejected — seat ids are public and an
        // unchecked issuer would mint hijack tokens.
        let unknown = issue_reconnect_token(
            State(shared.clone()),
            Json(ReconnectTokenRequest {
                player_id: Uuid::new_v4(),
                room_id: Uuid::new_v4(),
                seat_id: Uuid::new_v4(),
                generation: 3,
            }),
        )
        .await;
        let response = unknown.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        assert!(String::from_utf8_lossy(&body).contains("seatNotFound"));

        // A real seat: join, then mint for its current generation.
        let outcome = shared
            .rooms
            .join("TOK1", "2026-09-16", "Pilot", "sunbird", None)
            .unwrap();
        let grant = outcome.grant;
        let response = issue_reconnect_token(
            State(shared.clone()),
            Json(ReconnectTokenRequest {
                player_id: grant.player_id,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                generation: grant.generation,
            }),
        )
        .await;
        let Json(grant) = response.expect("token grant");
        assert_eq!(grant.generation, 1);
        assert!(grant.reconnect_token.starts_with("sb1."));
    }

    #[tokio::test]
    async fn token_issue_rejects_stale_generation() {
        let shared = test_shared();
        let grant = shared
            .rooms
            .join("TOK2", "2026-09-16", "Pilot", "sunbird", None)
            .unwrap()
            .grant;
        // After a reattach the generation bumps; the old generation must
        // no longer mint tokens.
        shared
            .rooms
            .reconnect(grant.room_id, grant.seat_id)
            .unwrap();
        let stale = issue_reconnect_token(
            State(shared),
            Json(ReconnectTokenRequest {
                player_id: grant.player_id,
                room_id: grant.room_id,
                seat_id: grant.seat_id,
                generation: 1,
            }),
        )
        .await;
        assert_eq!(stale.into_response().status(), StatusCode::CONFLICT);
    }

    #[test]
    fn protocol_config_limits_payload_precondition() {
        const { assert!(MAX_JSON_PAYLOAD_BYTES > 1024) };
        let too_large = vec![b' '; MAX_JSON_PAYLOAD_BYTES + 1];
        assert!(parse_client_message(&too_large, MAX_JSON_PAYLOAD_BYTES).is_err());
    }

    #[test]
    fn control_message_parse_family() {
        let encoded = serde_json::to_vec(&ClientMessage::Heartbeat {
            version: PROTOCOL_VERSION,
            room_id: Uuid::new_v4(),
            seat_id: Uuid::new_v4(),
            sequence: 4,
            client_time: time::OffsetDateTime::now_utc(),
        })
        .expect("encode");
        let parsed =
            parse_client_message(&encoded, MAX_JSON_PAYLOAD_BYTES).expect("parse heartbeat");
        assert!(matches!(parsed, ClientMessage::Heartbeat { .. }));
    }
}
