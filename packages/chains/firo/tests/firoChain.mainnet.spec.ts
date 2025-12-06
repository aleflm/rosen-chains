import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import { expect, describe, it, beforeAll } from 'vitest';

import JsonBigInt from '@rosen-bridge/json-bigint';
import { TransactionType, SigningStatus } from '@rosen-chains/abstract-chain';

import { FiroChain, FIRO_NETWORK } from '../lib';
import FiroTransaction from '../lib/firoTransaction';
import AbstractFiroNetwork from '../lib/network/abstractFiroNetwork';
import { FiroTx } from '../lib/types';
import { mainnetFiroConfigs } from './chainMainnetTestData';
import { createMockTokenMap, createMockLogger } from './chainTestData';

// Firo RPC configuration for mainnet
const FIRO_RPC_CONFIG = {
  rpcUrl: 'http://127.0.0.1:8888',
  rpcUser: 'firouser',
  rpcPassword: 'firopwd',
};

// RPC client for mainnet tests
const rpcCall = async (method: string, params: unknown[] = []) => {
  const response = await axios.post(
    FIRO_RPC_CONFIG.rpcUrl,
    {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    },
    {
      auth: {
        username: FIRO_RPC_CONFIG.rpcUser,
        password: FIRO_RPC_CONFIG.rpcPassword,
      },
      timeout: 10000,
    },
  );

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  return response.data.result;
};

// Create mock network with real RPC calls
const createMockNetworkWithRPC = () => ({
  getAddressBoxes: async (address: string, offset: number, limit: number) => {
    const utxos = await rpcCall('listunspent', [0, 9999999, [address]]);
    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs available for address ${address}`);
    }
    return utxos.slice(offset, offset + limit).map((utxo: unknown) => ({
      txId: (utxo as { txid: string }).txid,
      index: (utxo as { vout: number }).vout,
      value: BigInt(
        Math.round((utxo as { amount: number }).amount * 100000000),
      ),
    }));
  },
  getAddressAssets: async (address: string) => {
    const utxos = await rpcCall('listunspent', [0, 9999999, [address]]);
    if (!utxos || utxos.length === 0) {
      return { nativeToken: 0n, tokens: [] };
    }
    const totalValue = utxos.reduce((sum: bigint, utxo: unknown) => {
      return (
        sum +
        BigInt(Math.round((utxo as { amount: number }).amount * 100000000))
      );
    }, 0n);
    return { nativeToken: totalValue, tokens: [] };
  },
  getFeeRatio: async () => {
    try {
      const feeEstimate = await rpcCall('estimatesmartfee', [6]);
      if (feeEstimate.feerate) {
        return (feeEstimate.feerate * 100000000) / 1024;
      }
      return 1;
    } catch {
      return 1;
    }
  },
  getTransactionHex: async (txId: string) => {
    return await rpcCall('getrawtransaction', [txId]);
  },
  isBoxUnspentAndValid: async (boxId: string) => {
    void boxId;
    return true;
  },
  isTxInMempool: async (txId: string) => {
    void txId;
    return false;
  },
  submitTransaction: async (_psbt: unknown) => {
    void _psbt;
    return 'txid';
  },
  getUtxo: async (boxId: string) => {
    const [txId, index] = boxId.split(':');
    const txHex = await rpcCall('getrawtransaction', [txId]);
    const decodedTx = await rpcCall('decoderawtransaction', [txHex]);
    const output = (decodedTx as { vout: unknown[] }).vout[parseInt(index)];
    return {
      txId,
      index: parseInt(index),
      value: BigInt(
        Math.round((output as { value: number }).value * 100000000),
      ),
    };
  },
});

describe('FiroChain Mainnet Tests (Read-Only)', () => {
  let info: {
    currentHeight: number;
    recentTxId: string;
    recentTxHex: string;
    recentTx: FiroTransaction;
    firoTxData: FiroTx;
  };
  let firoChain: FiroChain;

  beforeAll(async () => {
    const blockCount = await rpcCall('getblockcount');
    const latestBlockHash = await rpcCall('getblockhash', [blockCount]);
    const latestBlock = await rpcCall('getblock', [latestBlockHash]);
    const recentTxId = latestBlock.tx[0];
    const recentTxHex = await rpcCall('getrawtransaction', [recentTxId]);
    const decodedTx = await rpcCall('decoderawtransaction', [recentTxHex]);

    const realTxBytes = new Uint8Array(Buffer.from(recentTxHex, 'hex'));
    const recentTx = new FiroTransaction(
      recentTxId,
      'mainnet-test-event',
      realTxBytes,
      TransactionType.payment,
      [],
    );

    const firoTxData: FiroTx = {
      id: (decodedTx as { txid: string }).txid,
      inputs: (decodedTx as { vin: unknown[] }).vin.map((input: unknown) => ({
        txId:
          (input as { txid?: string }).txid ||
          '0000000000000000000000000000000000000000000000000000000000000000',
        index: (input as { vout?: number }).vout || 0,
        scriptPubKey:
          (input as { scriptSig?: { hex?: string } }).scriptSig?.hex || '',
      })),
      outputs: (decodedTx as { vout: unknown[] }).vout.map(
        (output: unknown) => ({
          scriptPubKey: (output as { scriptPubKey: { hex: string } })
            .scriptPubKey.hex,
          value: BigInt(
            Math.round((output as { value: number }).value * 100000000),
          ),
        }),
      ),
    };

    info = {
      currentHeight: blockCount,
      recentTxId,
      recentTxHex,
      recentTx,
      firoTxData,
    };

    const mockNetwork = createMockNetworkWithRPC();
    const tokenMap = createMockTokenMap();
    const logger = createMockLogger();
    const mockTssSign = async () => ({
      signature: 'mock',
      signatureRecovery: 'mock',
    });

    firoChain = new FiroChain(
      mockNetwork as unknown as AbstractFiroNetwork,
      mainnetFiroConfigs,
      tokenMap,
      mockTssSign,
      logger,
    );
  }, 30000);

  describe('getMinimumNativeToken', () => {
    it('should return exactly 1000000 satoshis (0.01 FIRO)', () => {
      const EXPECTED_MINIMUM_FIRO = 1000000n;

      const result = firoChain.getMinimumNativeToken();

      expect(result).toBe(EXPECTED_MINIMUM_FIRO);
    });
  });

  describe('getMempoolBoxMapping', () => {
    it('should always return empty map (no chaining support)', async () => {
      const result = await firoChain.getMempoolBoxMapping('test-address');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return empty map regardless of parameters', async () => {
      const result1 = await firoChain.getMempoolBoxMapping(
        'address1',
        'token1',
      );
      const result2 = await firoChain.getMempoolBoxMapping('address2');
      const result3 = await firoChain.getMempoolBoxMapping(
        mainnetFiroConfigs.addresses.lock,
        'FIRO',
      );

      expect(result1.size).toBe(0);
      expect(result2.size).toBe(0);
      expect(result3.size).toBe(0);
    });

    it('should return empty map for valid mainnet addresses', async () => {
      const FUNDED_ADDRESS = 'aD7ns9EUg4tUd6S5yQYh3ieyfmWWbwCaM7';

      const result = await firoChain.getMempoolBoxMapping(FUNDED_ADDRESS);

      expect(result.size).toBe(0);
      expect([...result.keys()]).toEqual([]);
      expect([...result.values()]).toEqual([]);
    });

    it('should return empty map with tokenId parameter', async () => {
      const result1 = await firoChain.getMempoolBoxMapping('addr1', 'FIRO');
      const result2 = await firoChain.getMempoolBoxMapping(
        'addr2',
        'token-id-123',
      );

      expect(result1.size).toBe(0);
      expect(result2.size).toBe(0);
    });

    it('should return empty map for invalid/malformed addresses', async () => {
      const result1 = await firoChain.getMempoolBoxMapping('invalid');
      const result2 = await firoChain.getMempoolBoxMapping('');
      const result3 = await firoChain.getMempoolBoxMapping('123');

      expect(result1.size).toBe(0);
      expect(result2.size).toBe(0);
      expect(result3.size).toBe(0);
    });
  });

  describe('getBoxes', () => {
    it('should return exact known UTXO from funded mainnet address', async () => {
      const FUNDED_ADDRESS = 'aD7ns9EUg4tUd6S5yQYh3ieyfmWWbwCaM7';
      const EXPECTED_TX_ID =
        'f12bf059f57df6df06d36b6f0e779edc420c16ad7ecbe6e4c86f1e6da44e7ba8';
      const EXPECTED_VOUT = 0;
      const EXPECTED_VALUE = 10000000n;

      const result = await firoChain.getBoxes(FUNDED_ADDRESS);

      expect(result).toHaveLength(1);
      expect(result[0].txId).toBe(EXPECTED_TX_ID);
      expect(result[0].index).toBe(EXPECTED_VOUT);
      expect(result[0].value).toBe(EXPECTED_VALUE);
    });

    it('should handle address without UTXOs', async () => {
      const emptyAddress = 'a7M8AjiRdFkMpj3j6AKx9TuMU1J2WsR4gR';

      try {
        await firoChain.getBoxes(emptyAddress);
        expect(true).toBe(true);
      } catch (error: unknown) {
        expect((error as Error).message).toContain('No UTXOs available');
      }
    });

    it('should return same UTXO on repeated calls (idempotent)', async () => {
      const FUNDED_ADDRESS = 'aD7ns9EUg4tUd6S5yQYh3ieyfmWWbwCaM7';

      const result1 = await firoChain.getBoxes(FUNDED_ADDRESS);
      const result2 = await firoChain.getBoxes(FUNDED_ADDRESS);
      const result3 = await firoChain.getBoxes(FUNDED_ADDRESS);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1[0].txId).toBe(result2[0].txId);
    });

    it('should call with optional tokenId parameter', async () => {
      const FUNDED_ADDRESS = 'aD7ns9EUg4tUd6S5yQYh3ieyfmWWbwCaM7';

      const result1 = await firoChain.getBoxes(FUNDED_ADDRESS);
      const result2 = await firoChain.getBoxes(FUNDED_ADDRESS, 'FIRO');
      const result3 = await firoChain.getBoxes(FUNDED_ADDRESS, 'some-token-id');

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  describe('getTransactionAssets', () => {
    it('should return correct asset structure for mainnet coinbase transaction', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-event',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [],
        }),
      );

      const result = await firoChain.getTransactionAssets(paymentTx);

      expect(result.inputAssets.nativeToken).toBe(0n);
      expect(result.inputAssets.tokens).toEqual([]);
      expect(result.outputAssets.nativeToken).toBe(0n);
      expect(result.outputAssets.tokens).toEqual([]);
      expect(result.inputAssets.tokens).toHaveLength(0);
      expect(result.outputAssets.tokens).toHaveLength(0);
    });

    it('should be return same assets', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-idempotent',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [],
        }),
      );

      const result1 = await firoChain.getTransactionAssets(paymentTx);
      const result2 = await firoChain.getTransactionAssets(paymentTx);
      const result3 = await firoChain.getTransactionAssets(paymentTx);

      expect(result1.inputAssets.nativeToken).toBe(
        result2.inputAssets.nativeToken,
      );
      expect(result2.inputAssets.nativeToken).toBe(
        result3.inputAssets.nativeToken,
      );
      expect(result1.outputAssets.nativeToken).toBe(
        result2.outputAssets.nativeToken,
      );
      expect(result2.outputAssets.nativeToken).toBe(
        result3.outputAssets.nativeToken,
      );
    });

    it('should handle different transaction types correctly', async () => {
      const txTypes = [
        TransactionType.payment,
        TransactionType.reward,
        TransactionType.manual,
      ];

      for (const txType of txTypes) {
        const tx = FiroTransaction.fromJson(
          JsonBigInt.stringify({
            txId: info.recentTxId,
            eventId: `test-${txType}`,
            txBytes: Array.from(info.recentTx.txBytes),
            txType: txType,
            inputUtxos: [],
          }),
        );

        const result = await firoChain.getTransactionAssets(tx);

        expect(result).toHaveProperty('inputAssets');
        expect(result).toHaveProperty('outputAssets');
        expect(result.inputAssets).toHaveProperty('nativeToken');
        expect(result.outputAssets).toHaveProperty('nativeToken');
      }
    });

    it('should always return empty token arrays (Firo has no tokens)', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-no-tokens',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [],
        }),
      );

      const result = await firoChain.getTransactionAssets(paymentTx);

      expect(result.inputAssets.tokens).toEqual([]);
      expect(result.outputAssets.tokens).toEqual([]);
      expect(result.inputAssets.tokens).toHaveLength(0);
      expect(result.outputAssets.tokens).toHaveLength(0);
    });
  });

  describe('verifyNoTokenBurned', () => {
    it('should return exactly true for any Firo transaction (Firo has no tokens)', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-event',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [],
        }),
      );

      const result = await firoChain.verifyNoTokenBurned(paymentTx);

      expect(result).toBe(true);
      expect(result).not.toBe(false);
    });

    it('should be returns true for same transaction)', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-event-1',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [],
        }),
      );

      const result1 = await firoChain.verifyNoTokenBurned(paymentTx);
      const result2 = await firoChain.verifyNoTokenBurned(paymentTx);
      const result3 = await firoChain.verifyNoTokenBurned(paymentTx);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    it('should return true for reward transaction type', async () => {
      const rewardTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-reward',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.reward,
          inputUtxos: [],
        }),
      );

      const result = await firoChain.verifyNoTokenBurned(rewardTx);
      expect(result).toBe(true);
    });

    it('should return true for manual transaction type', async () => {
      const manualTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-manual',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.manual,
          inputUtxos: [],
        }),
      );

      const result = await firoChain.verifyNoTokenBurned(manualTx);
      expect(result).toBe(true);
    });

    it('should return true regardless of inputUtxos content', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: 'mainnet-test-with-inputs',
          txBytes: Array.from(info.recentTx.txBytes),
          txType: TransactionType.payment,
          inputUtxos: [{ txId: info.recentTxId, index: 0, value: 10000000n }],
        }),
      );

      const result = await firoChain.verifyNoTokenBurned(paymentTx);
      expect(result).toBe(true);
    });
  });

  describe('verifyLockTransactionExtraConditions', () => {
    it('should always return true (no extra conditions for Firo)', async () => {
      const result = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        {
          hash: 'test-hash',
          parentHash: 'parent-hash',
          height: info.currentHeight,
          timestamp: Date.now(),
        } as unknown as Parameters<
          typeof firoChain.verifyLockTransactionExtraConditions
        >[1],
      );
      expect(result).toBe(true);
    });

    it('should return true for any transaction and block info', async () => {
      const testTxData: FiroTx = {
        id: 'test-tx-id',
        inputs: [],
        outputs: [],
      };

      const result = await firoChain.verifyLockTransactionExtraConditions(
        testTxData,
        {
          hash: 'different-hash',
          parentHash: 'different-parent',
          height: 12345,
          timestamp: Date.now() - 10000,
        } as unknown as Parameters<
          typeof firoChain.verifyLockTransactionExtraConditions
        >[1],
      );
      expect(result).toBe(true);
    });

    it('should be same with same parameters', async () => {
      const blockInfo = {
        hash: 'test-hash',
        parentHash: 'parent-hash',
        height: info.currentHeight,
        timestamp: Date.now(),
      } as unknown as Parameters<
        typeof firoChain.verifyLockTransactionExtraConditions
      >[1];
      const result1 = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo,
      );
      const result2 = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo,
      );
      const result3 = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo,
      );

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    });

    it('should return true with different block heights', async () => {
      const blockInfo1 = {
        hash: 'test-hash-1',
        parentHash: 'parent-hash-1',
        height: 1000,
        timestamp: Date.now(),
      } as unknown as Parameters<
        typeof firoChain.verifyLockTransactionExtraConditions
      >[1];

      const blockInfo2 = {
        hash: 'test-hash-2',
        parentHash: 'parent-hash-2',
        height: 999999,
        timestamp: Date.now(),
      } as unknown as Parameters<
        typeof firoChain.verifyLockTransactionExtraConditions
      >[1];
      const result1 = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo1,
      );
      const result2 = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo2,
      );

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it('should return true with edge case block parameters', async () => {
      const blockInfo = {
        hash: '',
        parentHash: '',
        height: 0,
        timestamp: 0,
      } as unknown as Parameters<
        typeof firoChain.verifyLockTransactionExtraConditions
      >[1];
      const result = await firoChain.verifyLockTransactionExtraConditions(
        info.firoTxData,
        blockInfo,
      );
      expect(result).toBe(true);
    });
  });

  describe('isTxInMempool', () => {
    it('should return exactly false for confirmed mainnet transaction (already in block)', async () => {
      const result = await firoChain.isTxInMempool(info.recentTxId);

      expect(result).toBe(false);
      expect(result).not.toBe(true);
    });

    it('should return exactly false for non-existent transaction ID', async () => {
      const FAKE_TX_ID =
        '0000000000000000000000000000000000000000000000000000000000000000';

      const result = await firoChain.isTxInMempool(FAKE_TX_ID);

      expect(result).toBe(false);
      expect(result).not.toBe(true);
    });

    it('should be returns same output for same input)', async () => {
      const result1 = await firoChain.isTxInMempool(info.recentTxId);
      const result2 = await firoChain.isTxInMempool(info.recentTxId);
      const result3 = await firoChain.isTxInMempool(info.recentTxId);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(false);
    });

    it('should handle various fake transaction IDs', async () => {
      const fakeIds = [
        '0000000000000000000000000000000000000000000000000000000000000000',
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        '1111111111111111111111111111111111111111111111111111111111111111',
      ];

      for (const fakeId of fakeIds) {
        const result = await firoChain.isTxInMempool(fakeId);
        expect(result).toBe(false);
      }
    });

    it('should handle different confirmed transactions', async () => {
      // Test with multiple confirmed transactions
      const txIds = [info.recentTxId];

      for (const txId of txIds) {
        const result = await firoChain.isTxInMempool(txId);
        expect(result).toBe(false);
        expect(typeof result).toBe('boolean');
      }
    });
  });

  describe('PaymentTransactionFromJson', () => {
    it('should deserialize and return exact FiroTransaction with all fields preserved', () => {
      const EXPECTED_EVENT_ID = 'test-event-mainnet';

      const txJson = JsonBigInt.stringify({
        txId: info.recentTxId,
        eventId: EXPECTED_EVENT_ID,
        txBytes: Array.from(info.recentTx.txBytes),
        txType: TransactionType.payment,
        inputUtxos: [],
      });

      const result = firoChain.PaymentTransactionFromJson(txJson);

      expect(result).toBeInstanceOf(FiroTransaction);
      expect(result.txId).toBe(info.recentTxId);
      expect(result.eventId).toBe(EXPECTED_EVENT_ID);
      expect(result.txType).toBe(TransactionType.payment);
      expect(result.txBytes).toEqual(info.recentTx.txBytes);
      expect((result as FiroTransaction).inputUtxos).toEqual([]);
    });

    it('should preserve exact input UTXOs with all values', () => {
      const EXPECTED_UTXO_1 = {
        txId: 'abc123def456',
        index: 0,
        value: 1000000n,
      };
      const EXPECTED_UTXO_2 = {
        txId: 'def456abc123',
        index: 1,
        value: 2000000n,
      };
      const mockInputUtxos = [
        JsonBigInt.stringify(EXPECTED_UTXO_1),
        JsonBigInt.stringify(EXPECTED_UTXO_2),
      ];

      const txJson = JsonBigInt.stringify({
        txId: 'test-tx-with-inputs',
        eventId: 'multi-input-test',
        txBytes: Array.from(info.recentTx.txBytes),
        txType: TransactionType.payment,
        inputUtxos: mockInputUtxos,
      });

      const result = firoChain.PaymentTransactionFromJson(
        txJson,
      ) as FiroTransaction;

      expect(result.inputUtxos).toHaveLength(2);
      expect(result.inputUtxos).toEqual(mockInputUtxos);

      // Verify each UTXO can be parsed back - JsonBigInt converts all numbers to bigint
      const utxo1 = JsonBigInt.parse(result.inputUtxos[0]);
      const utxo2 = JsonBigInt.parse(result.inputUtxos[1]);
      expect(utxo1.txId).toBe(EXPECTED_UTXO_1.txId);
      expect(utxo1.index).toBe(0n); // JsonBigInt converts to bigint
      expect(utxo1.value).toBe(EXPECTED_UTXO_1.value);
      expect(utxo2.txId).toBe(EXPECTED_UTXO_2.txId);
      expect(utxo2.index).toBe(1n); // JsonBigInt converts to bigint
      expect(utxo2.value).toBe(EXPECTED_UTXO_2.value);
    });

    it('should handle different transaction types correctly', () => {
      const txTypes = [
        TransactionType.payment,
        TransactionType.reward,
        TransactionType.manual,
      ];

      for (const txType of txTypes) {
        const txJson = JsonBigInt.stringify({
          txId: info.recentTxId,
          eventId: `test-${txType}`,
          txBytes: Array.from(info.recentTx.txBytes),
          txType: txType,
          inputUtxos: [],
        });

        const result = firoChain.PaymentTransactionFromJson(txJson);
        expect(result.txType).toBe(txType);
      }
    });

    it('should be idempotent (same JSON always produces same result)', () => {
      const txJson = JsonBigInt.stringify({
        txId: info.recentTxId,
        eventId: 'idempotent-test',
        txBytes: Array.from(info.recentTx.txBytes),
        txType: TransactionType.payment,
        inputUtxos: [],
      });

      const result1 = firoChain.PaymentTransactionFromJson(txJson);
      const result2 = firoChain.PaymentTransactionFromJson(txJson);
      const result3 = firoChain.PaymentTransactionFromJson(txJson);

      expect(result1.txId).toBe(result2.txId);
      expect(result2.txId).toBe(result3.txId);
      expect(result1.eventId).toBe(result2.eventId);
      expect(result2.eventId).toBe(result3.eventId);
    });

    it('should throw error for malformed JSON', () => {
      const INVALID_JSON = 'not valid json at all';

      expect(() => {
        firoChain.PaymentTransactionFromJson(INVALID_JSON);
      }).toThrow();
    });

    it('should throw error for JSON missing required fields', () => {
      const INCOMPLETE_JSON = JsonBigInt.stringify({
        txId: info.recentTxId,
        // Missing eventId, txBytes, txType, inputUtxos
      });

      expect(() => {
        firoChain.PaymentTransactionFromJson(INCOMPLETE_JSON);
      }).toThrow();
    });
  });

  describe('serializeTx', () => {
    it('should serialize to JSON with exact transaction ID and structure', () => {
      const serialized = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const parsed = JsonBigInt.parse(serialized);

      expect(parsed.id).toBe(info.recentTxId);
      expect(parsed.id).toBe(info.firoTxData.id);
      expect(parsed.inputs).toHaveLength(info.firoTxData.inputs.length);
      expect(parsed.outputs).toHaveLength(info.firoTxData.outputs.length);
    });

    it('should serialize all input and output fields with exact values', () => {
      const serialized = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const parsed = JsonBigInt.parse(serialized);

      // Verify exact input structure (coinbase has 1 input)
      expect(parsed.inputs).toHaveLength(1);
      expect(parsed.inputs[0].txId).toBe(info.firoTxData.inputs[0].txId);
      // JsonBigInt converts all numbers to bigint, so index becomes bigint
      expect(parsed.inputs[0].index).toBe(
        BigInt(info.firoTxData.inputs[0].index),
      );
      expect(parsed.inputs[0].scriptPubKey).toBe(
        info.firoTxData.inputs[0].scriptPubKey,
      );

      // Verify exact output structure and values preserved
      expect(parsed.outputs.length).toBeGreaterThan(0);
      expect(parsed.outputs[0].scriptPubKey).toBe(
        info.firoTxData.outputs[0].scriptPubKey,
      );
      expect(parsed.outputs[0].value).toBe(info.firoTxData.outputs[0].value);

      // Verify bigint values are preserved correctly
      for (let i = 0; i < parsed.outputs.length; i++) {
        expect(parsed.outputs[i].value).toBe(info.firoTxData.outputs[i].value);
        expect(typeof parsed.outputs[i].value).toBe('bigint');
      }
    });

    it('should produce deterministic serialization (same input → same output)', () => {
      const serialized1 = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const serialized2 = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const serialized3 = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);

      // Must be byte-for-byte identical
      expect(serialized1).toBe(serialized2);
      expect(serialized2).toBe(serialized3);
      expect(serialized1.length).toBe(serialized2.length);

      // Parsed values must be deeply equal
      const parsed1 = JsonBigInt.parse(serialized1);
      const parsed2 = JsonBigInt.parse(serialized2);
      expect(parsed1.id).toBe(parsed2.id);
      expect(parsed1.inputs.length).toBe(parsed2.inputs.length);
      expect(parsed1.outputs.length).toBe(parsed2.outputs.length);
    });

    it('should handle transactions with different numbers of inputs/outputs', () => {
      // Test with actual mainnet transaction
      const serialized = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const parsed = JsonBigInt.parse(serialized);

      // Coinbase has 1 input
      expect(parsed.inputs).toHaveLength(1);

      // Outputs vary - verify structure for each
      expect(parsed.outputs.length).toBeGreaterThan(0);
      parsed.outputs.forEach((output: unknown) => {
        const typedOutput = output as { scriptPubKey: string; value: bigint };
        expect(typedOutput).toHaveProperty('scriptPubKey');
        expect(typedOutput).toHaveProperty('value');
        expect(typeof typedOutput.value).toBe('bigint');
      });
    });

    it('should serialize and deserialize consistently', () => {
      const serialized = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const parsed = JsonBigInt.parse(serialized);
      const reserialized = JsonBigInt.stringify(parsed);
      const reparsed = JsonBigInt.parse(reserialized);

      // Values must survive round-trip
      expect(reparsed.id).toBe(parsed.id);
      expect(reparsed.inputs.length).toBe(parsed.inputs.length);
      expect(reparsed.outputs.length).toBe(parsed.outputs.length);
    });

    it('should preserve exact bigint values through serialization', () => {
      const serialized = (
        firoChain as unknown as { serializeTx: (tx: unknown) => string }
      ).serializeTx(info.firoTxData);
      const parsed = JsonBigInt.parse(serialized);

      // All output values must remain bigints
      parsed.outputs.forEach((output: unknown, index: number) => {
        const typedOutput = output as { scriptPubKey: string; value: bigint };
        expect(typeof typedOutput.value).toBe('bigint');
        expect(typedOutput.value).toBe(info.firoTxData.outputs[index].value);
      });
    });
  });

  describe('rawTxToPaymentTransaction', () => {
    it('should convert PSBT to PaymentTransaction (offline test)', async () => {
      // This test uses hardcoded PSBT and transaction data
      // Using a real transaction hex structure

      // Known mainnet transaction UTXO data
      const knownUtxo = {
        txId: '8c81d5384bd40b53ee35aa9417c1d95627654c13a33c805b04d50e9a1dbb5ade',
        index: 1,
        value: BigInt(100000000), // 1.0 FIRO
      };

      // Real transaction hex (using testnet format structure for mainnet compatibility)
      // This is the parent transaction that creates the UTXO
      const knownTxHex =
        '010000000188e785a7d0cc43e4869cfbf71fe2565600773bc9e1aa84d039aed007e237a30e000000004847304402204b5a548b5d3e48b9d6f478ddeabc585789bac684fb326a6b5e32bbe1a2f253220220480011f461fbb26816cb9b0da45f0ee3336c93c4992ebe77459e094c1e67972301feffffff0200e1f505000000001976a914366d7be7ab12fa507fee8e5636fc0305c08a6cd988ac00e1f505000000001976a91489909eaf82451099797dfb41e4a688dadbda05d088acede90200';

      // Mainnet network configuration
      const FIRO_MAINNET_NETWORK = {
        messagePrefix: '\\x18Zcoin Signed Message:\\n',
        bech32: '',
        bip32: { public: 0x0488b21e, private: 0x0488ade4 },
        pubKeyHash: 0x52,
        scriptHash: 0x07,
        wif: 0xd2,
      };

      // Create a PSBT using this known UTXO
      const psbt = new bitcoin.Psbt({ network: FIRO_MAINNET_NETWORK });

      psbt.addInput({
        hash: knownUtxo.txId,
        index: knownUtxo.index,
        nonWitnessUtxo: Buffer.from(knownTxHex, 'hex'),
      });

      // Add an output to a valid mainnet address
      psbt.addOutput({
        address: 'aD7ns9EUg4tUd6S5yQYh3ieyfmWWbwCaM7',
        value: Number(knownUtxo.value) - 10000, // Leave fee
      });

      const psbtHex = psbt.toHex();

      // Temporarily override getUtxo to return our known UTXO data (offline test)
      const mockNetwork = (
        firoChain as unknown as { network: AbstractFiroNetwork }
      ).network;
      const originalGetUtxo = mockNetwork.getUtxo;
      mockNetwork.getUtxo = async (boxId: string) => {
        const [txId, index] = boxId.split('.');
        if (txId === knownUtxo.txId && parseInt(index) === knownUtxo.index) {
          return knownUtxo;
        }
        throw new Error(`Unexpected UTXO query: ${boxId}`);
      };

      try {
        // Convert using rawTxToPaymentTransaction
        const convertedTx = await firoChain.rawTxToPaymentTransaction(psbtHex);

        expect(convertedTx).toBeDefined();
        expect(convertedTx.txType).toBe(TransactionType.manual);
      } finally {
        // Restore original getUtxo
        mockNetwork.getUtxo = originalGetUtxo;
      }
    });
  });

  describe('getTransactionSigningStatus', () => {
    it('should return UnSigned for unsigned PSBT', () => {
      // Create an unsigned PSBT offline
      const psbt = new bitcoin.Psbt({ network: FIRO_NETWORK });
      const mockTxHex =
        '010000000188e785a7d0cc43e4869cfbf71fe2565600773bc9e1aa84d039aed007e237a30e000000004847304402204b5a548b5d3e48b9d6f478ddeabc585789bac684fb326a6b5e32bbe1a2f253220220480011f461fbb26816cb9b0da45f0ee3336c93c4992ebe77459e094c1e67972301feffffff0200c2eb0b000000001976a914366d7be7ab12fa507fee8e5636fc0305c08a6cd988acc4161e01000000001976a91489909eaf82451099797dfb41e4a688dadbda05d088acede90200';

      psbt.addInput({
        hash: '8c81d5384bd40b53ee35aa9417c1d95627654c13a33c805b04d50e9a1dbb5ade',
        index: 1,
        nonWitnessUtxo: Buffer.from(mockTxHex, 'hex'),
      });

      psbt.addOutput({
        address: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU4X',
        value: 50000000,
      });

      const txBytes = psbt.toBuffer();
      const firoTx = new FiroTransaction(
        'test-tx-id',
        'test-event',
        txBytes,
        TransactionType.payment,
        [],
      );

      const status = firoChain.getTransactionSigningStatus(firoTx);
      expect(status).toBe(SigningStatus.UnSigned);
    });

    it('should be consistent across multiple calls', () => {
      const psbt = new bitcoin.Psbt({ network: FIRO_NETWORK });
      const mockTxHex =
        '010000000188e785a7d0cc43e4869cfbf71fe2565600773bc9e1aa84d039aed007e237a30e000000004847304402204b5a548b5d3e48b9d6f478ddeabc585789bac684fb326a6b5e32bbe1a2f253220220480011f461fbb26816cb9b0da45f0ee3336c93c4992ebe77459e094c1e67972301feffffff0200c2eb0b000000001976a914366d7be7ab12fa507fee8e5636fc0305c08a6cd988acc4161e01000000001976a91489909eaf82451099797dfb41e4a688dadbda05d088acede90200';

      psbt.addInput({
        hash: '8c81d5384bd40b53ee35aa9417c1d95627654c13a33c805b04d50e9a1dbb5ade',
        index: 1,
        nonWitnessUtxo: Buffer.from(mockTxHex, 'hex'),
      });

      psbt.addOutput({
        address: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU4X',
        value: 50000000,
      });

      const firoTx = new FiroTransaction(
        'test-tx-id-2',
        'test-event-2',
        psbt.toBuffer(),
        TransactionType.payment,
        [],
      );

      const status1 = firoChain.getTransactionSigningStatus(firoTx);
      const status2 = firoChain.getTransactionSigningStatus(firoTx);

      expect(status1).toBe(status2);
      expect(status1).toBe(SigningStatus.UnSigned);
    });
  });
});
