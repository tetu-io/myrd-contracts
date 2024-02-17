export class MathBigIntUtils {
  static min(...values: bigint[]): bigint {
    if (values.length === 0) {
      throw new Error('No values provided');
    }
    return values.reduce((min, current) => (current < min ? current : min), values[0]);
  }

  static max(...values: bigint[]): bigint {
    if (values.length === 0) {
      throw new Error('No values provided');
    }
    return values.reduce((max, current) => (current > max ? current : max), values[0]);
  }

  static isZero(value: bigint): boolean {
    return value === BigInt(0);
  }
}
