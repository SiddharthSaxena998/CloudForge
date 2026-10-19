const Semaphore = require('../utils/semaphore');

describe('Semaphore', () => {
  it('runs at most N tasks at once and keeps FIFO order', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const order = [];
    const task = (id) => () =>
      new Promise((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        order.push(id);
        setTimeout(() => {
          active -= 1;
          resolve(id);
        }, 20);
      });
    const results = await Promise.all([1, 2, 3, 4, 5].map((id) => sem.run(task(id))));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('frees the slot when a task throws', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await sem.run(async () => 'ok')).toBe('ok');
  });
});
