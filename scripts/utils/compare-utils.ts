import isEqual from 'lodash/isEqual';

// tslint:disable-next-line:no-any
export function deepEquals(a: any, b: any): boolean {

  // tslint:disable-next-line:triple-equals
  if (a == b) {
    return true;
  }

  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }


  if (typeof a !== typeof b) {
    console.log('different types', typeof a, typeof b, a, b);
    return false;
  }

  if (
    a.toString().toLowerCase() !== '[object object]'
    && b.toString().toLowerCase() !== '[object object]'
    && a.toString().toLowerCase() === b.toString().toLowerCase()
  ) {
    return true;
  }


  const keysA = Object.keys(a).filter(k => k !== '__typename');
  const keysB = Object.keys(b).filter(k => k !== '__typename');

  if (keysA.length !== keysB.length) {
    console.log('different keys length', keysA.length, keysB.length);
    return false;
  }

  let lastKey: string | undefined;
  let lastValueA: string | undefined;
  let lastValueB: string | undefined;
  let result = true;
  for (const key of keysA) {
    lastKey = key;

    if (!keysB.includes(key)) {
      result = false;
      break;
    }
    lastValueA = a[key].toString();
    if (b[key] == null) {
      console.log('------ WARNING --------');
      console.log(`NO EVENTS FOR ${key}`);
      continue;
    }
    lastValueB = b[key].toString();

    if (Array.isArray(b[key]) && Array.isArray(a[key]) && !isEqual(a[key], b[key])) {
      // tslint:disable-next-line:ban-ts-ignore
      // @ts-ignore
      const aKey = a[key].map(val => {
        if (Array.isArray(val)) {
          return val.map(val1 => {
            // to BigNumber
            if (val1.hasOwnProperty('hex')) {
              return BigInt(val1.hex).toString();
            }
            return val1.toString().toLowerCase();
          });
        } else {
          return val.toString().toLowerCase();
        }
      });
      // tslint:disable-next-line:ban-ts-ignore
      // @ts-ignore
      const bKey = b[key].map((val) => {
        try {
          // tslint:disable-next-line:no-shadowed-variable
          return JSON.parse(val, (key, value) => {
            try {
              if (typeof value === 'number' && Math.abs(value) >= 1e20) {
                return BigInt(value).toString();
              }
              return value;
            } catch (e) {
              return value;
            }
          });
        } catch (e) {
          return val;
        }
      });

      if (isEqual(aKey.toString().toLowerCase(), bKey.toString().toLowerCase())) {
        continue;
      }
    }

    if (!deepEquals(a[key], b[key])) {
      result = false;
      break;
    }
  }

  // show changes
  if (!result) {
    console.log(`DIFFERENT KEY: ${lastKey}`);
    console.log(`DIFFERENT VALUE FROM JSON: ${lastValueA}`);
    console.log(`DIFFERENT VALUE FROM SUBGRAPH: ${lastValueB}`);
  }

  return result;
}
