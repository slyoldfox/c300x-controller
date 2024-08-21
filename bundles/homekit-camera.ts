// Adapted from https://github.com/Sunoo/homebridge-camera-ffmpeg/blob/master/src/streamingDelegate.ts
import { SnapshotRequest, SnapshotRequestCallback, PrepareStreamCallback, PrepareStreamRequest, StreamRequestCallback, StreamingRequest, CameraStreamingDelegate, PrepareStreamResponse, StreamRequestTypes, AudioStreamingCodecType, StartStreamRequest, VideoInfo, DoorbellController, ResourceRequestReason, MDNSAdvertiser } from 'hap-nodejs';
import { spawn } from 'child_process';
import { CameraController, SRTPCryptoSuites } from 'hap-nodejs';
import pickPort, { pickPortOptions } from 'pick-port';
import { createSocket, Socket } from 'dgram';
import { FfmpegProcess, safeKillFFmpeg } from './ffmpeg';
import { Logger } from './homekit-logger';

export type VideoConfig = {
  source?: string;
  stillImageSourceCacheTime?: number
  stillImageSource?: string;
  returnAudioTarget?: string;
  maxStreams?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFPS?: number;
  maxBitrate?: number;
  forceMax?: boolean;
  vcodec?: string;
  packetSize?: number;
  videoFilter?: string;
  encoderOptions?: string;
  mapvideo?: string;
  mapaudio?: string;
  audio?: boolean;
  debug?: boolean;
  debugReturn?: boolean;
  videoProcessor?: string;
  $internalVideoProcessor: string;
  advertiser?: MDNSAdvertiser;
  hksv: boolean
  username?: string;
  pinCode: string;
  displayName: string;
};

type ResolutionInfo = {
  width: number;
  height: number;
  videoFilter?: string;
  snapFilter?: string;
  resizeFilter?: string;
};

type SessionInfo = {
  address: string; // address of the HAP controller
  ipv6: boolean;

  videoPort: number;
  videoReturnPort: number;
  videoCryptoSuite: SRTPCryptoSuites; // should be saved if multiple suites are supported
  videoSRTP: Buffer; // key and salt concatenated
  videoSSRC: number; // rtp synchronisation source

  audioPort: number;
  audioReturnPort: number;
  audioCryptoSuite: SRTPCryptoSuites;
  audioSRTP: Buffer;
  audioSSRC: number;
};

type ActiveSession = {
  mainProcess?: FfmpegProcess;
  returnProcess?: FfmpegProcess;
  timeout?: NodeJS.Timeout;
  socket?: Socket;
};

export class StreamingDelegate implements CameraStreamingDelegate {
    private readonly log: Logger = new Logger()
    private readonly cameraName: string;
    private readonly unbridge: boolean;
    private readonly videoConfig: VideoConfig;
    private readonly videoProcessor: string;
    controller: DoorbellController;
    private snapshotPromise?: Promise<Buffer>;
  
    // keep track of sessions
    pendingSessions: Map<string, SessionInfo> = new Map();
    ongoingSessions: Map<string, ActiveSession> = new Map();
    timeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(videoConfig: VideoConfig) { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
      this.cameraName = videoConfig.displayName;
      this.unbridge = true;
      this.videoConfig = videoConfig!;
      this.videoProcessor = videoConfig.videoProcessor || videoConfig.$internalVideoProcessor;
    }

    setController( controller : DoorbellController ) {
      this.controller = controller
    }
  
    private determineResolution(request: SnapshotRequest | VideoInfo, isSnapshot: boolean): ResolutionInfo {
      const resInfo: ResolutionInfo = {
        width: request.width,
        height: request.height
      };
      if (!isSnapshot) {
        if (this.videoConfig.maxWidth !== undefined &&
          (this.videoConfig.forceMax || request.width > this.videoConfig.maxWidth)) {
          resInfo.width = this.videoConfig.maxWidth;
        }
        if (this.videoConfig.maxHeight !== undefined &&
          (this.videoConfig.forceMax || request.height > this.videoConfig.maxHeight)) {
          resInfo.height = this.videoConfig.maxHeight;
        }
      }
  
      const filters: Array<string> = this.videoConfig.videoFilter?.split(',') || [];
      const noneFilter = filters.indexOf('none');
      if (noneFilter >= 0) {
        filters.splice(noneFilter, 1);
      }
      resInfo.snapFilter = filters.join(',');
      if ((noneFilter < 0) && (resInfo.width > 0 || resInfo.height > 0)) {
        resInfo.resizeFilter = 'scale=' + (resInfo.width > 0 ? '\'min(' + resInfo.width + ',iw)\'' : 'iw') + ':' +
        (resInfo.height > 0 ? '\'min(' + resInfo.height + ',ih)\'' : 'ih') +
        ':force_original_aspect_ratio=decrease';
        filters.push(resInfo.resizeFilter);
        filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2'); // Force to fit encoder restrictions
      }
  
      if (filters.length > 0) {
        resInfo.videoFilter = filters.join(',');
      }
  
      return resInfo;
    }
  
    fetchSnapshot(snapFilter?: string): Promise<Buffer> {
      const stillImageSourceCacheTime = this.videoConfig.stillImageSourceCacheTime || (5 * 60 * 1000)
      this.snapshotPromise = new Promise((resolve, reject) => {
        const startTime = Date.now();
        const ffmpegArgs = (this.videoConfig.stillImageSource || this.videoConfig.source!) + // Still
          ' -frames:v 1' +
          (snapFilter ? ' -filter:v ' + snapFilter : '') +
          ' -f image2 -' +
          ' -hide_banner' +
          ' -loglevel error';
  
        this.log.debug('Snapshot command: ' + this.videoProcessor + ' ' + ffmpegArgs, this.cameraName, this.videoConfig.debug);
        const ffmpeg = spawn(this.videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
        const t = setTimeout(() => {
          safeKillFFmpeg(ffmpeg)
          reject(new Error("Operation timed out creating snapshot"))
        } , 6000);
        let snapshotBuffer = Buffer.alloc(0);
        ffmpeg.stdout.on('data', (data) => {
          snapshotBuffer = Buffer.concat([snapshotBuffer, data]);
        });
        ffmpeg.on('error', (error: Error) => {
          clearTimeout(t)
          reject('FFmpeg process creation failed: ' + error.message);
        });
        ffmpeg.stderr.on('data', (data) => {
          data.toString().split('\n').forEach((line: string) => {
            if (this.videoConfig.debug && line.length > 0) { // For now only write anything out when debug is set
              this.log.error(line, this.cameraName + '] [Snapshot');
            }
          });
        });
        ffmpeg.on('close', () => {
          if (snapshotBuffer.length > 0) {
            clearTimeout(t)
            resolve(snapshotBuffer);
          } else {
            clearTimeout(t)
            reject('Failed to fetch snapshot.');
          }
  
          setTimeout(() => {
            this.snapshotPromise = undefined;
          }, stillImageSourceCacheTime); // Expire cached snapshot after 5 minutes
  
          const runtime = (Date.now() - startTime) / 1000;
          let message = 'Fetching snapshot took ' + runtime + ' seconds.';
          if (runtime < 5) {
            //this.log.debug(message, this.cameraName, this.videoConfig.debug);
          } else {
            if (!this.unbridge) {
              message += ' It is highly recommended you switch to unbridge mode.';
            }
            if (runtime < 22) {
              this.log.warn(message, this.cameraName);
            } else {
              message += ' The request has timed out and the snapshot has not been refreshed in HomeKit.';
              this.log.error(message, this.cameraName);
            }
          }
        });
      });
      return this.snapshotPromise;
    }
  
    resizeSnapshot(snapshot: Buffer, resizeFilter?: string): Promise<Buffer> {
      return new Promise<Buffer>((resolve, reject) => {
        const ffmpegArgs = '-i pipe:' + // Resize
          ' -frames:v 1' +
          (resizeFilter ? ' -filter:v ' + resizeFilter : '') +
          ' -f image2 -';
  
        //this.log.debug('Resize command: ' + this.videoProcessor + ' ' + ffmpegArgs, this.cameraName, this.videoConfig.debug);
        const ffmpeg = spawn(this.videoProcessor, ffmpegArgs.split(/\s+/), { env: process.env });
  
        let resizeBuffer = Buffer.alloc(0);
        ffmpeg.stdout.on('data', (data) => {
          resizeBuffer = Buffer.concat([resizeBuffer, data]);
        });
        ffmpeg.on('error', (error: Error) => {
          reject('FFmpeg process creation failed: ' + error.message);
        });
        ffmpeg.on('close', () => {
          resolve(resizeBuffer);
        });
        ffmpeg.stdin.end(snapshot);
      });
    }
  
    async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
      const resolution = this.determineResolution(request, true);
  
      try {
        const reason = request.reason === ResourceRequestReason.EVENT ? 'event' : 'periodic';
        if( reason === 'event' ) {
          this.snapshotPromise = undefined
        }

        const cachedSnapshot = !!this.snapshotPromise;

        const now = Date.now()
        
        //this.log.debug('Snapshot requested: ' + request.width + ' x ' + request.height,
        //  this.cameraName, this.videoConfig.debug);
  
        const snapshot = await (this.snapshotPromise || this.fetchSnapshot(resolution.snapFilter));
  
        //this.log.debug('Sending snapshot: ' + (resolution.width > 0 ? resolution.width : 'native') + ' x ' +
        //  (resolution.height > 0 ? resolution.height : 'native') +
        //  (cachedSnapshot ? ' (cached)' : ''), this.cameraName, this.videoConfig.debug);

        //const resized = await this.resizeSnapshot(snapshot, resolution.resizeFilter);
        if(!cachedSnapshot)
          this.log.debug("Snapshot took: " + (Date.now() - now) + "ms", this.cameraName, this.videoConfig.debug)
        callback(undefined, snapshot);

      } catch (err) {
        this.snapshotPromise = undefined
        this.log.error(err as string, this.cameraName);
        callback();
      }
    }
  
    async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
      const ipv6 = request.addressVersion === 'ipv6';
  
      const options: pickPortOptions = {
        type: 'udp',
        ip: ipv6 ? '::' : '0.0.0.0',
        reserveTimeout: 15
      };
      const videoReturnPort = await pickPort(options);
      const videoSSRC = CameraController.generateSynchronisationSource();
      const audioReturnPort = await pickPort(options);
      const audioSSRC = CameraController.generateSynchronisationSource();
  
      const sessionInfo: SessionInfo = {
        address: request.targetAddress,
        ipv6: ipv6,
  
        videoPort: request.video.port,
        videoReturnPort: videoReturnPort,
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
        videoSSRC: videoSSRC,
  
        audioPort: request.audio.port,
        audioReturnPort: audioReturnPort,
        audioCryptoSuite: request.audio.srtpCryptoSuite,
        audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
        audioSSRC: audioSSRC
      };
  
      const response: PrepareStreamResponse = {
        video: {
          port: videoReturnPort,
          ssrc: videoSSRC,
  
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt
        },
        audio: {
          port: audioReturnPort,
          ssrc: audioSSRC,
  
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt
        }
      };
  
      this.pendingSessions.set(request.sessionID, sessionInfo);
      callback(undefined, response);
    }
  
    private startStream(request: StartStreamRequest, callback: StreamRequestCallback): void{
      const sessionInfo = this.pendingSessions.get(request.sessionID);
      if (sessionInfo) {
        const vcodec = this.videoConfig.vcodec || 'libx264';
        const mtu = this.videoConfig.packetSize || 1316; // request.video.mtu is not used
        let encoderOptions = this.videoConfig.encoderOptions;
        if (!encoderOptions && vcodec === 'libx264') {
          encoderOptions = '-preset ultrafast -tune zerolatency';
        }
  
        const resolution = this.determineResolution(request.video, false);
  
        let fps = (this.videoConfig.maxFPS !== undefined &&
          (this.videoConfig.forceMax || request.video.fps > this.videoConfig.maxFPS)) ?
          this.videoConfig.maxFPS : request.video.fps;
        let videoBitrate = (this.videoConfig.maxBitrate !== undefined &&
          (this.videoConfig.forceMax || request.video.max_bit_rate > this.videoConfig.maxBitrate)) ?
          this.videoConfig.maxBitrate : request.video.max_bit_rate;
  
        if (vcodec === 'copy') {
          resolution.width = 0;
          resolution.height = 0;
          resolution.videoFilter = undefined;
          fps = 0;
          videoBitrate = 0;
        }
  
        this.log.debug('Video stream requested: ' + request.video.width + ' x ' + request.video.height + ', ' +
          request.video.fps + ' fps, ' + request.video.max_bit_rate + ' kbps', this.cameraName, this.videoConfig.debug);
        this.log.info('Starting video stream: ' + (resolution.width > 0 ? resolution.width : 'native') + ' x ' +
          (resolution.height > 0 ? resolution.height : 'native') + ', ' + (fps > 0 ? fps : 'native') +
          ' fps, ' + (videoBitrate > 0 ? videoBitrate : '???') + ' kbps' +
          (this.videoConfig.audio ? (' (' + request.audio.codec + ')') : ''), this.cameraName);
  
        let ffmpegArgs = this.videoConfig.source!;
  
        ffmpegArgs += // Video
          (this.videoConfig.mapvideo ? ' -map ' + this.videoConfig.mapvideo : ' -an -sn -dn') +
          ' -codec:v ' + vcodec +
          ' -pix_fmt yuv420p' +
          ' -color_range mpeg' +
          (fps > 0 ? ' -r ' + fps : '') +
          ' -f rawvideo' +
          (encoderOptions ? ' ' + encoderOptions : '') +
          (resolution.videoFilter ? ' -filter:v ' + resolution.videoFilter : '') +
          (videoBitrate > 0 ? ' -b:v ' + videoBitrate + 'k' : '') +
          ' -payload_type ' + request.video.pt;
  
        ffmpegArgs += // Video Stream
          ' -ssrc ' + sessionInfo.videoSSRC +
          ' -f rtp' +
          ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
          ' -srtp_out_params ' + sessionInfo.videoSRTP.toString('base64') +
          ' srtp://' + sessionInfo.address + ':' + sessionInfo.videoPort +
          '?rtcpport=' + sessionInfo.videoPort + '&pkt_size=' + mtu;
  
        if (this.videoConfig.audio) {
          if (request.audio.codec === AudioStreamingCodecType.OPUS || request.audio.codec === AudioStreamingCodecType.AAC_ELD) {
            ffmpegArgs += // Audio
              (this.videoConfig.mapaudio ? ' -map ' + this.videoConfig.mapaudio : ' -vn -sn -dn') +
              (request.audio.codec === AudioStreamingCodecType.OPUS ?
                ' -codec:a libopus' +
                ' -application lowdelay' :
                ' -codec:a libfdk_aac' +
                ' -profile:a aac_eld') +
              ' -flags +global_header' +
              ' -f null' +
              ' -ar ' + request.audio.sample_rate + 'k' +
              ' -b:a ' + request.audio.max_bit_rate + 'k' +
              ' -bufsize ' + (request.audio.sample_rate * 4) + 'k' +
              ' -ac ' + request.audio.channel +
              ' -payload_type ' + request.audio.pt;
  
            ffmpegArgs += // Audio Stream
              ' -ssrc ' + sessionInfo.audioSSRC +
              ' -f rtp' +
              ' -srtp_out_suite AES_CM_128_HMAC_SHA1_80' +
              ' -srtp_out_params ' + sessionInfo.audioSRTP.toString('base64') +
              ' srtp://' + sessionInfo.address + ':' + sessionInfo.audioPort +
              '?rtcpport=' + sessionInfo.audioPort + '&pkt_size=188';
          } else {
            this.log.error('Unsupported audio codec requested: ' + request.audio.codec, this.cameraName);
          }
        }
  
        ffmpegArgs += ' -loglevel level' + (this.videoConfig.debug ? '+verbose' : '') +
          ' -progress pipe:1';
  
        const activeSession: ActiveSession = {};
  
        activeSession.socket = createSocket(sessionInfo.ipv6 ? 'udp6' : 'udp4');
        activeSession.socket.on('error', (err: Error) => {
          this.log.error('Socket error: ' + err.message, this.cameraName);
          this.stopStream(request.sessionID);
        });
        activeSession.socket.on('message', () => {
          if (activeSession.timeout) {
            clearTimeout(activeSession.timeout);
          }
          activeSession.timeout = setTimeout(() => {
            this.log.info('Device appears to be inactive. Stopping stream.', this.cameraName);
            this.controller.forceStopStreamingSession(request.sessionID);
            this.stopStream(request.sessionID);
          }, request.video.rtcp_interval * 5 * 1000);
        });
        activeSession.socket.bind(sessionInfo.videoReturnPort);
  
        activeSession.mainProcess = new FfmpegProcess(this.cameraName, request.sessionID, this.videoProcessor,
          ffmpegArgs, this.log, this.videoConfig.debug, this, callback);
  
        if (this.videoConfig.returnAudioTarget) {
          const ffmpegReturnArgs =
            '-hide_banner' +
            ' -protocol_whitelist pipe,udp,rtp,file,crypto' +
            ' -f sdp' +
            ' -c:a libfdk_aac' +
            ' -i pipe:' +
            ' ' + this.videoConfig.returnAudioTarget +
            ' -loglevel level' + (this.videoConfig.debugReturn ? '+verbose' : '');
  
          const ipVer = sessionInfo.ipv6 ? 'IP6' : 'IP4';
  
          const sdpReturnAudio =
            'v=0\r\n' +
            'o=- 0 0 IN ' + ipVer + ' ' + sessionInfo.address + '\r\n' +
            's=Talk\r\n' +
            'c=IN ' + ipVer + ' ' + sessionInfo.address + '\r\n' +
            't=0 0\r\n' +
            'm=audio ' + sessionInfo.audioReturnPort + ' RTP/AVP 110\r\n' +
            'b=AS:24\r\n' +
            'a=rtpmap:110 MPEG4-GENERIC/16000/1\r\n' +
            'a=rtcp-mux\r\n' + // FFmpeg ignores this, but might as well
            'a=fmtp:110 ' +
              'profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3; ' +
              'config=F8F0212C00BC00\r\n' +
            'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:' + sessionInfo.audioSRTP.toString('base64') + '\r\n';
          activeSession.returnProcess = new FfmpegProcess(this.cameraName + '] [Two-way', request.sessionID,
            this.videoProcessor, ffmpegReturnArgs, this.log, this.videoConfig.debugReturn, this);
          activeSession.returnProcess.stdin.end(sdpReturnAudio);
        }
  
        this.ongoingSessions.set(request.sessionID, activeSession);
        this.pendingSessions.delete(request.sessionID);
      } else {
        this.log.error('Error finding session information.', this.cameraName);
        callback(new Error('Error finding session information'));
      }
    }
  
    handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
      switch (request.type) {
        case StreamRequestTypes.START:
          this.startStream(request, callback);
          break;
        case StreamRequestTypes.RECONFIGURE:
          this.log.debug('Received request to reconfigure: ' + request.video.width + ' x ' + request.video.height + ', ' +
            request.video.fps + ' fps, ' + request.video.max_bit_rate + ' kbps (Ignored)', this.cameraName, this.videoConfig.debug);
          callback();
          break;
        case StreamRequestTypes.STOP:
          this.stopStream(request.sessionID);
          callback();
          break;
      }
    }
  
    public stopStream(sessionId: string): void {
      const session = this.ongoingSessions.get(sessionId);
      if (session) {
        if (session.timeout) {
          clearTimeout(session.timeout);
        }
        try {
          session.socket?.close();
        } catch (err) {
          this.log.error('Error occurred closing socket: ' + err, this.cameraName);
        }
        try {
          session.mainProcess?.stop();
        } catch (err) {
          this.log.error('Error occurred terminating main FFmpeg process: ' + err, this.cameraName);
        }
        try {
          session.returnProcess?.stop();
        } catch (err) {
          this.log.error('Error occurred terminating two-way FFmpeg process: ' + err, this.cameraName);
        }
      }
      this.ongoingSessions.delete(sessionId);
      this.log.info('Stopped video stream.', this.cameraName);
    }
  }