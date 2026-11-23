use crate::frame::{Frame, PixelFormat};
use crate::types::{Color, PixelSampler, Point};
use core_graphics::display::CGPoint;
use core_graphics::geometry::{CGRect, CGSize};
use core_graphics::image::CGImage;

pub struct MacOSSampler;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCreateImage(
        rect: CGRect,
        list_option: u32,
        window_id: u32,
        image_option: u32,
    ) -> *mut std::ffi::c_void;
    fn CGEventCreate(source: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CGEventGetLocation(event: *mut std::ffi::c_void) -> CGPoint;
    fn CFRelease(cf: *const std::ffi::c_void);
}

const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
const K_CG_WINDOW_IMAGE_BEST_RESOLUTION: u32 = 1 << 0;

impl MacOSSampler {
    pub fn new() -> Result<Self, String> {
        Ok(MacOSSampler)
    }

    /// Windows with content protection (our magnifier) are excluded from the capture.
    fn capture(rect: CGRect) -> Option<CGImage> {
        unsafe {
            let image_ref = CGWindowListCreateImage(
                rect,
                K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY,
                0,
                K_CG_WINDOW_IMAGE_BEST_RESOLUTION,
            );
            if image_ref.is_null() {
                None
            } else {
                Some(std::mem::transmute::<*mut std::ffi::c_void, CGImage>(
                    image_ref,
                ))
            }
        }
    }
}

impl PixelSampler for MacOSSampler {
    fn get_cursor_position(&self) -> Result<Point, String> {
        unsafe {
            let event_ref = CGEventCreate(std::ptr::null_mut());
            if event_ref.is_null() {
                return Err("Failed to create CG event".to_string());
            }
            let point = CGEventGetLocation(event_ref);
            CFRelease(event_ref);
            Ok(Point {
                x: point.x as i32,
                y: point.y as i32,
            })
        }
    }

    fn sample_grid(
        &mut self,
        center_x: i32,
        center_y: i32,
        grid_size: usize,
    ) -> Result<Vec<Vec<Color>>, String> {
        let half = (grid_size / 2) as i32;
        let rect = CGRect::new(
            &CGPoint::new((center_x - half) as f64, (center_y - half) as f64),
            &CGSize::new(grid_size as f64, grid_size as f64),
        );
        let image = Self::capture(rect).ok_or("Failed to capture screen region")?;
        if image.bits_per_pixel() != 32 {
            return Err(format!(
                "Unsupported capture format: {} bpp",
                image.bits_per_pixel()
            ));
        }

        // BEST_RESOLUTION returns one image pixel per physical pixel, so a Retina
        // capture is 2x the requested point size.
        let scale = (image.width() / grid_size).max(1) as i32;
        let frame = Frame::new(
            image.data().bytes().to_vec(),
            image.width() as u32,
            image.height() as u32,
            image.bytes_per_row(),
            PixelFormat::Bgrx,
        )?;

        let center = (grid_size / 2) as i32 * scale;
        Ok(frame.grid(center, center, grid_size, scale))
    }
}
