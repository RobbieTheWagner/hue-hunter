use hue_hunter_sampler::sampling::run;
use hue_hunter_sampler::types::{Color, Command, PixelSampler, Point};
use serde_json::Value;
use std::io::{self, Write};
use std::sync::mpsc::{channel, Sender};

/// Returns a grid where each cell's red channel is its row, green is its column,
/// and blue is the frame number. Runs a scripted command after each frame.
struct FakeSampler {
    frame: u8,
    cursor: Vec<Result<Point, String>>,
    fail_frames: Vec<u8>,
    after_frame: Vec<(u8, Command)>,
    commands: Sender<Command>,
}

impl FakeSampler {
    fn new(commands: Sender<Command>, stop_after: u8) -> Self {
        FakeSampler {
            frame: 0,
            cursor: vec![],
            fail_frames: vec![],
            after_frame: vec![(stop_after, Command::Stop)],
            commands,
        }
    }
}

impl PixelSampler for FakeSampler {
    fn get_cursor_position(&self) -> Result<Point, String> {
        self.cursor
            .get(self.frame as usize)
            .cloned()
            .unwrap_or(Ok(Point { x: 10, y: 20 }))
    }

    fn sample_grid(&mut self, _x: i32, _y: i32, size: usize) -> Result<Vec<Vec<Color>>, String> {
        self.frame += 1;
        for (frame, command) in std::mem::take(&mut self.after_frame) {
            if frame == self.frame {
                self.commands.send(command).unwrap();
            } else {
                self.after_frame.push((frame, command));
            }
        }
        if self.fail_frames.contains(&self.frame) {
            return Err(format!("capture failed on frame {}", self.frame));
        }
        Ok((0..size)
            .map(|r| {
                (0..size)
                    .map(|c| Color::new(r as u8, c as u8, self.frame))
                    .collect()
            })
            .collect())
    }
}

fn session(
    stop_after: u8,
    configure: impl FnOnce(&mut FakeSampler),
    commands: Vec<Command>,
) -> Vec<Value> {
    let (tx, rx) = channel();
    let mut sampler = FakeSampler::new(tx.clone(), stop_after);
    configure(&mut sampler);
    for command in commands {
        tx.send(command).unwrap();
    }
    let mut out = Vec::new();
    run(&mut sampler, &rx, &mut out);
    String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

fn start(grid_size: usize) -> Command {
    Command::Start {
        grid_size,
        sample_rate: 1000,
    }
}

fn grid_len(line: &Value) -> usize {
    line["grid"].as_array().unwrap().len()
}

#[test]
fn emits_one_line_per_frame_until_stop() {
    let lines = session(3, |_| {}, vec![start(5)]);
    assert_eq!(lines.len(), 3);
    assert!(lines.iter().all(|l| grid_len(l) == 5));
}

#[test]
fn center_is_the_middle_cell_of_the_grid() {
    let lines = session(1, |_| {}, vec![start(5)]);
    assert_eq!(lines[0]["center"], lines[0]["grid"][2][2]);
    assert_eq!(lines[0]["center"]["hex"], "#020201");
    assert_eq!(lines[0]["cursor"], serde_json::json!({"x": 10, "y": 20}));
}

#[test]
fn update_grid_applies_from_the_next_frame() {
    let lines = session(
        3,
        |s| {
            s.after_frame
                .push((1, Command::UpdateGrid { grid_size: 9 }))
        },
        vec![start(5)],
    );
    assert_eq!(
        lines.iter().map(grid_len).collect::<Vec<_>>(),
        vec![5, 9, 9]
    );
}

#[test]
fn even_and_zero_grid_sizes_become_odd() {
    assert_eq!(grid_len(&session(1, |_| {}, vec![start(4)])[0]), 5);
    assert_eq!(grid_len(&session(1, |_| {}, vec![start(0)])[0]), 1);
    let lines = session(
        2,
        |s| {
            s.after_frame
                .push((1, Command::UpdateGrid { grid_size: 10 }))
        },
        vec![start(3)],
    );
    assert_eq!(grid_len(&lines[1]), 11);
}

#[test]
fn zero_sample_rate_does_not_crash() {
    let lines = session(
        1,
        |_| {},
        vec![Command::Start {
            grid_size: 3,
            sample_rate: 0,
        }],
    );
    assert_eq!(lines.len(), 1);
}

#[test]
fn capture_failure_reports_an_error_and_keeps_sampling() {
    let lines = session(3, |s| s.fail_frames.push(2), vec![start(3)]);
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[1]["error"], "capture failed on frame 2");
    assert_eq!(lines[2]["grid"][0][0]["b"], 3);
}

#[test]
fn cursor_failure_reuses_the_last_known_position() {
    let lines = session(
        2,
        |s| s.cursor = vec![Ok(Point { x: 7, y: 8 }), Err("lost pointer".into())],
        vec![start(3)],
    );
    assert_eq!(lines[1]["cursor"], serde_json::json!({"x": 7, "y": 8}));
}

#[test]
fn commands_before_start_produce_no_output() {
    let lines = session(
        1,
        |_| {},
        vec![
            Command::UpdateGrid { grid_size: 9 },
            Command::Stop,
            start(3),
        ],
    );
    assert!(lines.is_empty());
}

#[test]
fn returns_when_the_command_channel_closes() {
    let (tx, rx) = channel();
    let mut sampler = FakeSampler::new(channel().0, u8::MAX);
    tx.send(start(3)).unwrap();
    drop(tx);
    run(&mut sampler, &rx, &mut Vec::new());
}

struct ClosedPipe;

impl Write for ClosedPipe {
    fn write(&mut self, _: &[u8]) -> io::Result<usize> {
        Err(io::ErrorKind::BrokenPipe.into())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[test]
fn returns_when_stdout_is_closed() {
    let (tx, rx) = channel();
    let mut sampler = FakeSampler::new(tx.clone(), u8::MAX);
    tx.send(start(3)).unwrap();
    run(&mut sampler, &rx, &mut ClosedPipe);
    assert_eq!(sampler.frame, 1);
}
