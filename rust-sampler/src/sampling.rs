use crate::types::{Color, Command, ErrorResponse, PixelData, PixelSampler, Point};
use std::io::Write;
use std::sync::mpsc::{Receiver, TryRecvError};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Grid sizes must be odd so there is a center pixel, and at least 1.
pub fn normalize_grid_size(grid_size: usize) -> usize {
    grid_size.max(1) | 1
}

/// Waits for `start`, then samples until `stop`, EOF, or a closed output stream.
pub fn run(sampler: &mut dyn PixelSampler, commands: &Receiver<Command>, out: &mut dyn Write) {
    while let Ok(command) = commands.recv() {
        match command {
            Command::Start {
                grid_size,
                sample_rate,
            } => {
                eprintln!(
                    "Starting sampling: grid_size={}, sample_rate={}",
                    grid_size, sample_rate
                );
                let _ = sample_loop(sampler, grid_size, sample_rate, commands, out);
                return;
            }
            Command::UpdateGrid { .. } => {
                eprintln!("update_grid received before start (ignored)");
            }
            Command::Stop => return,
        }
    }
}

fn sample_loop(
    sampler: &mut dyn PixelSampler,
    grid_size: usize,
    sample_rate: u64,
    commands: &Receiver<Command>,
    out: &mut dyn Write,
) -> std::io::Result<()> {
    let interval = Duration::from_micros(1_000_000 / sample_rate.max(1));
    let mut grid_size = normalize_grid_size(grid_size);
    let mut cursor = Point { x: 0, y: 0 };

    loop {
        loop {
            match commands.try_recv() {
                Ok(Command::UpdateGrid { grid_size: size }) => {
                    grid_size = normalize_grid_size(size)
                }
                Ok(Command::Start { .. }) => eprintln!("Ignoring start while already sampling"),
                Ok(Command::Stop) | Err(TryRecvError::Disconnected) => return Ok(()),
                Err(TryRecvError::Empty) => break,
            }
        }

        let frame_start = Instant::now();

        if let Ok(position) = sampler.get_cursor_position() {
            cursor = position;
        }

        match sampler.sample_grid(cursor.x, cursor.y, grid_size) {
            Ok(grid) => {
                let half = grid_size / 2;
                let center = grid
                    .get(half)
                    .and_then(|row| row.get(half))
                    .copied()
                    .unwrap_or(Color::OUT_OF_BOUNDS);
                let data = PixelData {
                    cursor,
                    center,
                    grid,
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map_or(0, |d| d.as_millis() as u64),
                };
                write_line(out, &data)?;
            }
            Err(error) => {
                eprintln!("Failed to sample grid: {}", error);
                write_line(out, &ErrorResponse { error })?;
            }
        }

        if let Some(remaining) = interval.checked_sub(frame_start.elapsed()) {
            std::thread::sleep(remaining);
        }
    }
}

pub fn write_line<T: serde::Serialize>(out: &mut dyn Write, value: &T) -> std::io::Result<()> {
    let json = serde_json::to_string(value).map_err(std::io::Error::other)?;
    writeln!(out, "{}", json)?;
    out.flush()
}
