# Modrate

Efficiently schedules tasks to run as soon as possible without exceeding a specified rate limit. Unlike existing packages, it ensures full utilization of the limit and guarantees adherence to the limit.

The name **modrate** can be interpreted as **moderate** or **modify rate**, whichever is cooler.

## Installation

```sh
npm install modrate
```

## Usage

```javascript
import modrate from "modrate";

const start = Date.now();

function add(a, b) {
  console.log(`${Date.now() - start}ms: func(${a}, ${b})`);
  return a + b;
}

const interval = 1000;
const limit = 2;
const throttleAdd = modrate.wrap(add, interval, limit);

const promises = [];
promises.push(throttleAdd(1, 2));
await new Promise((resolve) => setTimeout(resolve, 200));
promises.push(throttleAdd(3, 4));
promises.push(throttleAdd(5, 6));
promises.push(throttleAdd(7, 8));

console.log("results:", await Promise.all(promises));
```

Output:

```
0ms: func(1, 2)
200ms: func(3, 4)
1000ms: func(5, 6)
1200ms: func(7, 8)
results: [ 3, 7, 11, 15 ]
```

1st and 2nd calls run immediately. The 3rd call runs at 1000ms to avoid three executions within 1000ms. The 4th call runs at 1200ms to prevent three executions (2nd, 3rd, and 4th) within 1000ms.

## Advanced usage

For more control over waiting and committing the executions, use the `Modrate` class.

```javascript
import { Modrate } from "modrate";

const interval = 1000;
const limit = 5;
const modr = new Modrate(interval, limit);

async function process() {
  // wait until execution is possible, but throw a TimeoutError if waiting exceeds 2000ms
  const done = await modr.wait(AbortSignal.timeout(2000));
  //...
  if (ok) {
    done(); // mark execution as done
  } else {
    done(false); // don't count the execution
  }
  //...
}
```

## License

[Apache-2.0](LICENSE)
