// Wayland capture through the XDG Desktop Portal ScreenCast API and PipeWire.
//
// Grabs one frame when the sampler starts, before the magnifier window is shown, and
// samples every grid from it. Wayland gives us no way to exclude our own window from
// a screencast, so a live stream would capture the magnifier.
//
// The cursor position comes from XWayland, which needs an X display.

use super::linux::XDisplay;
use crate::frame::{Frame, PixelFormat};
use crate::types::{Color, PixelSampler, Point};
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType};
use ashpd::desktop::PersistMode;
use pipewire as pw;
use pw::spa::param::video::{VideoFormat, VideoInfoRaw};
use std::cell::RefCell;
use std::os::fd::OwnedFd;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

const FRAME_TIMEOUT: Duration = Duration::from_secs(5);

/// Treats XWayland cursor coordinates as frame pixel coordinates, which holds for a
/// single monitor without scaling. Multi-monitor offsets and HiDPI scaling are not
/// handled because XWayland's coordinate space differs between compositors.
pub struct WaylandPortalSampler {
    display: XDisplay,
    frame: Frame,
}

struct Stream {
    fd: OwnedFd,
    node_id: u32,
}

impl WaylandPortalSampler {
    /// Asks the portal for screen access (a dialog unless a saved token is still
    /// valid) and captures one frame.
    pub fn new() -> Result<Self, String> {
        let display = XDisplay::open()
            .map_err(|e| format!("{} (needed for cursor tracking via XWayland)", e))?;

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create async runtime: {}", e))?;

        let frame = runtime.block_on(async {
            let screencast = Screencast::new()
                .await
                .map_err(|e| format!("Failed to connect to screencast portal: {}", e))?;
            let session = screencast
                .create_session()
                .await
                .map_err(|e| format!("Failed to create screencast session: {}", e))?;
            let restore_token = load_restore_token();
            screencast
                .select_sources(
                    &session,
                    CursorMode::Hidden,
                    SourceType::Monitor.into(),
                    false,
                    restore_token.as_deref(),
                    PersistMode::ExplicitlyRevoked,
                )
                .await
                .map_err(|e| format!("Failed to select screencast sources: {}", e))?;
            let response = screencast
                .start(&session, None)
                .await
                .map_err(|e| format!("Failed to start screencast: {}", e))?
                .response()
                .map_err(|e| format!("Screen capture permission denied: {}", e))?;

            if let Some(token) = response.restore_token() {
                if let Err(e) = save_restore_token(token) {
                    eprintln!("Warning: could not save screencast permission: {}", e);
                }
            }

            let info = response
                .streams()
                .first()
                .ok_or("Portal returned no PipeWire streams")?;
            let fd = screencast
                .open_pipe_wire_remote(&session)
                .await
                .map_err(|e| format!("Failed to open PipeWire remote: {}", e))?;
            let frame = capture_frame(Stream {
                fd,
                node_id: info.pipe_wire_node_id(),
            });
            let _ = session.close().await;
            frame
        })?;

        eprintln!(
            "Captured Wayland frame: {}x{}",
            frame.width(),
            frame.height()
        );

        Ok(WaylandPortalSampler { display, frame })
    }
}

impl PixelSampler for WaylandPortalSampler {
    fn get_cursor_position(&self) -> Result<Point, String> {
        self.display.cursor_position()
    }

    fn sample_grid(
        &mut self,
        center_x: i32,
        center_y: i32,
        grid_size: usize,
    ) -> Result<Vec<Vec<Color>>, String> {
        Ok(self.frame.grid(center_x, center_y, grid_size, 1))
    }
}

fn pixel_format(format: VideoFormat) -> Option<PixelFormat> {
    match format {
        VideoFormat::BGRx | VideoFormat::BGRA => Some(PixelFormat::Bgrx),
        VideoFormat::RGBx | VideoFormat::RGBA => Some(PixelFormat::Rgbx),
        VideoFormat::xRGB | VideoFormat::ARGB => Some(PixelFormat::Xrgb),
        VideoFormat::xBGR | VideoFormat::ABGR => Some(PixelFormat::Xbgr),
        _ => None,
    }
}

/// Connects to the portal's PipeWire remote and returns the first frame it sends.
fn capture_frame(stream_info: Stream) -> Result<Frame, String> {
    pw::init();
    let mainloop = pw::main_loop::MainLoopRc::new(None)
        .map_err(|e| format!("Failed to create PipeWire main loop: {}", e))?;
    let context = pw::context::ContextRc::new(&mainloop, None)
        .map_err(|e| format!("Failed to create PipeWire context: {}", e))?;
    let core = context
        .connect_fd_rc(stream_info.fd, None)
        .map_err(|e| format!("Failed to connect to PipeWire: {}", e))?;
    let stream = pw::stream::StreamBox::new(
        &core,
        "hue-hunter-screenshot",
        pw::properties::properties! {
            *pw::keys::MEDIA_TYPE => "Video",
            *pw::keys::MEDIA_CATEGORY => "Capture",
            *pw::keys::MEDIA_ROLE => "Screen",
        },
    )
    .map_err(|e| format!("Failed to create PipeWire stream: {}", e))?;

    let format: Rc<RefCell<Option<VideoInfoRaw>>> = Rc::new(RefCell::new(None));
    let result: Rc<RefCell<Option<Result<Frame, String>>>> = Rc::new(RefCell::new(None));

    let _listener = stream
        .add_local_listener_with_user_data(())
        .param_changed({
            let format = format.clone();
            move |_, _, id, param| {
                let Some(param) = param else { return };
                if id != pw::spa::param::ParamType::Format.as_raw() {
                    return;
                }
                let mut info = VideoInfoRaw::default();
                if info.parse(param).is_ok() {
                    *format.borrow_mut() = Some(info);
                }
            }
        })
        .process({
            let format = format.clone();
            let result = result.clone();
            let mainloop = mainloop.clone();
            move |stream, _| {
                if result.borrow().is_some() {
                    return;
                }
                let Some(info) = *format.borrow() else { return };
                let Some(mut buffer) = stream.dequeue_buffer() else {
                    return;
                };
                let Some(data) = buffer.datas_mut().first_mut() else {
                    return;
                };
                let chunk = data.chunk();
                let (offset, size) = (chunk.offset() as usize, chunk.size() as usize);
                let width = info.size().width;
                let stride = match chunk.stride() {
                    s if s > 0 => s as usize,
                    _ => width as usize * 4,
                };
                if size == 0 {
                    return;
                }
                let Some(bytes) = data.data().and_then(|d| d.get(offset..offset + size)) else {
                    *result.borrow_mut() = Some(Err(
                        "PipeWire buffer is not memory-mapped (DMA-BUF only?)".into(),
                    ));
                    mainloop.quit();
                    return;
                };
                let frame = match pixel_format(info.format()) {
                    Some(pixel_format) => Frame::new(
                        bytes.to_vec(),
                        width,
                        info.size().height,
                        stride,
                        pixel_format,
                    ),
                    None => Err(format!(
                        "Unsupported PipeWire video format {:?}",
                        info.format()
                    )),
                };
                *result.borrow_mut() = Some(frame);
                mainloop.quit();
            }
        })
        .register()
        .map_err(|e| format!("Failed to register stream listener: {}", e))?;

    stream
        .connect(
            pw::spa::utils::Direction::Input,
            Some(stream_info.node_id),
            pw::stream::StreamFlags::AUTOCONNECT | pw::stream::StreamFlags::MAP_BUFFERS,
            &mut [],
        )
        .map_err(|e| format!("Failed to connect PipeWire stream: {}", e))?;

    let timeout = mainloop.loop_().add_timer({
        let mainloop = mainloop.clone();
        move |_| mainloop.quit()
    });
    timeout
        .update_timer(Some(FRAME_TIMEOUT), None)
        .into_result()
        .map_err(|e| format!("Failed to arm PipeWire timeout: {}", e))?;

    mainloop.run();

    let frame = result.borrow_mut().take();
    frame.unwrap_or_else(|| {
        Err(format!(
            "No frame from PipeWire within {}s",
            FRAME_TIMEOUT.as_secs()
        ))
    })
}

fn token_path() -> Option<PathBuf> {
    Some(
        dirs::data_local_dir()?
            .join("hue-hunter")
            .join("screencast-token"),
    )
}

fn load_restore_token() -> Option<String> {
    std::fs::read_to_string(token_path()?).ok()
}

fn save_restore_token(token: &str) -> Result<(), String> {
    let path = token_path().ok_or("Could not find data directory")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, token).map_err(|e| e.to_string())
}
