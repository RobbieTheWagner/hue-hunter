use crate::types::Color;

/// Byte order of a 4-byte pixel in memory. The fourth byte (alpha or padding) is ignored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PixelFormat {
    Bgrx,
    Rgbx,
    Xrgb,
    Xbgr,
}

impl PixelFormat {
    fn rgb_offsets(self) -> (usize, usize, usize) {
        match self {
            PixelFormat::Bgrx => (2, 1, 0),
            PixelFormat::Rgbx => (0, 1, 2),
            PixelFormat::Xrgb => (1, 2, 3),
            PixelFormat::Xbgr => (3, 2, 1),
        }
    }

    /// Maps a 32-bit-per-pixel X11 image layout to a byte order, or `None` when the
    /// layout needs per-pixel mask decoding.
    pub fn from_x11(
        bits_per_pixel: i32,
        msb_first: bool,
        red_mask: u64,
        green_mask: u64,
        blue_mask: u64,
    ) -> Option<Self> {
        if bits_per_pixel != 32 || green_mask != 0x00ff00 {
            return None;
        }
        match (red_mask, blue_mask, msb_first) {
            (0xff0000, 0x0000ff, false) => Some(PixelFormat::Bgrx),
            (0xff0000, 0x0000ff, true) => Some(PixelFormat::Xrgb),
            (0x0000ff, 0xff0000, false) => Some(PixelFormat::Rgbx),
            (0x0000ff, 0xff0000, true) => Some(PixelFormat::Xbgr),
            _ => None,
        }
    }
}

/// A captured screen image that pixels are read from after capture.
#[derive(Debug)]
pub struct Frame {
    data: Vec<u8>,
    width: u32,
    height: u32,
    stride: usize,
    format: PixelFormat,
}

impl Frame {
    pub fn new(
        data: Vec<u8>,
        width: u32,
        height: u32,
        stride: usize,
        format: PixelFormat,
    ) -> Result<Self, String> {
        if width == 0 || height == 0 {
            return Err(format!("Empty frame: {}x{}", width, height));
        }
        let overflow = || {
            format!(
                "Frame {}x{} with stride {} overflows",
                width, height, stride
            )
        };
        let row_bytes = (width as usize).checked_mul(4).ok_or_else(overflow)?;
        if stride < row_bytes {
            return Err(format!(
                "Stride {} is shorter than a {}px row",
                stride, width
            ));
        }
        let needed = (height as usize - 1)
            .checked_mul(stride)
            .and_then(|rows| rows.checked_add(row_bytes))
            .ok_or_else(overflow)?;
        if data.len() < needed {
            return Err(format!(
                "Frame buffer has {} bytes, {}x{} with stride {} needs {}",
                data.len(),
                width,
                height,
                stride,
                needed
            ));
        }
        Ok(Frame {
            data,
            width,
            height,
            stride,
            format,
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn pixel(&self, x: i32, y: i32) -> Color {
        if x < 0 || y < 0 || x as u32 >= self.width || y as u32 >= self.height {
            return Color::OUT_OF_BOUNDS;
        }
        let offset = y as usize * self.stride + x as usize * 4;
        let (r, g, b) = self.format.rgb_offsets();
        Color::new(
            self.data[offset + r],
            self.data[offset + g],
            self.data[offset + b],
        )
    }

    /// Samples `grid_size` x `grid_size` pixels around a center, `step` frame pixels
    /// apart. A step of 2 reads one pixel per logical point on a 2x HiDPI capture.
    pub fn grid(
        &self,
        center_x: i32,
        center_y: i32,
        grid_size: usize,
        step: i32,
    ) -> Vec<Vec<Color>> {
        let half = (grid_size / 2) as i32;
        (0..grid_size as i32)
            .map(|row| {
                (0..grid_size as i32)
                    .map(|col| {
                        self.pixel(
                            center_x + (col - half) * step,
                            center_y + (row - half) * step,
                        )
                    })
                    .collect()
            })
            .collect()
    }
}
