import Denque from "denque";

class Modrate {
  #interval: number;
  #limit: number;
  #latest = new Denque<number>();
  #running = 0;
  #waiting = new Denque<(arg0?: unknown) => void>();
  #timeouts = new Denque<NodeJS.Timeout>();

  constructor(interval: number, limit: number) {
    this.#interval = interval;
    this.#limit = limit;
  }

  #poll() {
    if (this.#waiting.size() <= this.#timeouts.size()) return;
    if (this.#running + this.#timeouts.size() >= this.#limit) return;
    if (
      this.#latest.size() >=
      this.#limit - this.#running - this.#timeouts.size()
    ) {
      const oldest = this.#latest.shift()!;
      const now = Date.now();
      if (now - oldest < this.#interval) {
        const timeout = setTimeout(
          () => {
            this.#timeouts.shift();
            this.#poll();
          },
          oldest + this.#interval - now
        );
        this.#timeouts.push(timeout);
        return;
      }
    }

    ++this.#running;
    this.#waiting.shift()!();
  }

  /**
   * Wait until execution is possible.
   *
   * @param signal To abort waiting. If aborted, the execution isn't counted.
   * @throws {DOMException} If aborted.
   * @returns A promise resolving with a callback to notify execution done.
   * Pass false to the callback if the execution shouldn't be counted.
   *
   * @example
   * const done = await modr.wait(AbortSignal.timeout(1000));
   * // operations...
   * if (ok) done();
   * else done(false);
   *
   */
  async wait(signal?: AbortSignal) {
    await new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      signal?.addEventListener(
        "abort",
        () => {
          reject(signal.reason);
          const index = this.#waiting.toArray().indexOf(resolve);
          if (index === -1) return;
          this.#waiting.removeOne(index);
          if (this.#waiting.size() < this.#timeouts.size()) {
            clearTimeout(this.#timeouts.pop());
          }
        },
        { once: true }
      );
      this.#waiting.push(resolve);
      this.#poll();
    });

    return (count?: boolean) => {
      --this.#running;
      if (count === false) {
        clearTimeout(this.#timeouts.pop());
      } else {
        this.#latest.push(Date.now());
      }
      this.#poll();
    };
  }
}

/**
 * Creates a throttled version of the given function, whose executions are
 * scheduled to fit the limit.
 *
 * @param fn Function to throttle.
 * @param interval Time frame, in milliseconds, during which a specific number
 * of executions are permitted.
 * @param limit Maximum number of executions within any interval.
 * @returns Throttled function.
 */
function wrap<T extends (...args: any[]) => ReturnType<T>>(
  fn: T,
  interval: number,
  limit: number
) {
  const modrate = new Modrate(interval, limit);
  return async function (this: any, ...args: Parameters<T>) {
    const done = await modrate.wait();
    try {
      return await fn.apply(this, args);
    } finally {
      done();
    }
  };
}

export = { wrap, Modrate };
