import { AbstractFiroNetwork, FiroTx, FiroUtxo } from '../../lib'; // adjust if needed
import { BlockInfo, TokenDetail } from '@rosen-chains/abstract-chain';
import { vi } from 'vitest';

const createMockLogger = () => {
  const mock: any = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    child: vi.fn().mockImplementation(() => mock),
  };
  return mock;
};

export default class TestFiroNetwork extends AbstractFiroNetwork {
  logger = createMockLogger();

  getHeight = this.notImplemented as () => Promise<number>;
  getTxConfirmation = this.notImplemented as (txId: string) => Promise<number>;
  getAddressAssets = this.notImplemented as (address: string) => Promise<{ nativeToken: bigint, tokens: any[] }>;
  broadcastTransaction = this.notImplemented as (txHex: string) => Promise<string>;
  estimateFee = this.notImplemented as () => Promise<bigint>;
  wrapAmount = this.notImplemented as (tokenId: string, amount: bigint, chain: string) => any;
  unwrapAmount = this.notImplemented as (tokenId: string, amount: bigint, toChain: string) => any;
  submitTransaction = this.notImplemented as (tx: string) => Promise<string>;
  getFeeRatio = this.notImplemented as () => Promise<number>;
  isTxInMempool = this.notImplemented as (txId: string) => Promise<boolean>;
  isBoxUnspentAndValid = this.notImplemented as (boxId: string) => Promise<boolean>;
  getBlockInfo = this.notImplemented as (blockId: string) => Promise<BlockInfo>;
  getTokenDetail = this.notImplemented as (tokenId: string) => Promise<TokenDetail>;

  // and so on for each required property in AbstractFiroNetwork
  // If in doubt, look at the Doge class or the actual abstract interface
  notImplemented = (..._args: any[]) => { throw Error('Not mocked'); };
}