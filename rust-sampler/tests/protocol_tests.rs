use hue_hunter_sampler::types::{Color, Command, ErrorResponse, PixelData, Point};
use serde_json::{json, Value};

fn parse(line: &str) -> Result<Command, serde_json::Error> {
    serde_json::from_str(line)
}

#[test]
fn parses_each_command_the_typescript_manager_sends() {
    assert_eq!(
        parse(r#"{"command":"start","grid_size":13,"sample_rate":15}"#).unwrap(),
        Command::Start {
            grid_size: 13,
            sample_rate: 15
        }
    );
    assert_eq!(
        parse(r#"{"command":"update_grid","grid_size":21}"#).unwrap(),
        Command::UpdateGrid { grid_size: 21 }
    );
    assert_eq!(parse(r#"{"command":"stop"}"#).unwrap(), Command::Stop);
}

#[test]
fn ignores_unknown_fields() {
    assert_eq!(
        parse(r#"{"command":"update_grid","grid_size":9,"extra":true}"#).unwrap(),
        Command::UpdateGrid { grid_size: 9 }
    );
}

#[test]
fn rejects_malformed_commands() {
    for line in [
        r#"{"command":"start","grid_size":9}"#,
        r#"{"command":"update_grid"}"#,
        r#"{"command":"START","grid_size":9,"sample_rate":15}"#,
        r#"{"command":"pause"}"#,
        r#"{"command":"update_grid","grid_size":-1}"#,
        r#"{"command":"#,
        "",
    ] {
        assert!(parse(line).is_err(), "should reject {line:?}");
    }
}

#[test]
fn color_serializes_with_uppercase_hex() {
    let value = serde_json::to_value(Color::new(255, 10, 0)).unwrap();
    assert_eq!(value, json!({"r": 255, "g": 10, "b": 0, "hex": "#FF0A00"}));
}

#[test]
fn pixel_data_matches_the_shape_manager_ts_reads() {
    let data = PixelData {
        cursor: Point { x: -5, y: 1080 },
        center: Color::new(1, 2, 3),
        grid: vec![vec![Color::new(0, 0, 0), Color::new(255, 255, 255)]],
        timestamp: 42,
    };
    let value: Value = serde_json::to_value(&data).unwrap();
    assert_eq!(
        value,
        json!({
            "cursor": {"x": -5, "y": 1080},
            "center": {"r": 1, "g": 2, "b": 3, "hex": "#010203"},
            "grid": [[
                {"r": 0, "g": 0, "b": 0, "hex": "#000000"},
                {"r": 255, "g": 255, "b": 255, "hex": "#FFFFFF"}
            ]],
            "timestamp": 42
        })
    );
}

#[test]
fn error_response_has_a_single_error_field() {
    let value = serde_json::to_value(ErrorResponse {
        error: "no display ✗".into(),
    })
    .unwrap();
    assert_eq!(value, json!({"error": "no display ✗"}));
}
