
export const DAY = 60 * 60 * 24;

export const VESTING_PERIOD_TEAM = DAY * 1277;
export const VESTING_PERIOD_TREASURY = DAY * 1095;
export const VESTING_PERIOD_REWARDS = DAY * 912;

export const TOKEN_PREFIX = '0xddddd';

export const SALE_PRICE = 0.2;
export const SALE_START =  Math.floor((new Date('2025-03-20T00:00:00Z')).getTime() / 1000);
export const SALE_END = SALE_START + (DAY * 3);
