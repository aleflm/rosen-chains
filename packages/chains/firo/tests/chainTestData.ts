import { TokenMap } from '@rosen-bridge/tokens';
import { AbstractLogger } from '@rosen-bridge/abstract-logger';
import { FIRO_CHAIN } from '../lib/constants';

// Mock token map
export const createMockTokenMap = (): TokenMap => ({
  wrapAmount: (tokenId: string, amount: bigint) => ({ amount, token: FIRO_CHAIN }),
  unwrapAmount: (tokenId: string, amount: bigint) => ({ amount, token: FIRO_CHAIN }),
  search: () => null,
  getID: () => FIRO_CHAIN,
  getTokenName: () => 'FIRO',
} as any);

// Mock logger
export const createMockLogger = (): AbstractLogger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any);
