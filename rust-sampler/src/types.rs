use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Color {
    pub const OUT_OF_BOUNDS: Color = Color::new(128, 128, 128);

    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Color { r, g, b }
    }

    pub fn hex_string(&self) -> String {
        format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b)
    }
}

impl Serialize for Color {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("Color", 4)?;
        s.serialize_field("r", &self.r)?;
        s.serialize_field("g", &self.g)?;
        s.serialize_field("b", &self.b)?;
        s.serialize_field("hex", &self.hex_string())?;
        s.end()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize)]
pub struct PixelData {
    pub cursor: Point,
    pub center: Color,
    pub grid: Vec<Vec<Color>>,
    pub timestamp: u64,
}

#[derive(Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "command")]
pub enum Command {
    #[serde(rename = "start")]
    Start { grid_size: usize, sample_rate: u64 },
    #[serde(rename = "update_grid")]
    UpdateGrid { grid_size: usize },
    #[serde(rename = "stop")]
    Stop,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

pub trait PixelSampler {
    fn get_cursor_position(&self) -> Result<Point, String>;

    /// Returns `grid_size` rows of `grid_size` colors centered on the given point,
    /// using `Color::OUT_OF_BOUNDS` for pixels off the screen.
    fn sample_grid(
        &mut self,
        center_x: i32,
        center_y: i32,
        grid_size: usize,
    ) -> Result<Vec<Vec<Color>>, String>;
}
