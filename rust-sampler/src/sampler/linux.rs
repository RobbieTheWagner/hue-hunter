// X11 pixel sampler.
//
// Captures the screen once, before the magnifier window is shown, and serves every
// grid from that frozen frame. XGetImage on the root window returns the composited
// screen, which under a compositing WM includes our always-on-top magnifier
// (setContentProtection does nothing on Linux), so re-capturing would feed the
// magnifier back into itself. Live content under the cursor does not update mid-pick.

use crate::frame::{Frame, PixelFormat};
use crate::types::{Color, PixelSampler, Point};
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use x11::xlib;

static X_ERROR_OCCURRED: AtomicBool = AtomicBool::new(false);

unsafe extern "C" fn x_error_handler(
    _display: *mut xlib::Display,
    _error_event: *mut xlib::XErrorEvent,
) -> i32 {
    X_ERROR_OCCURRED.store(true, Ordering::SeqCst);
    0
}

/// An open X display, closed on drop. Also used by the Wayland backend to read the
/// cursor position through XWayland.
pub struct XDisplay(*mut xlib::Display);

impl XDisplay {
    pub fn open() -> Result<Self, String> {
        let display = unsafe { xlib::XOpenDisplay(ptr::null()) };
        if display.is_null() {
            return Err("Failed to open X11 display".to_string());
        }
        unsafe { xlib::XSetErrorHandler(Some(x_error_handler)) };
        Ok(XDisplay(display))
    }

    pub fn cursor_position(&self) -> Result<Point, String> {
        let (mut root_return, mut child_return) = (0, 0);
        let (mut root_x, mut root_y, mut win_x, mut win_y) = (0, 0, 0, 0);
        let mut mask_return = 0;
        let ok = unsafe {
            xlib::XQueryPointer(
                self.0,
                xlib::XDefaultRootWindow(self.0),
                &mut root_return,
                &mut child_return,
                &mut root_x,
                &mut root_y,
                &mut win_x,
                &mut win_y,
                &mut mask_return,
            )
        };
        if ok == 0 {
            return Err("Failed to query pointer".to_string());
        }
        Ok(Point {
            x: root_x,
            y: root_y,
        })
    }

    fn screen_size(&self) -> (u32, u32) {
        unsafe {
            let screen = xlib::XDefaultScreen(self.0);
            (
                xlib::XDisplayWidth(self.0, screen) as u32,
                xlib::XDisplayHeight(self.0, screen) as u32,
            )
        }
    }

    fn capture(&self, width: u32, height: u32) -> Result<Frame, String> {
        unsafe {
            X_ERROR_OCCURRED.store(false, Ordering::SeqCst);
            let image = xlib::XGetImage(
                self.0,
                xlib::XDefaultRootWindow(self.0),
                0,
                0,
                width,
                height,
                xlib::XAllPlanes(),
                xlib::ZPixmap,
            );
            xlib::XSync(self.0, 0);
            if image.is_null() {
                return Err("X11 capture failed".to_string());
            }
            let frame = if X_ERROR_OCCURRED.load(Ordering::SeqCst) {
                Err("X11 capture failed".to_string())
            } else {
                frame_from_ximage(&*image, width, height)
            };
            xlib::XDestroyImage(image);
            frame
        }
    }
}

impl Drop for XDisplay {
    fn drop(&mut self) {
        unsafe { xlib::XCloseDisplay(self.0) };
    }
}

unsafe fn frame_from_ximage(
    image: &xlib::XImage,
    width: u32,
    height: u32,
) -> Result<Frame, String> {
    let format = PixelFormat::from_x11(
        image.bits_per_pixel,
        image.byte_order == xlib::MSBFirst,
        image.red_mask,
        image.green_mask,
        image.blue_mask,
    );
    if let Some(format) = format {
        let stride = image.bytes_per_line as usize;
        let data = std::slice::from_raw_parts(image.data as *const u8, stride * height as usize);
        return Frame::new(data.to_vec(), width, height, stride, format);
    }

    // Uncommon visuals (16-bit, 30-bit, 24bpp packed): decode each pixel by its masks.
    let channel = |pixel: u64, mask: u64| -> u8 {
        let shift = mask.trailing_zeros();
        (((pixel & mask) >> shift) * 255)
            .checked_div(mask >> shift)
            .unwrap_or(0) as u8
    };
    let image_ptr = image as *const xlib::XImage as *mut xlib::XImage;
    let mut data = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height as i32 {
        for x in 0..width as i32 {
            let pixel = xlib::XGetPixel(image_ptr, x, y);
            data.extend_from_slice(&[
                channel(pixel, image.blue_mask),
                channel(pixel, image.green_mask),
                channel(pixel, image.red_mask),
                0,
            ]);
        }
    }
    Frame::new(data, width, height, width as usize * 4, PixelFormat::Bgrx)
}

pub struct LinuxSampler {
    display: XDisplay,
    frame: Option<Frame>,
}

impl LinuxSampler {
    pub fn new() -> Result<Self, String> {
        let display = XDisplay::open()?;
        display.capture(1, 1)?;
        Ok(LinuxSampler {
            display,
            frame: None,
        })
    }
}

impl PixelSampler for LinuxSampler {
    fn get_cursor_position(&self) -> Result<Point, String> {
        self.display.cursor_position()
    }

    fn sample_grid(
        &mut self,
        center_x: i32,
        center_y: i32,
        grid_size: usize,
    ) -> Result<Vec<Vec<Color>>, String> {
        if self.frame.is_none() {
            let (width, height) = self.display.screen_size();
            let frame = self.display.capture(width, height)?;
            eprintln!("Captured X11 screen: {}x{}", width, height);
            self.frame = Some(frame);
        }
        let frame = self.frame.as_ref().expect("frame captured above");
        Ok(frame.grid(center_x, center_y, grid_size, 1))
    }
}
