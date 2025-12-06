import { AbstractLogger } from '@rosen-bridge/abstract-logger';
import { TokenMap } from '@rosen-bridge/tokens';

import { FIRO_CHAIN } from '../lib/constants';

// Mock token map
export const createMockTokenMap = (): TokenMap =>
  ({
    wrapAmount: (tokenId: string, amount: bigint) => ({
      amount,
      token: FIRO_CHAIN,
    }),
    unwrapAmount: (tokenId: string, amount: bigint) => ({
      amount,
      token: FIRO_CHAIN,
    }),
    search: () => null,
    getID: () => FIRO_CHAIN,
    getTokenName: () => 'FIRO',
  }) as unknown as TokenMap;

// Mock logger
export const createMockLogger = (): AbstractLogger =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }) as unknown as AbstractLogger;
