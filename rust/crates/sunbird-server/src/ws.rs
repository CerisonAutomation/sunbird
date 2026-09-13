    http::HeaderMap,
    response::{IntoResponse, Response},
/// WebSocket upgrade state shared between the v1 and legacy socket handlers.
/// Carries the room registry and the list of allowed origins for WS origin
/// enforcement (mirrors the HTTP CORS layer but applies to the WS upgrade too).
#[derive(Clone)]
pub struct SocketState {
    pub rooms: Arc<RoomManager>,
    pub allowed_origins: Vec<String>,
}

/// Validate the request `Origin` header against the configured allowed list.
/// In development (all origins `"*"`) we allow everything; in staging/production
/// the list must be explicit and every entry is an exact match.
pub fn origin_allowed(headers: &HeaderMap, allowed_origins: &[String]) -> bool {
    if allowed_origins.iter().any(|o| o == "*") {
        return true;
    }
    let provided = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    allowed_origins.iter().any(|o| o == provided)
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<SocketState>,
    headers: HeaderMap,
) -> Response {
    if !origin_allowed(&headers, &state.allowed_origins) {
        return (axum::http::StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }
    ws.max_message_size(MAX_JSON_PAYLOAD_BYTES)
        .max_frame_size(MAX_JSON_PAYLOAD_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state.rooms))
#!/usr/bin/env bash
# Redeploy the PvP room server to the GCP free-tier VM (e2-micro, us-central1-a).
#
# One-time setup already done:
#   gcloud services enable compute.googleapis.com
#   gcloud billing projects link cerisonautomation --billing-account=012F8E-64AD39-A0FF51
#   gcloud compute instances create sunbird-mp --zone=us-central1-a \
#     --machine-type=e2-micro --image-family=ubuntu-2404-lts-amd64 \
#     --image-project=ubuntu-os-cloud --boot-disk-size=30GB \
#     --boot-disk-type=pd-standard --tags=sunbird-mp
#   gcloud compute firewall-rules create allow-sunbird-mp \
#     --allow=tcp:8080,tcp:443,tcp:80 --source-ranges=0.0.0.0/0 --target-tags=sunbird-mp
#
# Re-run this script after any change to rust/crates/sunbird-server:
set -euo pipefail
ZONE=us-central1-a
VM=sunbird-mp

# Cross-compile for linux/amd64 from any host (Apple Silicon friendly).
docker run --platform linux/amd64 --rm -v "$(pwd)/rust":/work \
  -v sunbird-cargo-cache:/usr/local/cargo/registry -w /work \
  rust:1-slim cargo build --release -p sunbird-server

gcloud compute scp rust/target/release/sunbird-server "$VM":/tmp/sunbird-server --zone="$ZONE"
gcloud compute scp rust/deploy/gcloud/sunbird-server.service "$VM":/tmp/sunbird-server.service --zone="$ZONE"

gcloud compute ssh "$VM" --zone="$ZONE" --command='
set -e
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
sudo mkdir -p /opt/sunbird
sudo mv /tmp/sunbird-server /opt/sunbird/sunbird-server
sudo mv /tmp/sunbird-server.service /etc/systemd/system/sunbird-server.service
sudo chown root:root /opt/sunbird/sunbird-server && sudo chmod 755 /opt/sunbird/sunbird-server
sudo systemctl daemon-reload
sudo systemctl restart sunbird-server
systemctl is-active sunbird-server'
echo "Deployed. Endpoint: ws://$(gcloud compute instances describe "$VM" --zone="$ZONE" --format='value(networkInterfaces[0].accessConfigs[0].natIP)'):8080/ws"
