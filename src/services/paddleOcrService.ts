import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getWslPath(winPath: string): string {
  const normalized = path.normalize(winPath).replace(/\\/g, '/');
  const match = normalized.match(/^([a-zA-Z]):\/(.*)/);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2];
    return `/mnt/${drive}/${rest}`;
  }
  return normalized;
}

class PaddleOcrService {
  private pythonCommand: string = 'python';
  private serverScriptPath: string;
  private isAvailableChecked: boolean = false;
  private isOcrAvailable: boolean = false;
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string = 'http://127.0.0.1:8000';

  constructor() {
    this.serverScriptPath = path.resolve(__dirname, 'ocr_server.py');
    
    // Ensure we kill the python server when node exits
    process.on('exit', () => this.killServer());
    process.on('SIGINT', () => { this.killServer(); process.exit(); });
    process.on('SIGTERM', () => { this.killServer(); process.exit(); });
  }

  private killServer() {
    if (this.serverProcess) {
      try {
        this.serverProcess.kill('SIGINT');
      } catch (e) {}
      this.serverProcess = null;
    }
  }

  /**
   * Checks if Python and PaddleOCR dependencies are available, and starts the background server.
   */
  public async checkAvailability(): Promise<boolean> {
    if (this.isAvailableChecked) {
      return this.isOcrAvailable;
    }

    this.isAvailableChecked = true;

    // Check PYTHON_PATH environment variable first
    if (process.env.PYTHON_PATH) {
      const available = await this.startPythonServer(process.env.PYTHON_PATH);
      if (available) {
        this.pythonCommand = process.env.PYTHON_PATH;
        this.isOcrAvailable = true;
        return true;
      }
    }

    // Fallbacks
    const fallbacks = ['python', 'python3', 'wsl python3'];
    for (const cmd of fallbacks) {
      if (await this.startPythonServer(cmd)) {
        this.pythonCommand = cmd;
        this.isOcrAvailable = true;
        return true;
      }
    }

    console.warn('[AICamera] Python environment or paddleocr packages not found. Falling back to Tesseract.js.');
    this.isOcrAvailable = false;
    return false;
  }

  private startPythonServer(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`[PaddleOcrService] Attempting to start OCR server with command: ${cmd}...`);
      
      try {
        if (cmd === 'wsl python3') {
          const wslScriptPath = getWslPath(this.serverScriptPath);
          this.serverProcess = spawn('wsl', ['python3', wslScriptPath]);
        } else {
          this.serverProcess = spawn(cmd, [this.serverScriptPath]);
        }
      } catch (e) {
        return resolve(false);
      }

      let isReady = false;

      // Listen for the Uvicorn startup message or our custom print statement
      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        // console.log('[OCR Server STDOUT]', output);
        if (output.includes('___UVICORN_STARTED___')) {
          if (!isReady) {
            isReady = true;
            console.log('[PaddleOcrService] Python OCR Server is ready on port 8000.');
            resolve(true);
          }
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        // console.log('[OCR Server STDERR]', output);
        if (output.includes('Application startup complete') || output.includes('Uvicorn running on')) {
          if (!isReady) {
            isReady = true;
            console.log('[PaddleOcrService] Python OCR Server is ready on port 8000.');
            resolve(true);
          }
        }
      });

      this.serverProcess.on('close', (code) => {
        this.serverProcess = null;
        if (!isReady) {
          resolve(false);
        }
      });

      this.serverProcess.on('error', () => {
        this.serverProcess = null;
        if (!isReady) {
          resolve(false);
        }
      });

      // Timeout for startup (PaddleOCR loading models can take 30s)
      setTimeout(() => {
        if (!isReady) {
          console.warn('[PaddleOcrService] Python OCR server startup timed out.');
          resolve(false);
        }
      }, 40000);
    });
  }

  /**
   * Scans an image file using the pre-loaded PaddleOCR python microservice via HTTP.
   * @param filePath Absolute path to the image file
   */
  public async scanImage(filePath: string): Promise<any> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      return { success: false, error: 'PaddleOCR is not available in system environment' };
    }

    try {
      const formBody = new URLSearchParams();
      
      if (this.pythonCommand === 'wsl python3') {
         formBody.append('image_path', getWslPath(filePath));
      } else {
         formBody.append('image_path', filePath);
      }

      const response = await fetch(`${this.serverUrl}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PaddleOcrService] HTTP Error from OCR server:', response.status, errorText);
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return data;
      
    } catch (err: any) {
      console.error('[PaddleOcrService] Failed to send request to OCR server:', err);
      return { success: false, error: err.message };
    }
  }
}

export const paddleOcrService = new PaddleOcrService();
export default paddleOcrService;
