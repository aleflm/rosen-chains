import axios from 'axios';
import { expect, describe, it, beforeAll } from 'vitest';

import { TransactionType } from '@rosen-chains/abstract-chain';

import { FIRO_CHAIN } from '../lib/constants';
import FiroTransaction from '../lib/firoTransaction';

// Firo configuration
const FIRO_CONFIG = {
  rpcUrl: 'http://127.0.0.1:8888',
  rpcUser: 'firouser',
  rpcPassword: 'firopwd',
};

// Simple RPC client
const rpcCall = async (method: string, params: unknown[] = []) => {
  const response = await axios.post(
    FIRO_CONFIG.rpcUrl,
    {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    },
    {
      auth: {
        username: FIRO_CONFIG.rpcUser,
        password: FIRO_CONFIG.rpcPassword,
      },
      timeout: 10000,
    },
  );

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  return response.data.result;
};

describe('FiroTransaction Production Tests', () => {
  let info: {
    currentHeight: number;
    recentTxId: string;
    recentTxHex: string;
    networkInfo: unknown;
  };

  beforeAll(async () => {
    // Connect to Firo - will fail if node is not available
    const blockCount = await rpcCall('getblockcount');
    const networkInfo = await rpcCall('getnetworkinfo');
    const latestBlockHash = await rpcCall('getblockhash', [blockCount]);
    const latestBlock = await rpcCall('getblock', [latestBlockHash]);
    const recentTxId = latestBlock.tx[0];
    const recentTxHex = await rpcCall('getrawtransaction', [recentTxId]);

    info = {
      currentHeight: blockCount,
      recentTxId,
      recentTxHex,
      networkInfo,
    };

    // console.log('Connected to Firo:', {
    //   height: info.currentHeight,
    //   network: info.networkInfo.networkactive,
    //   version: info.networkInfo.version,
    // });
  }, 30000);

  describe('FiroTransaction Functions with Data', () => {
    it('should test constructor with transaction data', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));

      const firoTx = new FiroTransaction(
        info.recentTxId,
        'event-001',
        realTxBytes,
        TransactionType.payment,
        [],
      );

      expect(firoTx.txId).toBe(info.recentTxId);
      expect(firoTx.network).toBe(FIRO_CHAIN);
      expect(firoTx.txBytes).toEqual(realTxBytes);
      expect(firoTx.eventId).toBe('event-001');
      expect(firoTx.txType).toBe(TransactionType.payment);
      expect(firoTx.inputUtxos).toEqual([]);
    });

    it('should test getTxHexString() with transaction data', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));

      const firoTx = new FiroTransaction(
        info.recentTxId,
        'hex-test-event',
        realTxBytes,
        TransactionType.payment,
        [],
      );

      const hexString = firoTx.getTxHexString();

      // Should match the original hex from RPC call
      expect(typeof hexString).toBe('string');
      expect(hexString.length % 2).toBe(0);
      expect(hexString).toBe(info.recentTxHex.toLowerCase());
    });

    it('should test toJson() with transaction data', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));
      const inputUtxos = [`${info.recentTxId}.0`, `${info.recentTxId}.1`];

      const firoTx = new FiroTransaction(
        info.recentTxId,
        'json-serialization-test',
        realTxBytes,
        TransactionType.payment,
        inputUtxos,
      );

      const jsonString = firoTx.toJson();
      const parsed = JSON.parse(jsonString);

      expect(parsed.network).toBe(FIRO_CHAIN);
      expect(parsed.eventId).toBe('json-serialization-test');
      expect(parsed.txBytes).toBe(info.recentTxHex.toLowerCase());
      expect(parsed.txId).toBe(info.recentTxId);
      expect(parsed.txType).toBe(TransactionType.payment);
      expect(parsed.inputUtxos).toEqual(inputUtxos);
    });

    it('should test fromJson() with transaction data', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));
      const inputUtxos = [`${info.recentTxId}.0`, `${info.recentTxId}.1`];

      const originalTx = new FiroTransaction(
        info.recentTxId,
        'deserialization-test',
        realTxBytes,
        TransactionType.payment,
        inputUtxos,
      );

      const jsonString = originalTx.toJson();
      const reconstructedTx = FiroTransaction.fromJson(jsonString);

      expect(reconstructedTx.txId).toBe(info.recentTxId);
      expect(reconstructedTx.eventId).toBe('deserialization-test');
      expect(reconstructedTx.txBytes).toEqual(realTxBytes);
      expect(reconstructedTx.txType).toBe(TransactionType.payment);
      expect(reconstructedTx.inputUtxos).toEqual(inputUtxos);
      expect(reconstructedTx.network).toBe(FIRO_CHAIN);
      // Verify hex conversion still works
      expect(reconstructedTx.getTxHexString()).toBe(
        info.recentTxHex.toLowerCase(),
      );
    });
  });

  describe('Multiple Transactions', () => {
    it('should process multiple transactions from recent blocks', async () => {
      const startHeight = Math.max(0, info.currentHeight - 5);
      const allTransactions: FiroTransaction[] = [];

      // Get transactions from multiple recent blocks
      for (
        let height = startHeight;
        height <= info.currentHeight && allTransactions.length < 3;
        height++
      ) {
        const blockHash = await rpcCall('getblockhash', [height]);
        const block = await rpcCall('getblock', [blockHash]);

        // Process first transaction from each block
        if (block.tx && block.tx.length > 0) {
          const txId = block.tx[0];
          const txHex = await rpcCall('getrawtransaction', [txId]);
          const txBytes = new Uint8Array(Buffer.from(txHex, 'hex'));

          const firoTx = new FiroTransaction(
            txId,
            `block-${block.height}-event`,
            txBytes,
            TransactionType.payment,
            [],
          );

          allTransactions.push(firoTx);
        }
      }

      expect(allTransactions.length).toBeGreaterThan(0);

      // Test all FiroTransaction functions on multiple transactions
      for (const tx of allTransactions) {
        // Test constructor properties
        expect(tx.txId).toMatch(/^[a-f0-9]{64}$/i);
        expect(tx.network).toBe(FIRO_CHAIN);
        expect(tx.txBytes.length).toBeGreaterThan(0);

        // Test getTxHexString()
        const hexString = tx.getTxHexString();
        expect(hexString).toMatch(/^[a-f0-9]*$/i);
        expect(hexString.length % 2).toBe(0);

        // Test toJson() and fromJson()
        const jsonString = tx.toJson();
        const reconstructed = FiroTransaction.fromJson(jsonString);
        expect(reconstructed.txId).toBe(tx.txId);
        expect(reconstructed.getTxHexString()).toBe(tx.getTxHexString());
      }
    }, 60000);
  });

  describe('Transaction Types with Data', () => {
    it('should test all transaction types', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));

      // Test all transaction types
      const transactionTypes = [
        TransactionType.payment,
        TransactionType.coldStorage,
        TransactionType.arbitrary,
        TransactionType.reward,
      ] as const;

      for (const txType of transactionTypes) {
        const firoTx = new FiroTransaction(
          `${info.recentTxId}-${txType}`,
          `${txType}-test-event`,
          realTxBytes,
          txType,
          [`input-utxo-${txType}`],
        );

        // Test constructor
        expect(firoTx.txType).toBe(txType);
        expect(firoTx.network).toBe(FIRO_CHAIN);

        // Test getTxHexString()
        const hexString = firoTx.getTxHexString();
        expect(hexString).toBe(info.recentTxHex.toLowerCase());

        // Test toJson() and fromJson()
        const jsonString = firoTx.toJson();
        const reconstructed = FiroTransaction.fromJson(jsonString);
        expect(reconstructed.txType).toBe(txType);
        expect(reconstructed.getTxHexString()).toBe(hexString);
      }
    });

    it('should test large input UTXOs array with data', async () => {
      const realTxBytes = new Uint8Array(Buffer.from(info.recentTxHex, 'hex'));

      // Create a large UTXO list
      const manyUtxos = Array.from(
        { length: 50 },
        (_, i) =>
          `${info.recentTxId.substring(0, 60)}${i.toString().padStart(4, '0')}.${i % 10}`,
      );

      const firoTx = new FiroTransaction(
        info.recentTxId,
        'large-utxos-test',
        realTxBytes,
        TransactionType.payment,
        manyUtxos,
      );

      // Test constructor
      expect(firoTx.inputUtxos).toHaveLength(50);
      expect(firoTx.inputUtxos).toEqual(manyUtxos);

      // Test getTxHexString()
      const hexString = firoTx.getTxHexString();
      expect(hexString).toBe(info.recentTxHex.toLowerCase());

      // Test toJson() and fromJson() with large data
      const jsonString = firoTx.toJson();
      const reconstructed = FiroTransaction.fromJson(jsonString);
      expect(reconstructed.inputUtxos).toEqual(manyUtxos);
      expect(reconstructed.getTxHexString()).toBe(hexString);
    });
  });
});
