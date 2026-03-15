import { spawn, ChildProcess } from 'child_process';

export class CaffeinateManager {
  private process: ChildProcess | null = null;
  private refCount: number = 0;

  acquire(): void {
    this.refCount++;
    if (this.refCount === 1) {
      this.startCaffeinate();
    }
  }

  release(): void {
    if (this.refCount > 0) {
      this.refCount--;
    }
    if (this.refCount === 0) {
      this.stopCaffeinate();
    }
  }

  isActive(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getRefCount(): number {
    return this.refCount;
  }

  private startCaffeinate(): void {
    if (this.process) return;
    // Only run on macOS
    if (process.platform !== 'darwin') return;
    try {
      this.process = spawn('caffeinate', ['-dis'], {
        stdio: 'ignore',
        detached: false,
      });
      this.process.on('error', () => {
        this.process = null;
      });
      this.process.on('exit', () => {
        if (this.refCount > 0) {
          console.warn('[caffeinate] Process exited unexpectedly while still acquired');
        }
        this.process = null;
      });
      console.log('[caffeinate] Sleep prevention activated');
    } catch {
      this.process = null;
    }
  }

  private stopCaffeinate(): void {
    if (this.process && !this.process.killed) {
      const proc = this.process;
      proc.kill('SIGTERM');
      setTimeout(() => {
        try { if (!proc.killed) proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
      console.log('[caffeinate] Sleep prevention deactivated');
    }
    this.process = null;
  }
}

// Singleton (HMR-safe)
const globalForCaffeinate = globalThis as unknown as { caffeinateManager: CaffeinateManager };
export const caffeinateManager = globalForCaffeinate.caffeinateManager || new CaffeinateManager();
globalForCaffeinate.caffeinateManager = caffeinateManager;
