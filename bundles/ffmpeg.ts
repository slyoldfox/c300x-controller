// Adapted from https://github.com/Sunoo/homebridge-camera-ffmpeg/blob/master/src/ffmpeg.ts
import child_process, { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Writable } from 'stream';
import { Logger } from './homekit-logger';
import { StreamingDelegate } from './homekit-camera';
import https, { RequestOptions } from "https";

type FfmpegProgress = {
  frame: number;
  fps: number;
  stream_q: number;
  bitrate: number;
  total_size: number;
  out_time_us: number;
  out_time: string;
  dup_frames: number;
  drop_frames: number;
  speed: number;
  progress: string;
};

const requestOptions : RequestOptions = {
  timeout: 2000,
  rejectUnauthorized: false,
}

const url: string = "https://github.com/slyoldfox/ffmpeg-for-bticino/releases/download/v2024.5.1/ffmpeg-"

function get(url : string, writeStream: fs.WriteStream, callback : Function) {
  https.get(url, requestOptions, (res) => {
    
    // if any other status codes are returned, those needed to be added here
    if(res.statusCode === 301 || res.statusCode === 302) {
      return get(res.headers.location, writeStream, callback)
    }

    console.log("[FFMPEG] File size is: " + res.headers["content-length"])
    res.pipe(writeStream)

    let filesize : number = Number( res.headers["content-length"] );
    let fetched : number = 0
    let lastReport = new Date()

    res.on("data", (chunk) => {
      fetched += chunk.length
      if( new Date().getTime() - lastReport.getTime() > 500 ) {
        let pct = Math.round( fetched / filesize * 100 )
        console.log(`[FFMPEG] Downloaded ${fetched}/${filesize} (${pct}%)`)
        lastReport = new Date()
      }
    });

    res.on("end", () => {
      writeStream.close( () => {
        callback()
      } )
      writeStream.end( () => {
        console.log("[FFMPEG] Download ended.")
      })
    });
  })
}

function checkAndFixPermissions(ffmpeg) {
  const perms = fs.constants.S_IROTH | fs.constants.S_IXOTH | fs.constants.S_IRUSR | fs.constants.S_IXUSR | fs.constants.S_IRGRP | fs.constants.S_IXGRP
    try {
     fs.accessSync(ffmpeg, fs.constants.R_OK | fs.constants.X_OK )
    } catch( e ) {
     fs.chmodSync(ffmpeg, perms )
    }  
}

function checkCorrupted(ffmpeg) {
  try {
    const response = child_process.execSync(ffmpeg + " -version").toString()
    console.log( "[FFMPEG] valid binary file.")
  } catch(e) {
    console.error("[FFMPEG] binary file corrupt? Removing it. Error: " + e)
    fs.rmSync(ffmpeg)
    
  }
}

export function fetchFffmpeg(pathName) {
  const platform_arch = process.platform + '-' + process.arch
  const ffmpeg = path.join(pathName, "ffmpeg")

  if( fs.existsSync(ffmpeg) ) {
    checkAndFixPermissions(ffmpeg)
    checkCorrupted(ffmpeg)
  }

  if( !fs.existsSync(ffmpeg) ) {
      console.info(`Could not find ffmpeg at ${ffmpeg}, installing ...`)
      const download_url = url + platform_arch
      let writeStream : fs.WriteStream = fs.createWriteStream(ffmpeg)

      switch( platform_arch ) {
          case "darwin-x64":
          case "linux-x64":
          case "linux-arm": //BTicino
            get(download_url, writeStream, () => {
              checkAndFixPermissions(ffmpeg)
              checkCorrupted(ffmpeg)
            });
            break;
          default:
              console.error(`Unsupported platform, install your own 'ffmpeg' binary at this path: ${ffmpeg}`)
        }
    }
    return ffmpeg
}

export class FfmpegProcess {
  private readonly process: ChildProcessWithoutNullStreams;
  private killTimeout?: NodeJS.Timeout;
  readonly stdin: Writable;

  constructor(cameraName: string, sessionId: string, videoProcessor: string, ffmpegArgs: string, log: Logger,
    debug = false, delegate: StreamingDelegate, callback?) {
    log.debug('Stream command: ' + videoProcessor + ' ' + ffmpegArgs, cameraName, debug);

    let started = false;
    const startTime = Date.now();
    this.process = spawn(videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
    this.stdin = this.process.stdin;

    this.process.stdout.on('data', (data) => {
      const progress = this.parseProgress(data);
      if (progress) {
        if (!started && progress.frame > 0) {
          started = true;
          const runtime = (Date.now() - startTime) / 1000;
          const message = 'Getting the first frames took ' + runtime + ' seconds.';
          if (runtime < 5) {
            log.debug(message, cameraName, debug);
          } else if (runtime < 22) {
            log.warn(message, cameraName);
          } else {
            log.error(message, cameraName);
          }
        }
      }
    });
    const stderr = readline.createInterface({
      input: this.process.stderr,
      terminal: false
    });
    stderr.on('line', (line: string) => {
      if (callback) {
        callback();
        callback = undefined;
      }
      if (debug && line.match(/\[(panic|fatal|error)\]/)) { // For now only write anything out when debug is set
        log.error(line, cameraName);
      } else if (debug) {
        log.debug(line, cameraName, true);
      }
    });
    this.process.on('error', (error: Error) => {
      log.error('FFmpeg process creation failed: ' + error.message, cameraName);
      if (callback) {
        callback(new Error('FFmpeg process creation failed'));
      }
      delegate.stopStream(sessionId);
    });
    this.process.on('exit', (code: number, signal: NodeJS.Signals) => {
      if (this.killTimeout) {
        clearTimeout(this.killTimeout);
      }

      const message = 'FFmpeg exited with code: ' + code + ' and signal: ' + signal;

      if (this.killTimeout && code === 0) {
        log.debug(message + ' (Expected)', cameraName, debug);
      } else if (code == null || code === 255) {
        if (this.process.killed) {
          log.debug(message + ' (Forced)', cameraName, debug);
        } else {
          log.error(message + ' (Unexpected)', cameraName);
        }
      } else {
        log.error(message + ' (Error)', cameraName);
        delegate.stopStream(sessionId);
        if (!started && callback) {
          callback(new Error(message));
        } else {
          delegate.controller.forceStopStreamingSession(sessionId);
        }
      }
    });
  }

  parseProgress(data: Uint8Array): FfmpegProgress | undefined {
    const input = data.toString();

    if (input.indexOf('frame=') == 0) {
      try {
        const progress = new Map<string, string>();
        input.split(/\r?\n/).forEach((line) => {
          const split = line.split('=', 2);
          progress.set(split[0], split[1]);
        });

        return {
          frame: parseInt(progress.get('frame')!),
          fps: parseFloat(progress.get('fps')!),
          stream_q: parseFloat(progress.get('stream_0_0_q')!),
          bitrate: parseFloat(progress.get('bitrate')!),
          total_size: parseInt(progress.get('total_size')!),
          out_time_us: parseInt(progress.get('out_time_us')!),
          out_time: progress.get('out_time')!.trim(),
          dup_frames: parseInt(progress.get('dup_frames')!),
          drop_frames: parseInt(progress.get('drop_frames')!),
          speed: parseFloat(progress.get('speed')!),
          progress: progress.get('progress')!.trim()
        };
      } catch {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  public stop(): void {
    this.process.stdin.write('q' + os.EOL);
    this.killTimeout = setTimeout(() => {
      this.process.kill('SIGKILL');
    }, 2 * 1000);
  }
}
