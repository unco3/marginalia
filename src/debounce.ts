export class Debouncer<T extends unknown[]> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private fn: (...args: T) => void | Promise<void>,
    private waitMs: number,
  ) {}

  trigger(...args: T): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.fn(...args);
    }, this.waitMs);
  }

  setWait(waitMs: number): void {
    this.waitMs = waitMs;
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
