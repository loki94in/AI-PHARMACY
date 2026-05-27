import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PaddleOcrService {
  private pythonCommand: string = 'python';
  private scriptPath: string;
  private isAvailableChecked: boolean = false;
  private isOcrAvailable: boolean = false;

  constructor() {
    this.scriptPath = path.resolve(__dirname, 'ocr_worker.py');
  }

  /**
   * Checks if Python and PaddleOCR dependencies are available on the host system.
   */
  public async checkAvailability(): Promise<boolean> {
    if (this.isAvailableChecked) {
      return this.isOcrAvailable;
    }

    this.isAvailableChecked = true;

    // Test default 'python' command
    let available = await this.testPythonEnv('python');
    if (available) {
      this.pythonCommand = 'python';
      this.isOcrAvailable = true;
      return true;
    }

    // Try 'python3' command as fallback
    available = await this.testPythonEnv('python3');
    if (available) {
      this.pythonCommand = 'python3';
      this.isOcrAvailable = true;
      return true;
    }

    console.warn('[AICamera] Python environment or paddleocr packages not found. Falling back to Tesseract.js.');
    this.isOcrAvailable = false;
    return false;
  }

  private testPythonEnv(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, ['-c', 'import sys; from paddleocr import PaddleOCR; print("OK")']);
      let stdout = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim() === 'OK') {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Scans an image file using the PaddleOCR python worker process.
   * @param filePath Absolute path to the image file
   */
  public async scanImage(filePath: string): Promise<any> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      return { success: false, error: 'PaddleOCR is not available in system environment' };
    }

    return new Promise((resolve) => {
      const proc = spawn(this.pythonCommand, [this.scriptPath, filePath]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('[PaddleOcrService] OCR process exited with code:', code, 'stderr:', stderr);
          resolve({ success: false, error: stderr || `Process exited with code ${code}` });
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (err: any) {
          console.error('[PaddleOcrService] Failed to parse JSON stdout:', err, 'stdout:', stdout);
          resolve({ success: false, error: 'Invalid JSON response from OCR process' });
        }
      });

      proc.on('error', (err) => {
        console.error('[PaddleOcrService] Failed to start process:', err);
        resolve({ success: false, error: err.message });
      });
    });
  }
}

export const paddleOcrService = new PaddleOcrService();
export default paddleOcrService;
