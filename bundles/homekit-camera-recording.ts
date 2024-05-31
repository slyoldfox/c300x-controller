import { CameraRecordingConfiguration, CameraRecordingDelegate, HDSProtocolSpecificErrorReason, RecordingPacket } from "hap-nodejs";

export class RecordingDelegate implements CameraRecordingDelegate {
    updateRecordingActive(active: boolean): void {
        throw new Error("Method not implemented.");
    }
    updateRecordingConfiguration(configuration: CameraRecordingConfiguration): void {
        throw new Error("Method not implemented.");
    }
    handleRecordingStreamRequest(streamId: number): AsyncGenerator<RecordingPacket, any, unknown> {
        throw new Error("Method not implemented.");
    }
    acknowledgeStream?(streamId: number): void {
        throw new Error("Method not implemented.");
    }
    closeRecordingStream(streamId: number, reason: HDSProtocolSpecificErrorReason): void {
        throw new Error("Method not implemented.");
    }

}