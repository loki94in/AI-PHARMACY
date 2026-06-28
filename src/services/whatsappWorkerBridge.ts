import { eventService } from './eventService.js';

interface WaBridgeState {
  isReady: boolean;
  currentQr: string | null;
}

class WhatsappWorkerBridge {
  private state: WaBridgeState = { isReady: false, currentQr: null };

  handleWorkerMessage(msg: any): void {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'WA_QR':
        this.state.isReady = false;
        this.state.currentQr = msg.qr ?? null;
        break;
      case 'WA_READY':
        this.state.isReady = true;
        this.state.currentQr = null;
        break;
      case 'WA_DISCONNECTED':
        this.state.isReady = false;
        this.state.currentQr = null;
        break;
      case 'WA_EVENT':
        eventService.broadcast(msg.event, msg.data);
        break;
    }
  }

  getStatus(): WaBridgeState {
    return { ...this.state };
  }

  sendCommand(type: string, payload: Record<string, any> = {}): void {
    import('../worker/workerSupervisor.js')
      .then(({ workerSupervisor }) => {
        workerSupervisor.sendToWorker('whatsapp', { type, ...payload });
      })
      .catch(err => {
        console.error('[WhatsappBridge] Failed to send command to worker:', err);
      });
  }
}

export const whatsappWorkerBridge = new WhatsappWorkerBridge();
