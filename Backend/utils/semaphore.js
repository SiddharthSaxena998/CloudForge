/**
 * Tiny async limiter: at most `max` tasks run at once, the rest wait in FIFO order.
 * (A stepping stone before a real job queue such as BullMQ + Redis.)
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.waiting = [];
  }

  get queued() {
    return this.waiting.length;
  }

  get busy() {
    return this.active >= this.max;
  }

  async run(task) {
    if (this.busy) {
      await new Promise((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // hand our slot straight to the next waiter
      else this.active -= 1;
    }
  }
}

module.exports = Semaphore;
