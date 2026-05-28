import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

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

    // Check PYTHON_PATH environment variable first
    if (process.env.PYTHON_PATH) {
      const available = await this.testPythonEnv(process.env.PYTHON_PATH);
      if (available) {
        this.pythonCommand = process.env.PYTHON_PATH;
        this.isOcrAvailable = true;
        return true;
      }
    }

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

    // Try 'wsl python3' command as fallback for Windows systems with WSL
    available = await this.testPythonEnv('wsl python3');
    if (available) {
      this.pythonCommand = 'wsl python3';
      this.isOcrAvailable = true;
      return true;
    }

    console.warn('[AICamera] Python environment or paddleocr packages not found. Falling back to Tesseract.js.');
    this.isOcrAvailable = false;
    return false;
  }

  private testPythonEnv(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      let proc;
      if (cmd === 'wsl python3') {
        proc = spawn('wsl', ['python3', '-c', 'import sys; from paddleocr import PaddleOCR; print("OK")']);
      } else {
        proc = spawn(cmd, ['-c', 'import paddle; from paddleocr import PaddleOCR; print("OK")']);
      }
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
      let proc;
      if (this.pythonCommand === 'wsl python3') {
        const wslScriptPath = getWslPath(this.scriptPath);
        const wslFilePath = getWslPath(filePath);
        proc = spawn('wsl', ['python3', wslScriptPath, wslFilePath]);
      } else {
        proc = spawn(this.pythonCommand, [this.scriptPath, filePath]);
      }
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
          let output = stdout;
          if (stdout.includes('___OCR_RESULT___')) {
            output = stdout.split('___OCR_RESULT___')[1].trim();
          } else {
            output = stdout.trim().split('\n').pop() || '';
          }
          const parsed = JSON.parse(output);
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
