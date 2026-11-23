#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOSSampler;

#[cfg(all(target_os = "linux", feature = "x11"))]
mod linux;
#[cfg(all(target_os = "linux", feature = "x11"))]
pub use linux::LinuxSampler;

#[cfg(all(target_os = "linux", feature = "wayland"))]
mod wayland_portal;
#[cfg(all(target_os = "linux", feature = "wayland"))]
pub use wayland_portal::WaylandPortalSampler;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsSampler;

use crate::types::PixelSampler;

pub fn create_sampler() -> Result<Box<dyn PixelSampler>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(Box::new(MacOSSampler::new()?))
    }

    #[cfg(target_os = "linux")]
    {
        // Try X11 direct capture first (best performance)
        #[cfg(feature = "x11")]
        {
            match LinuxSampler::new() {
                Ok(sampler) => {
                    return Ok(Box::new(sampler));
                }
                Err(e) => {
                    eprintln!("X11 capture unavailable: {}", e);
                }
            }
        }

        // Try Wayland Portal capture
        #[cfg(feature = "wayland")]
        {
            match WaylandPortalSampler::new() {
                Ok(sampler) => return Ok(Box::new(sampler)),
                Err(e) => {
                    eprintln!("✗ Wayland Portal sampler failed: {}", e);
                }
            }
        }

        Err(
            "No screen capture method available. Build with --features x11 or --features wayland"
                .to_string(),
        )
    }

    #[cfg(target_os = "windows")]
    {
        Ok(Box::new(WindowsSampler::new()?))
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}
