use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use codex_record_replay_linux::{
    bundle_draft_prompt, command_json, expire_session, parse_timeline_line, read_runtime_status,
    read_timeline, record_browser_trace, record_speech_context, start_session,
    update_active_status, validate_bundle_dir, validate_draft_prompt, write_active_status,
    write_stopped_status, RecordCommand, RecordStartOptions, RecordingBundleManifest,
    RecordingRuntimeState, SessionCancelArgs, TimelineEvent,
};

const MANIFEST_VALID_FIXTURE: &str = include_str!("fixtures/manifest_valid.json");
const MANIFEST_INVALID_FIXTURE: &str = include_str!("fixtures/manifest_invalid_paths.json");
const TIMELINE_FIXTURE: &str = include_str!("fixtures/timeline.jsonl");
const DRAFT_PROMPT_VALID: &str = include_str!("fixtures/draft_prompt_valid.md");
const DRAFT_PROMPT_EMPTY: &str = include_str!("fixtures/draft_prompt_empty.md");

#[test]
fn manifest_fixture_roundtrips_through_serde() {
    let manifest: RecordingBundleManifest =
        serde_json::from_str(MANIFEST_VALID_FIXTURE).expect("valid fixture");
    assert!(manifest.validate().is_valid());
    let rendered = serde_json::to_string(&manifest).unwrap();
    let manifest_roundtrip: RecordingBundleManifest = serde_json::from_str(&rendered).unwrap();
    assert_eq!(manifest_roundtrip, manifest);
}

#[test]
fn manifest_rejects_absolute_and_dotdot_paths() {
    let manifest: RecordingBundleManifest = serde_json::from_str(MANIFEST_INVALID_FIXTURE).unwrap();
    let report = manifest.validate();
    assert!(!report.is_valid());
    assert!(report
        .errors
        .iter()
        .any(|err| err.to_string().contains("must be relative")
            || err.to_string().contains("must not contain ..")));
}

#[test]
fn timeline_parses_lines_and_serializes_roundtrip() {
    for (expected_index, line) in TIMELINE_FIXTURE.lines().enumerate() {
        let parsed = parse_timeline_line(line).expect("valid timeline line");
        assert_eq!(parsed.index as usize, expected_index);
        assert!(parsed.validate().is_valid());
        let rendered = parsed.to_json_line().unwrap();
        let reparsed = parse_timeline_line(&rendered).unwrap();
        assert_eq!(parsed, reparsed);
    }
}

#[test]
fn draft_prompt_validation_uses_fixture_files() {
    assert!(validate_draft_prompt(DRAFT_PROMPT_VALID).is_valid());
    assert!(!validate_draft_prompt(DRAFT_PROMPT_EMPTY).is_valid());
}

#[test]
fn timeline_has_expected_event_shape() {
    let mut lines = TIMELINE_FIXTURE.lines();
    let navigation = parse_timeline_line(lines.next().expect("navigation line")).unwrap();
    assert!(matches!(navigation.event, TimelineEvent::Navigation { .. }));
    if let TimelineEvent::Navigation { url } = navigation.event {
        assert!(url.ends_with('/'));
    }
}

#[test]
fn speech_context_is_timeline_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("timeline.jsonl"), "").unwrap();

    let record = record_speech_context(
        root,
        "Use my spoken description as the expected workflow intent.",
        Some("microphone-transcript".to_string()),
    )
    .unwrap();

    assert!(record.validate().is_valid());
    assert!(matches!(record.event, TimelineEvent::SpeechContext { .. }));
    let raw = fs::read_to_string(root.join("timeline.jsonl")).unwrap();
    assert!(raw.contains("speech_context"));
    assert!(raw.contains("microphone-transcript"));
}

#[test]
fn browser_trace_is_bundle_artifact_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("manifest.json"), MANIFEST_VALID_FIXTURE).unwrap();
    fs::write(root.join("timeline.jsonl"), "").unwrap();
    create_standard_bundle_dirs(root);
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();

    let record = record_browser_trace(
        root,
        serde_json::json!({
            "events": [
                { "method": "Page.navigate", "params": { "url": "https://example.com/login" } }
            ]
        }),
        Some("https://example.com/login".to_string()),
        Some("Example Login".to_string()),
        Some("chrome-cdp".to_string()),
    )
    .unwrap();

    assert!(record.validate().is_valid());
    assert!(matches!(record.event, TimelineEvent::BrowserTrace { .. }));
    let timeline = read_timeline(root).unwrap();
    assert!(matches!(
        timeline.last(),
        Some(record) if matches!(&record.event, TimelineEvent::BrowserTrace { file, source, .. } if file == "browser/0000-trace.json" && source.as_deref() == Some("chrome-cdp"))
    ));
    assert!(root.join("browser/0000-trace.json").is_file());
    assert!(validate_bundle_dir(root).unwrap().is_valid());
    let prompt = bundle_draft_prompt(root).unwrap();
    assert!(prompt.contains("browser trace browser/0000-trace.json"));
    assert!(prompt.contains("Example Login"));
}

#[test]
fn start_session_writes_browser_input_capture_and_x11_evidence() {
    let _guard = status_env_lock().lock().expect("status env lock poisoned");
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("bundle");

    let status_path = temp.path().join("status.json");
    let previous = std::env::var_os("CODEX_RECORD_REPLAY_STATUS_PATH");
    std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", &status_path);

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let report = runtime
        .block_on(start_session(RecordStartOptions {
            session_dir: root.clone(),
            app_id: None,
            window_id: None,
            goal: Some("record backend evidence".to_string()),
            include_screenshot: false,
            include_accessibility: false,
        }))
        .unwrap();

    assert!(report.ok);
    assert!(root.join("browser/0000-readiness.json").is_file());
    assert!(root.join("input-capture/0000-readiness.json").is_file());
    assert!(root.join("x11/0000-session.json").is_file());
    let timeline = read_timeline(&root).unwrap();
    assert!(timeline.iter().any(|record| {
        matches!(&record.event, TimelineEvent::ProviderEvidence { provider, file, .. } if provider == "browser-trace" && file == "browser/0000-readiness.json")
    }));
    assert!(timeline.iter().any(|record| {
        matches!(&record.event, TimelineEvent::ProviderEvidence { provider, file, .. } if provider == "input-capture-libei" && file == "input-capture/0000-readiness.json")
    }));
    assert!(timeline.iter().any(|record| {
        matches!(&record.event, TimelineEvent::ProviderEvidence { provider, file, .. } if provider == "x11-recording" && file == "x11/0000-session.json")
    }));
    assert!(validate_bundle_dir(&root).unwrap().is_valid());

    match previous {
        Some(path) => std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", path),
        None => std::env::remove_var("CODEX_RECORD_REPLAY_STATUS_PATH"),
    }
}

#[test]
fn runtime_status_tracks_active_and_stopped_recording() {
    let _guard = status_env_lock().lock().expect("status env lock poisoned");
    let temp = tempfile::tempdir().unwrap();
    let status_path = temp.path().join("status.json");
    let previous = std::env::var_os("CODEX_RECORD_REPLAY_STATUS_PATH");
    std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", &status_path);

    let session_dir = temp.path().join("bundle");
    let active =
        write_active_status(&session_dir, Some("record parity smoke".to_string())).unwrap();
    assert_eq!(active.state, RecordingRuntimeState::Active);
    assert_eq!(
        read_runtime_status().session_dir.as_deref(),
        Some(session_dir.as_path())
    );

    update_active_status("mark").unwrap();
    let marked = read_runtime_status();
    assert_eq!(marked.state, RecordingRuntimeState::Active);
    assert_eq!(marked.last_event.as_deref(), Some("mark"));

    let stopped = write_stopped_status(&session_dir).unwrap();
    assert_eq!(stopped.state, RecordingRuntimeState::Stopped);
    assert_eq!(read_runtime_status().last_event.as_deref(), Some("stop"));

    match previous {
        Some(path) => std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", path),
        None => std::env::remove_var("CODEX_RECORD_REPLAY_STATUS_PATH"),
    }
}

#[test]
fn validates_bundle_directory_and_generates_draft_prompt() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("manifest.json"), MANIFEST_VALID_FIXTURE).unwrap();
    fs::write(root.join("timeline.jsonl"), TIMELINE_FIXTURE).unwrap();
    create_standard_bundle_dirs(root);
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();
    fs::write(root.join("draft-prompt.md"), DRAFT_PROMPT_VALID).unwrap();

    assert!(validate_bundle_dir(root).unwrap().is_valid());
    let prompt = bundle_draft_prompt(root).unwrap();
    assert!(prompt.contains("Draft a Codex skill"));
    assert!(prompt.contains("speech context"));
    assert!(prompt.contains("Timeline"));
    assert!(validate_draft_prompt(&prompt).is_valid());
}

#[test]
fn validates_bundle_before_draft_prompt_is_generated() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("manifest.json"), MANIFEST_VALID_FIXTURE).unwrap();
    fs::write(root.join("timeline.jsonl"), TIMELINE_FIXTURE).unwrap();
    create_standard_bundle_dirs(root);
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();

    let report = validate_bundle_dir(root).unwrap();
    assert!(report.is_valid(), "{report:?}");
}

#[test]
fn draft_prompt_rejects_manifest_paths_that_escape_bundle() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let mut manifest: RecordingBundleManifest =
        serde_json::from_str(MANIFEST_VALID_FIXTURE).expect("valid fixture");
    manifest.files.draft_prompt = "../escape.md".to_string();
    fs::write(
        root.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .unwrap();
    fs::write(root.join("timeline.jsonl"), TIMELINE_FIXTURE).unwrap();
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();

    let error = bundle_draft_prompt(root).unwrap_err().to_string();
    assert!(error.contains("bundle manifest is invalid"));
    assert!(!temp.path().join("escape.md").exists());
}

#[test]
fn draft_prompt_uses_manifest_timeline_path() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let mut manifest: RecordingBundleManifest =
        serde_json::from_str(MANIFEST_VALID_FIXTURE).expect("valid fixture");
    manifest.files.timeline = "events/custom.jsonl".to_string();
    fs::write(
        root.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .unwrap();
    fs::create_dir(root.join("events")).unwrap();
    fs::write(root.join("events/custom.jsonl"), TIMELINE_FIXTURE).unwrap();
    create_standard_bundle_dirs(root);
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();

    let prompt = bundle_draft_prompt(root).unwrap();
    assert!(prompt.contains("navigation to https://example.com/"));
}

#[test]
fn bundle_draft_prompt_refuses_canceled_bundles() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let mut manifest = RecordingBundleManifest::new(
        "fixture-session".to_string(),
        "2026-06-28T12:00:00Z".to_string(),
    );
    manifest.end_reason = Some("recording_controls_canceled_discarded".to_string());
    manifest.ended_at = Some("2026-06-28T12:05:00Z".to_string());
    codex_record_replay_linux::manifest::write_manifest(root, &manifest).unwrap();
    fs::write(
        root.join("timeline.jsonl"),
        concat!(
            "{\"index\":0,\"recorded_at\":\"2026-06-28T12:00:00Z\",\"kind\":\"session_started\",\"payload\":{\"goal\":\"Record a browser login workflow and turn it into a skill.\"}}\n",
            "{\"index\":1,\"recorded_at\":\"2026-06-28T12:05:00Z\",\"kind\":\"session_cancelled\",\"payload\":{\"discarded\":true}}\n"
        ),
    )
    .unwrap();
    create_standard_bundle_dirs(root);
    fs::write(root.join("diagnostics.json"), "{\"ok\":true}\n").unwrap();

    let prompt = bundle_draft_prompt(root).unwrap();
    assert!(prompt.contains("canceled") || prompt.contains("discarded"));
    assert!(prompt.contains("Do not draft a reusable skill from this bundle."));
}

#[test]
fn record_cancel_marks_bundle_as_canceled_and_discarded() {
    let _guard = status_env_lock().lock().expect("status env lock poisoned");
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("bundle");
    fs::create_dir(&root).unwrap();

    let manifest = RecordingBundleManifest::new(
        "fixture-session".to_string(),
        "2026-06-28T12:00:00Z".to_string(),
    );
    codex_record_replay_linux::manifest::write_manifest(&root, &manifest).unwrap();

    let status_path = temp.path().join("status.json");
    let previous = std::env::var_os("CODEX_RECORD_REPLAY_STATUS_PATH");
    std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", &status_path);
    write_active_status(&root, Some("cancel parity smoke".to_string())).unwrap();

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let response = runtime
        .block_on(command_json(codex_record_replay_linux::Commands::Record {
            command: RecordCommand::Cancel(SessionCancelArgs {
                session_dir: root.clone(),
                discarded: true,
            }),
        }))
        .unwrap();

    assert_eq!(response["ok"], true);
    assert_eq!(response["command"], "record.cancel");
    assert_eq!(response["discarded"], true);
    assert_eq!(response["isRecording"], false);
    assert_eq!(
        response["endReason"],
        "recording_controls_canceled_discarded"
    );
    assert_eq!(
        response["sessionDirectoryPath"].as_str(),
        Some(root.to_string_lossy().as_ref())
    );
    let status = read_runtime_status();
    assert_eq!(status.state, RecordingRuntimeState::Canceled);
    assert_eq!(
        status.end_reason.as_deref(),
        Some("recording_controls_canceled_discarded")
    );

    let manifest = codex_record_replay_linux::manifest::read_manifest(&root).unwrap();
    assert_eq!(
        manifest.end_reason.as_deref(),
        Some("recording_controls_canceled_discarded")
    );
    assert!(manifest.ended_at.is_some());

    let timeline = read_timeline(&root).unwrap();
    assert!(
        matches!(timeline.last(), Some(record) if matches!(&record.event, TimelineEvent::SessionCancelled { discarded } if *discarded))
    );

    match previous {
        Some(path) => std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", path),
        None => std::env::remove_var("CODEX_RECORD_REPLAY_STATUS_PATH"),
    }
}

#[test]
fn record_expire_marks_bundle_at_max_duration() {
    let _guard = status_env_lock().lock().expect("status env lock poisoned");
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("bundle");
    fs::create_dir(&root).unwrap();
    fs::write(root.join("timeline.jsonl"), "").unwrap();

    let manifest = RecordingBundleManifest::new(
        "fixture-session".to_string(),
        "2026-06-28T12:00:00Z".to_string(),
    );
    codex_record_replay_linux::manifest::write_manifest(&root, &manifest).unwrap();

    let status_path = temp.path().join("status.json");
    let previous = std::env::var_os("CODEX_RECORD_REPLAY_STATUS_PATH");
    std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", &status_path);
    write_active_status(&root, Some("max duration parity smoke".to_string())).unwrap();

    let record = expire_session(&root).unwrap();
    assert!(matches!(record.event, TimelineEvent::SessionExpired));

    let status = read_runtime_status();
    assert_eq!(status.state, RecordingRuntimeState::Expired);
    assert_eq!(status.end_reason.as_deref(), Some("max_duration"));

    let manifest = codex_record_replay_linux::manifest::read_manifest(&root).unwrap();
    assert_eq!(manifest.end_reason.as_deref(), Some("max_duration"));
    assert!(manifest.ended_at.is_some());

    let timeline = read_timeline(&root).unwrap();
    assert!(matches!(
        timeline.last(),
        Some(record) if matches!(&record.event, TimelineEvent::SessionExpired)
    ));

    match previous {
        Some(path) => std::env::set_var("CODEX_RECORD_REPLAY_STATUS_PATH", path),
        None => std::env::remove_var("CODEX_RECORD_REPLAY_STATUS_PATH"),
    }
}

fn status_env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn create_standard_bundle_dirs(root: &Path) {
    for dir in [
        "screenshots",
        "accessibility",
        "browser",
        "transcripts",
        "input-capture",
        "x11",
    ] {
        fs::create_dir(root.join(dir)).unwrap();
    }
}
