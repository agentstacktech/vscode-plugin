import * as vscode from "vscode";

/** Collects disposables and timers for clean deactivate. */
export class DisposableStore implements vscode.Disposable {
  private readonly items: vscode.Disposable[] = [];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private readonly intervals: ReturnType<typeof setInterval>[] = [];

  add(d: vscode.Disposable): void {
    this.items.push(d);
  }

  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
    return t;
  }

  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = setInterval(fn, ms);
    this.intervals.push(id);
    return id;
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    for (const id of this.intervals) clearInterval(id);
    for (const d of this.items) d.dispose();
    this.timers.length = 0;
    this.intervals.length = 0;
    this.items.length = 0;
  }
}
