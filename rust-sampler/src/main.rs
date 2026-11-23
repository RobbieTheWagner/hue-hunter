use hue_hunter_sampler::sampler::create_sampler;
use hue_hunter_sampler::sampling::{self, write_line};
use hue_hunter_sampler::types::{Command, ErrorResponse};
use std::io::{self, BufRead};
use std::sync::mpsc::channel;
use std::thread;

fn main() {
    let mut sampler = match create_sampler() {
        Ok(sampler) => sampler,
        Err(error) => {
            eprintln!("Fatal error: {}", error);
            let _ = write_line(&mut io::stdout(), &ErrorResponse { error });
            std::process::exit(1);
        }
    };

    let (commands_tx, commands) = channel();
    thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Command>(line) {
                Ok(command) => {
                    if commands_tx.send(command).is_err() {
                        return;
                    }
                }
                Err(e) => eprintln!("Ignoring unparseable command {}: {}", line, e),
            }
        }
        let _ = commands_tx.send(Command::Stop);
    });

    sampling::run(&mut *sampler, &commands, &mut io::stdout().lock());
}
