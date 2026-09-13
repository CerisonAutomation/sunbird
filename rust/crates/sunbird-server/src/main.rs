mod validate;
    let ws_socket_state = ws::SocketState {
        rooms: shared.rooms.clone(),
        allowed_origins: shared.config.public_origins.clone(),
    };
    let legacy_socket_state = legacy::LegacySocketState {
        rooms: shared.legacy_rooms.clone(),
        allowed_origins: shared.config.public_origins.clone(),
    };
        .with_state(ws_socket_state);
        .with_state(legacy_socket_state);
