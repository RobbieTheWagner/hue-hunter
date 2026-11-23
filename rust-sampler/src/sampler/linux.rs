// Linux pixel sampler using X11 direct capture
//
// Captures the screen ONCE, before the magnifier window is shown, then serves every
// pixel/grid request from that frozen buffer. We deliberately never re-capture during
// a pick session: XGetImage on the root window returns the *composited* screen, which
// under any compositing WM includes our own always-on-top magnifier overlay
// (setContentProtection is a no-op on X11/Linux). Re-capturing would feed the magnifier
// back into itself. This mirrors the Wayland backend (wayland_portal.rs), which freezes
// a frame for the same reason.
//
// Trade-off: colors reflect the screen as it was when the pick started, so live content
// (video, animations) under the cursor will not update mid-pick.
//
// For Wayland systems, see wayland_portal.rs which uses XDG Desktop Portal + PipeWire.

use crate::types::{Color, PixelSampler, Point};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};

static X_ERROR_OCCURRED: AtomicBool = AtomicBool::new(false);

// Custom X error handler that doesn't exit the process
unsafe extern "C" fn x_error_handler(
    _display: *mut x11::xlib::Display,
    _error_event: *mut x11::xlib::XErrorEvent,
) -> i32 {
    X_ERROR_OCCURRED.store(true, Ordering::SeqCst);
    0 // Return 0 to indicate we handled it
}

pub struct LinuxSampler {
    x11_display: *mut x11::xlib::Display,
    screen_width: i32,
    screen_height: i32,
    screenshot: Option<Screenshot>,
}

struct Screenshot {
    data: Vec<u8>,
    width: u32,
    height: u32,
}

impl LinuxSampler {
    pub fn new() -> Result<Self, String> {
        unsafe {
            let display = x11::xlib::XOpenDisplay(ptr::null());
            if display.is_null() {
                return Err("Failed to open X11 display".to_string());
            }
            
            // Install custom error handler
            x11::xlib::XSetErrorHandler(Some(x_error_handler));
            
            // Get screen dimensions
            let screen = x11::xlib::XDefaultScreen(display);
            let screen_width = x11::xlib::XDisplayWidth(display, screen);
            let screen_height = x11::xlib::XDisplayHeight(display, screen);
            
            // Test X11 capture capability
            Self::test_x11_capture(display)?;
            
            eprintln!("Linux sampler initialized - Screen: {}x{}", screen_width, screen_height);
            
            Ok(LinuxSampler {
                x11_display: display,
                screen_width,
                screen_height,
                screenshot: None,
            })
        }
    }
    
    fn test_x11_capture(display: *mut x11::xlib::Display) -> Result<(), String> {
        // Test X11 capture capability
        unsafe {
            X_ERROR_OCCURRED.store(false, Ordering::SeqCst);
            
            let root = x11::xlib::XDefaultRootWindow(display);
            let test_image = x11::xlib::XGetImage(
                display,
                root,
                0, 0, 1, 1,
                x11::xlib::XAllPlanes(),
                x11::xlib::ZPixmap,
            );
            
            x11::xlib::XSync(display, 0);
            
            if !X_ERROR_OCCURRED.load(Ordering::SeqCst) && !test_image.is_null() {
                x11::xlib::XDestroyImage(test_image);
                return Ok(());
            }
            
            if !test_image.is_null() {
                x11::xlib::XDestroyImage(test_image);
            }
        }
        
        Err("X11 capture failed".to_string())
    }
    
    fn capture_screenshot(&mut self) -> Result<(), String> {
        self.capture_x11_region(0, 0, self.screen_width as u32, self.screen_height as u32)
    }
    
    fn capture_x11_region(&mut self, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
        unsafe {
            let root = x11::xlib::XDefaultRootWindow(self.x11_display);
            
            X_ERROR_OCCURRED.store(false, Ordering::SeqCst);
            
            let image = x11::xlib::XGetImage(
                self.x11_display,
                root,
                x, y, width, height,
                x11::xlib::XAllPlanes(),
                x11::xlib::ZPixmap,
            );
            
            x11::xlib::XSync(self.x11_display, 0);
            
            if X_ERROR_OCCURRED.load(Ordering::SeqCst) || image.is_null() {
                // Clean up XImage if it was allocated before returning error
                if !image.is_null() {
                    x11::xlib::XDestroyImage(image);
                }
                return Err("X11 capture failed".to_string());
            }
            
            // Convert XImage to RGB buffer
            let mut data = Vec::with_capacity((width * height * 3) as usize);
            
            // Read color masks from the XImage structure
            let red_mask = (*image).red_mask;
            let green_mask = (*image).green_mask;
            let blue_mask = (*image).blue_mask;
            
            // Compute shift amounts by counting trailing zeros
            let red_shift = red_mask.trailing_zeros();
            let green_shift = green_mask.trailing_zeros();
            let blue_shift = blue_mask.trailing_zeros();
            
            // Compute mask bit widths for normalization
            let red_bits = red_mask.count_ones();
            let green_bits = green_mask.count_ones();
            let blue_bits = blue_mask.count_ones();
            
            // Compute normalization divisors (max value for each channel)
            let red_max = (1u64 << red_bits) - 1;
            let green_max = (1u64 << green_bits) - 1;
            let blue_max = (1u64 << blue_bits) - 1;
            
            for row in 0..height {
                for col in 0..width {
                    let pixel = x11::xlib::XGetPixel(image, col as i32, row as i32);
                    
                    // Extract raw channel values using masks and shifts
                    let r_raw = (pixel & red_mask) >> red_shift;
                    let g_raw = (pixel & green_mask) >> green_shift;
                    let b_raw = (pixel & blue_mask) >> blue_shift;
                    
                    // Normalize to 8-bit (0..255)
                    let r = ((r_raw * 255) / red_max) as u8;
                    let g = ((g_raw * 255) / green_max) as u8;
                    let b = ((b_raw * 255) / blue_max) as u8;
                    
                    data.push(r);
                    data.push(g);
                    data.push(b);
                }
            }
            
            x11::xlib::XDestroyImage(image);

            self.screenshot = Some(Screenshot {
                data,
                width,
                height,
            });

            Ok(())
        }
    }

    fn ensure_screenshot_captured(&mut self) -> Result<(), String> {
        // Capture exactly once, before the magnifier is visible. We never re-capture
        // during a session — see the module docs for why (self-capture of our overlay).
        if self.screenshot.is_none() {
            self.capture_screenshot()?;
        }

        Ok(())
    }
}

impl Drop for LinuxSampler {
    fn drop(&mut self) {
        unsafe {
            x11::xlib::XCloseDisplay(self.x11_display);
        }
    }
}

impl PixelSampler for LinuxSampler {
    fn sample_pixel(&mut self, x: i32, y: i32) -> Result<Color, String> {
        self.ensure_screenshot_captured()?;

        let screenshot = self.screenshot.as_ref()
            .ok_or("No screenshot available")?;

        if x < 0 || y < 0 || x >= screenshot.width as i32 || y >= screenshot.height as i32 {
            return Ok(Color::new(128, 128, 128));
        }

        let index = ((y as u32 * screenshot.width + x as u32) * 3) as usize;

        if index + 2 >= screenshot.data.len() {
            return Ok(Color::new(128, 128, 128));
        }

        let r = screenshot.data[index];
        let g = screenshot.data[index + 1];
        let b = screenshot.data[index + 2];

        Ok(Color::new(r, g, b))
    }

    fn get_cursor_position(&self) -> Result<Point, String> {
        unsafe {
            let root = x11::xlib::XDefaultRootWindow(self.x11_display);
            
            let mut root_return = 0;
            let mut child_return = 0;
            let mut root_x = 0;
            let mut root_y = 0;
            let mut win_x = 0;
            let mut win_y = 0;
            let mut mask_return = 0;
            
            let result = x11::xlib::XQueryPointer(
                self.x11_display,
                root,
                &mut root_return,
                &mut child_return,
                &mut root_x,
                &mut root_y,
                &mut win_x,
                &mut win_y,
                &mut mask_return,
            );
            
            if result == 0 {
                return Err("Failed to query pointer".to_string());
            }
            
            Ok(Point { x: root_x, y: root_y })
        }
    }

    fn sample_grid(&mut self, center_x: i32, center_y: i32, grid_size: usize, _scale_factor: f64) -> Result<Vec<Vec<Color>>, String> {
        // Ensure the frozen screenshot has been captured
        self.ensure_screenshot_captured()?;
        
        let half_size = (grid_size / 2) as i32;
        let mut grid = Vec::with_capacity(grid_size);
        
        for row in 0..grid_size {
            let mut row_pixels = Vec::with_capacity(grid_size);
            for col in 0..grid_size {
                let x = center_x + (col as i32 - half_size);
                let y = center_y + (row as i32 - half_size);
                
                let color = self.sample_pixel(x, y)
                    .unwrap_or(Color::new(128, 128, 128));
                row_pixels.push(color);
            }
            grid.push(row_pixels);
        }
        
        Ok(grid)
    }
}
