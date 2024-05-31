// Adapted from https://github.com/Sunoo/homebridge-camera-ffmpeg/blob/master/src/logger.ts
export class Logger {
    private formatMessage(message: string, device?: string): string {
        let formatted = '';
        if (device) {
          formatted += '[' + device + '] ';
        }
        formatted += message;
        return formatted;
      }
    
      public info(message: string, device?: string): void {
        console.info(this.formatMessage(message, device));
      }
    
      public warn(message: string, device?: string): void {
        console.warn(this.formatMessage(message, device));
      }
    
      public error(message: string, device?: string): void {
        console.error(this.formatMessage(message, device));
      }
    
      public debug(message: string, device?: string, alwaysLog = false): void {
        console.debug(this.formatMessage(message, device));
      }    
}