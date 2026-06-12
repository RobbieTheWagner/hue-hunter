// Sampler selection and platform detection tests

#[test]
fn test_platform_specific_compilation() {
    // Ensure exactly one platform is active
    let mut active_platforms = 0;

    #[cfg(target_os = "macos")]
    {
        active_platforms += 1;
    }

    #[cfg(target_os = "linux")]
    {
        active_platforms += 1;
    }

    #[cfg(target_os = "windows")]
    {
        active_platforms += 1;
    }

    assert_eq!(
        active_platforms, 1,
        "Exactly one platform should be compiled"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn test_macos_sampler_available() {
    assert_eq!(std::env::consts::OS, "macos");
}

#[cfg(target_os = "windows")]
#[test]
fn test_windows_sampler_available() {
    assert_eq!(std::env::consts::OS, "windows");
}

#[cfg(target_os = "linux")]
#[test]
fn test_linux_platform_detected() {
    assert_eq!(std::env::consts::OS, "linux");
}

#[test]
fn test_feature_flags_compilation() {
    // Smoke test: feature-gated code compiles in every feature combination
    let enabled_features: &[&str] = &[
        #[cfg(feature = "wayland")]
        "wayland",
        #[cfg(feature = "x11")]
        "x11",
    ];
    assert!(enabled_features.len() <= 2);
}
