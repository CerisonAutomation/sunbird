// Every other type in this protocol is camelCase on the wire, and so is the
// browser client that reads it (`src/game/protocol/v1.ts` requires
// `limits.maxJsonPayloadBytes`). This attribute was missing, so `GET /v1/hello`
// emitted `max_json_payload_bytes` and the client's parser threw
// "limits.maxJsonPayloadBytes is required as a number". Caught by the contract
// suite, which is the only reason it was caught at all.
#[serde(rename_all = "camelCase")]

    #[test]
    fn hello_limits_are_camel_case_on_the_wire() {
        let value = serde_json::to_value(ServerMessage::Hello {
            version: PROTOCOL_VERSION,
            server_name: "sunbird-dev".into(),
            limits: Limits::current(),
        })
        .expect("encode");
        let limits = &value["limits"];
        assert_eq!(limits["maxJsonPayloadBytes"], MAX_JSON_PAYLOAD_BYTES);
        assert_eq!(limits["maxNameChars"], MAX_NAME_CHARS);
        assert!(
            limits.get("max_json_payload_bytes").is_none(),
            "snake_case leaked onto the wire; the browser client cannot read it"
        );
        // And the frame the client actually receives must parse.
        let payload = serde_json::to_vec(&value).expect("encode");
        assert!(parse_server_message(&payload, MAX_JSON_PAYLOAD_BYTES).is_ok());
    }
