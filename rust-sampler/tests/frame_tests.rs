use hue_hunter_sampler::frame::{Frame, PixelFormat};
use hue_hunter_sampler::types::Color;

/// Builds a frame whose pixel (x, y) has color (x, y, 7), laid out in `format`
/// with `padding` extra bytes at the end of each row.
fn frame(width: u32, height: u32, padding: usize, format: PixelFormat) -> Frame {
    let stride = width as usize * 4 + padding;
    let mut data = vec![0xEE; stride * height as usize];
    for y in 0..height as usize {
        for x in 0..width as usize {
            let (r, g, b) = (x as u8, y as u8, 7u8);
            let px = match format {
                PixelFormat::Bgrx => [b, g, r, 0xFF],
                PixelFormat::Rgbx => [r, g, b, 0xFF],
                PixelFormat::Xrgb => [0xFF, r, g, b],
                PixelFormat::Xbgr => [0xFF, b, g, r],
            };
            data[y * stride + x * 4..][..4].copy_from_slice(&px);
        }
    }
    Frame::new(data, width, height, stride, format).unwrap()
}

#[test]
fn decodes_every_pixel_format() {
    for format in [
        PixelFormat::Bgrx,
        PixelFormat::Rgbx,
        PixelFormat::Xrgb,
        PixelFormat::Xbgr,
    ] {
        let f = frame(4, 3, 0, format);
        assert_eq!(f.pixel(3, 2), Color::new(3, 2, 7), "{format:?}");
        assert_eq!(f.pixel(0, 0), Color::new(0, 0, 7), "{format:?}");
    }
}

#[test]
fn respects_row_padding() {
    let f = frame(5, 4, 12, PixelFormat::Bgrx);
    assert_eq!(f.pixel(4, 3), Color::new(4, 3, 7));
    assert_eq!(f.pixel(0, 1), Color::new(0, 1, 7));
}

#[test]
fn out_of_bounds_pixels_are_gray() {
    let f = frame(4, 4, 0, PixelFormat::Bgrx);
    for (x, y) in [(-1, 0), (0, -1), (4, 0), (0, 4), (i32::MIN, i32::MAX)] {
        assert_eq!(f.pixel(x, y), Color::OUT_OF_BOUNDS, "({x}, {y})");
    }
}

#[test]
fn grid_is_centered_on_the_point() {
    let f = frame(10, 10, 0, PixelFormat::Bgrx);
    let grid = f.grid(5, 6, 3, 1);
    assert_eq!(grid.len(), 3);
    assert!(grid.iter().all(|row| row.len() == 3));
    assert_eq!(grid[0][0], Color::new(4, 5, 7));
    assert_eq!(grid[1][1], Color::new(5, 6, 7));
    assert_eq!(grid[2][2], Color::new(6, 7, 7));
}

#[test]
fn grid_at_the_corner_fills_off_screen_cells_with_gray() {
    let f = frame(10, 10, 0, PixelFormat::Bgrx);
    let grid = f.grid(0, 0, 3, 1);
    assert_eq!(grid[0], vec![Color::OUT_OF_BOUNDS; 3]);
    assert_eq!(grid[1][0], Color::OUT_OF_BOUNDS);
    assert_eq!(grid[1][1], Color::new(0, 0, 7));
    assert_eq!(grid[2][2], Color::new(1, 1, 7));
}

#[test]
fn rejects_buffers_too_small_for_their_dimensions() {
    assert!(Frame::new(vec![0; 16], 2, 2, 8, PixelFormat::Bgrx).is_ok());
    assert!(Frame::new(vec![0; 15], 2, 2, 8, PixelFormat::Bgrx).is_err());
    assert!(Frame::new(vec![0; 64], 2, 2, 4, PixelFormat::Bgrx).is_err());
    assert!(Frame::new(vec![], 0, 0, 0, PixelFormat::Bgrx).is_err());
}

#[test]
fn last_row_does_not_need_trailing_padding() {
    assert!(Frame::new(vec![0; 16 + 8], 2, 2, 16, PixelFormat::Bgrx).is_ok());
}

#[test]
fn maps_x11_layouts_to_byte_orders() {
    let rgb = (0xff0000, 0x00ff00, 0x0000ff);
    let bgr = (0x0000ff, 0x00ff00, 0xff0000);
    assert_eq!(
        PixelFormat::from_x11(32, false, rgb.0, rgb.1, rgb.2),
        Some(PixelFormat::Bgrx)
    );
    assert_eq!(
        PixelFormat::from_x11(32, true, rgb.0, rgb.1, rgb.2),
        Some(PixelFormat::Xrgb)
    );
    assert_eq!(
        PixelFormat::from_x11(32, false, bgr.0, bgr.1, bgr.2),
        Some(PixelFormat::Rgbx)
    );
    assert_eq!(
        PixelFormat::from_x11(32, true, bgr.0, bgr.1, bgr.2),
        Some(PixelFormat::Xbgr)
    );
    assert_eq!(PixelFormat::from_x11(24, false, rgb.0, rgb.1, rgb.2), None);
    assert_eq!(
        PixelFormat::from_x11(16, false, 0xf800, 0x07e0, 0x001f),
        None
    );
    assert_eq!(
        PixelFormat::from_x11(32, false, 0x3ff00000, 0xffc00, 0x3ff),
        None
    );
}

#[test]
fn grid_step_skips_frame_pixels_for_hidpi_captures() {
    let f = frame(10, 10, 0, PixelFormat::Bgrx);
    let grid = f.grid(4, 4, 3, 2);
    assert_eq!(grid[0][0], Color::new(2, 2, 7));
    assert_eq!(grid[1][1], Color::new(4, 4, 7));
    assert_eq!(grid[2][2], Color::new(6, 6, 7));
}

#[test]
fn rejects_dimensions_whose_byte_length_overflows() {
    assert!(Frame::new(vec![0; 4], 1, 3, 1usize << 63, PixelFormat::Bgrx).is_err());
}
