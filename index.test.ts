import modrate from "./index";
import * as timers from "timers/promises";

test("calls original function", async () => {
  const fn = jest.fn();
  const context = {};
  const interval = 1000;
  const limit = 7;
  const throttled = modrate.wrap(fn, interval, limit);

  const uniqueArgs = [...Array(100)].map(() => ({}));
  const uniqueResult = {};
  fn.mockResolvedValue(uniqueResult);

  expect(fn).not.toHaveBeenCalled();

  const result = await throttled.apply(context, uniqueArgs);

  expect(fn).toHaveBeenCalledWith(...uniqueArgs);
  expect(fn.mock.contexts[0]).toBe(context);
  expect(fn).toHaveBeenCalledTimes(1);
  expect(result).toBe(uniqueResult);
});

test("runs only after <interval> since the last <limit>-th run", async () => {
  const now = timeSpan();
  const interval = 1000;
  const limit = 3;
  const throttledNow = modrate.wrap(now, interval, limit);
  const timeouts = [0, 500, 700, 900, 900, 1000, 1500, 2000];
  const runAts = await Promise.all(
    timeouts.map(async (timeout) => {
      await timers.setTimeout(timeout);
      return throttledNow();
    })
  );

  for (let i = 0; i < timeouts.length; i++) {
    if (i < limit) {
      expect(runAts[i]).toBeGreaterThanOrEqual(timeouts[i]);
      expect(runAts[i]).toBeLessThanOrEqual(timeouts[i] + 50);
    } else {
      const expected = Math.max(runAts[i - limit] + interval, timeouts[i]);
      expect(runAts[i]).toBeGreaterThanOrEqual(expected - 1); // setTimeout might be 1ms earlier
      expect(runAts[i]).toBeLessThanOrEqual(expected + 50);
    }
  }
});

test("counts a run as long as it is running", async () => {
  const now = timeSpan();
  async function run(duration: number) {
    const runAt = now();
    await timers.setTimeout(duration);
    const endAt = now();
    return { runAt, endAt };
  }
  const interval = 1000;
  const limit = 2;
  const throttledRun = modrate.wrap(run, interval, limit);

  const durations = [200, 1500, 200, 200, 100];
  const result = await Promise.all(durations.map(throttledRun));

  const ends: number[] = [];
  for (let i = 0; i < result.length; i++) {
    if (i < limit) {
      expect(result[i].runAt).toBeLessThanOrEqual(50);
    } else {
      const expected = ends[i - limit] + interval;
      expect(result[i].runAt).toBeGreaterThanOrEqual(expected - 1);
      expect(result[i].runAt).toBeLessThanOrEqual(expected + 50);
    }
    ends.push(result[i].endAt);
    ends.sort((a, b) => a - b);
  }
});

test("keeps call order", async () => {
  let count = 0;
  const interval = 500;
  const limit = 7;
  const throttledCount = modrate.wrap(() => count++, interval, limit);
  const results = await Promise.all([...Array(50)].map(throttledCount));
  results.forEach((result, i) => {
    expect(result).toBe(i);
  });
});

test("throttles large number of calls", async () => {
  const now = timeSpan();
  const interval = 1000;
  const limit = 7;
  const throttledNow = modrate.wrap(now, interval, limit);
  const total = 50;

  const times = await Promise.all([...Array(total)].map(throttledNow));

  for (let i = 0; i < limit; i++) {
    expect(times[i]).toBeLessThanOrEqual(50);
  }
  for (let i = limit; i < times.length; i++) {
    const diff = times[i] - times[i - limit];
    expect(diff).toBeGreaterThanOrEqual(interval - 1);
    expect(diff).toBeLessThanOrEqual(interval + 50);
  }
}, 10000);

test("rejects wait when abort", async () => {
  const now = timeSpan();
  const interval = 1000;
  const limit = 1;
  const modr = new modrate.Modrate(interval, limit);

  modr.wait().then((done) => done());

  const waitTime = interval / 2;
  const promise = modr.wait(AbortSignal.timeout(waitTime));

  await expect(promise).rejects.toThrow(DOMException);
  expect(now()).toBeLessThanOrEqual(waitTime + 50);
});

test("does not count execution if abort waiting", async () => {
  const now = timeSpan();
  const interval = 1000;
  const limit = 2;
  const modr = new modrate.Modrate(interval, limit);

  const aborts = [1, 2, 5];
  const promises = [...Array(7)].map(async (_, i) => {
    try {
      const signal = aborts.includes(i) ? AbortSignal.abort() : undefined;
      const done = await modr.wait(signal);
      const runAt = now();
      done();
      return runAt;
    } catch (err) {}
  });

  // @ts-expect-error
  const runAts: number[] = await Promise.all(
    promises.filter((_, i) => !aborts.includes(i))
  );
  for (let i = limit; i < runAts.length; i++) {
    const diff = runAts[i] - runAts[i - limit];
    expect(diff).toBeGreaterThanOrEqual(interval - 1);
    expect(diff).toBeLessThanOrEqual(interval + 50);
  }
});

test("does not count execution if specified", async () => {
  const now = timeSpan();
  const interval = 1000;
  const limit = 2;
  const modr = new modrate.Modrate(interval, limit);

  const failures = [0, 3, 5, 6];
  const promises = [...Array(7)].map(async (_, i) => {
    const done = await modr.wait();
    const runAt = now();
    if (failures.includes(i)) {
      done(false);
    } else {
      done();
    }
    return runAt;
  });

  const runAts = await Promise.all(
    promises.filter((_, i) => !failures.includes(i))
  );
  for (let i = limit; i < runAts.length; i++) {
    const diff = runAts[i] - runAts[i - limit];
    expect(diff).toBeGreaterThanOrEqual(interval - 1);
    expect(diff).toBeLessThanOrEqual(interval + 50);
  }
});

test("clears redundant timeout when abort waiting", async () => {
  jest.useFakeTimers();
  const interval = 1000;
  const limit = 1;
  const modr = new modrate.Modrate(interval, limit);

  modr.wait().then((done) => done());

  const promise = modr.wait(AbortSignal.timeout(0));

  await jest.advanceTimersByTimeAsync(50);

  await expect(promise).rejects.toThrow(DOMException);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

test("clears redundant timeout when not count execution", async () => {
  jest.useFakeTimers();
  const interval = 1000;
  const limit = 2;
  const modr = new modrate.Modrate(interval, limit);

  modr.wait().then((done) => done());

  modr.wait().then(async (done) => {
    setTimeout(() => done(false), 50); // 3rd wait's timeout should be cleared
  });

  modr.wait().then((done) => done());

  await jest.advanceTimersByTimeAsync(100);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

function timeSpan() {
  const start = Date.now();
  return () => Date.now() - start;
}
