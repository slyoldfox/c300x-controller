import { Accessory, AudioRecordingCodecType, AudioRecordingSamplerate, CameraRecordingConfiguration, CameraRecordingDelegate, Characteristic, DoorbellController, H264Level, H264Profile, HDSProtocolSpecificErrorReason, RecordingPacket, Service, VideoCodecType } from "hap-nodejs";
import { Logger } from "./homekit-logger";
import { VideoConfig } from "./homekit-camera";
import { once } from "events";
import { AddressInfo, createServer, Server, Socket } from "net";
import { ChildProcess, spawn } from "child_process";
import assert from "assert";
import { safeKillFFmpeg } from "./ffmpeg";

// Local testing: ./ffmpeg -re -f lavfi -i "color=red:size=688x480:rate=15" -f lavfi  -i "sine=frequency=1000:b=4" -profile:v baseline -preset ultrafast -g 60 -vcodec libx264 -an -tune zerolatency -f rtp  "rtp://127.0.0.1:10002" -acodec speex -ar 8000 -vn -payload_type 110 -f rtp "rtp://127.0.0.1:10000"

interface MP4Atom {
    header: Buffer;
    length: number;
    type: string;
    data: Buffer;
}  

class MP4StreamingServer {
    readonly server: Server;
  
    /**
     * This can be configured to output ffmpeg debug output!
     */
    debugMode: boolean = false;
  
    readonly ffmpegPath: string;
    readonly args: string[];
  
    socket?: Socket;
    childProcess?: ChildProcess;
    destroyed = false;
  
    connectPromise: Promise<void>;
    connectResolve?: () => void;
  
    constructor( debugMode : boolean, ffmpegPath: string, ffmpegInput: Array<string>, audioOutputArgs: Array<string>, videoOutputArgs: Array<string>) {
      this.debugMode = debugMode
      this.connectPromise = new Promise(resolve => this.connectResolve = resolve);
  
      this.server = createServer(this.handleConnection.bind(this));
      this.ffmpegPath = ffmpegPath;
      this.args = [];
  
      this.args.push(...ffmpegInput);
  
      this.args.push(...audioOutputArgs);
  
      this.args.push("-f", "mp4");
      this.args.push(...videoOutputArgs);
      this.args.push("-fflags",
        "+genpts",
        "-reset_timestamps",
        "1");
      this.args.push(
        //"-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof+skip_sidx+skip_trailer",
      );
    }
  
    async start() {
      const promise = once(this.server, "listening");
      this.server.listen(); // listen on random port
      await promise;
  
      if (this.destroyed) {
        return;
      }
  
      const port = (this.server.address() as AddressInfo).port;
      this.args.push("tcp://127.0.0.1:" + port);
  
      console.log(this.ffmpegPath + " " + this.args.join(" "));
  
      this.childProcess = spawn(this.ffmpegPath, this.args, { env: process.env, stdio: this.debugMode? "pipe": "ignore" });
      if (!this.childProcess) {
        console.error("ChildProcess is undefined directly after the init!");
      }
      if(this.debugMode) {
        this.childProcess.stdout?.on("data", data => console.log(data.toString()));
        this.childProcess.stderr?.on("data", data => console.log(data.toString()));
      }
    }
  
    destroy() {
      safeKillFFmpeg(this.childProcess)
      this.socket?.destroy();
      //this.childProcess?.kill();
  
      this.socket = undefined;
      this.childProcess = undefined;
      this.destroyed = true;
    }
  
    handleConnection(socket: Socket): void {
      this.server.close(); // don't accept any further clients
      this.socket = socket;
      this.connectResolve?.();
    }
  
    /**
     * Generator for `MP4Atom`s.
     * Throws error to signal EOF when socket is closed.
     */
    async* generator(): AsyncGenerator<MP4Atom> {
      await this.connectPromise;
  
      if (!this.socket || !this.childProcess) {
        console.log("Socket undefined " + !!this.socket + " childProcess undefined " + !!this.childProcess);
        throw new Error("Unexpected state!");
      }
  
      while (true) {
        const header = await this.read(8);
        const length = header.readInt32BE(0) - 8;
        const type = header.slice(4).toString();
        const data = await this.read(length);
  
        yield {
          header: header,
          length: length,
          type: type,
          data: data,
        };
      }
    }
  
    async read(length: number): Promise<Buffer> {
      if (!this.socket) {
        throw Error("FFMPEG tried reading from closed socket!");
      }
  
      if (!length) {
        return Buffer.alloc(0);
      }
  
      const value = this.socket.read(length);
      if (value) {
        return value;
      }
  
      return new Promise((resolve, reject) => {
        const readHandler = () => {
          const value = this.socket!.read(length);
          if (value) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            cleanup();
            resolve(value);
          }
        };
  
        const endHandler = () => {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          cleanup();
          reject(new Error(`FFMPEG socket closed during read for ${length} bytes!`));
        };
  
        const cleanup = () => {
          this.socket?.removeListener("readable", readHandler);
          this.socket?.removeListener("close", endHandler);
        };
  
        if (!this.socket) {
          throw new Error("FFMPEG socket is closed now!");
        }
  
        this.socket.on("readable", readHandler);
        this.socket.on("close", endHandler);
      });
    }
  }

export class RecordingDelegate implements CameraRecordingDelegate {
    private controller : DoorbellController
    private readonly log: Logger = new Logger()
    private configuration: CameraRecordingConfiguration;
    private handlingStreamingRequest = false;
    private server?: MP4StreamingServer;


    constructor(private videoConfig : VideoConfig, private camera : Accessory) {
    }

    updateRecordingActive(active: boolean): void {
        this.log.debug(`Recording: ${active}`, this.videoConfig.displayName);
    }
    updateRecordingConfiguration(newConfiguration: CameraRecordingConfiguration): void {
        this.configuration = newConfiguration;
    }
    async *handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket, any, unknown> {
        assert(!!this.configuration);
        /**
         * With this flag you can control how the generator reacts to a reset to the motion trigger.
         * If set to true, the generator will send a proper endOfStream if the motion stops.
         * If set to false, the generator will run till the HomeKit Controller closes the stream.
         *
         * Note: In a real implementation you would most likely introduce a bit of a delay.
         */
        const STOP_AFTER_MOTION_STOP = false;
    
        this.handlingStreamingRequest = true;
    
        assert(this.configuration.videoCodec.type === VideoCodecType.H264);
    
        const profile = this.configuration.videoCodec.parameters.profile === H264Profile.HIGH ? "high"
          : this.configuration.videoCodec.parameters.profile === H264Profile.MAIN ? "main" : "baseline";
    
        const level = this.configuration.videoCodec.parameters.level === H264Level.LEVEL4_0 ? "4.0"
          : this.configuration.videoCodec.parameters.level === H264Level.LEVEL3_2 ? "3.2" : "3.1";
    
        /*
        const videoArgs: Array<string> = [
          "-an",
          "-sn",
          "-dn",
          "-codec:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
    
          "-profile:v", profile,
          "-level:v", level,
          "-preset", "ultrafast",
          "-g", "15",
          "-b:v", `${this.configuration.videoCodec.parameters.bitRate}k`,
          //"-force_key_frames", `expr:eq(t,n_forced*${this.configuration.videoCodec.parameters.iFrameInterval / 1000})`,
          "-r", this.configuration.videoCodec.resolution[2].toString(),
          //"-r", "15"
        ];
        */
        
        
        //const videoArgs : Array<string> = [ "-sn", "-dn", "-codec:v", "libx264", "-preset", "ultrafast", "-g", "60" ]
        const videoArgs : Array<string> = [ "-sn", "-dn", "-codec:v", "copy" ]
    
        let samplerate: string;
        switch (this.configuration.audioCodec.samplerate) {
        case AudioRecordingSamplerate.KHZ_8:
          samplerate = "8";
          break;
        case AudioRecordingSamplerate.KHZ_16:
          samplerate = "16";
          break;
        case AudioRecordingSamplerate.KHZ_24:
          samplerate = "24";
          break;
        case AudioRecordingSamplerate.KHZ_32:
          samplerate = "32";
          break;
        case AudioRecordingSamplerate.KHZ_44_1:
          samplerate = "44.1";
          break;
        case AudioRecordingSamplerate.KHZ_48:
          samplerate = "48";
          break;
        default:
          throw new Error("Unsupported audio samplerate: " + this.configuration.audioCodec.samplerate);
        }
    
        const audioArgs: Array<string> = this.controller?.recordingManagement?.recordingManagementService.getCharacteristic(Characteristic.RecordingAudioActive)
          ? [
            "-acodec", "libfdk_aac",
            ...(this.configuration.audioCodec.type === AudioRecordingCodecType.AAC_LC ?
              ["-profile:a", "aac_low"] :
              ["-profile:a", "aac_eld"]),
            "-ar", `${samplerate}k`,
            "-b:a", `${this.configuration.audioCodec.bitrate}k`,
            "-ac", `${this.configuration.audioCodec.audioChannels}`,
          ]
          : [];
    
        this.server = new MP4StreamingServer(
            this.videoConfig.debug,
            this.videoConfig.$internalVideoProcessor,
          ('-f rtsp ' + this.videoConfig.source + '-recorder' ).split(/\s+/g),
          audioArgs,
          videoArgs,
        );
    
        await this.server.start();
        if (!this.server || this.server.destroyed) {
          return; // early exit
        }
    
        const pending: Array<Buffer> = [];
    
        try {
          for await (const box of this.server.generator()) {
            pending.push(box.header, box.data);
    
            const motionDetected = this.camera.getService(Service.MotionSensor)?.getCharacteristic(Characteristic.MotionDetected).value;
    
            console.log("mp4 box type " + box.type + " and length " + box.length + " motion: " + motionDetected);
            if (box.type === "moov" || box.type === "mdat") {
              const fragment = Buffer.concat(pending);
              pending.splice(0, pending.length);
    
              const isLast = STOP_AFTER_MOTION_STOP && !motionDetected;
    
              yield {
                data: fragment,
                isLast: isLast,
              };
    
              if (isLast) {
                console.log("Ending session due to motion stopped!");
                break;
              }
            }
          }
        } catch (error) {
          if (!error.message.startsWith("FFMPEG")) { // cheap way of identifying our own emitted errors
            console.error("Encountered unexpected error on generator " + error.stack);
          }
        }
    }
    acknowledgeStream?(streamId: number): void {
        this.closeRecordingStream(streamId)
    }
    closeRecordingStream(streamId: number, reason?: HDSProtocolSpecificErrorReason): void {
        if (this.server) {
            this.server.destroy();
            this.server = undefined;
          }
          this.handlingStreamingRequest = false;
    }

    setController( controller : DoorbellController ) {
        this.controller = controller
    }    
}