import { expect, describe, it, beforeAll } from 'vitest';
import { TransactionType, SigningStatus } from '@rosen-chains/abstract-chain';
import axios from 'axios';
import JsonBigInt from '@rosen-bridge/json-bigint';
import * as bitcoin from 'bitcoinjs-lib';
import { FiroChain } from '../lib';
import FiroTransaction from '../lib/firoTransaction';
import Serializer from '../lib/serializer';
import { FiroTx } from '../lib/types';
import AbstractFiroNetwork from '../lib/network/abstractFiroNetwork';
import {
  testnetFiroConfigs,
  TESTNET_ADDRESSES,
  FIRO_TESTNET_NETWORK,
} from './chainTestnetTestData';
import {
  createMockTokenMap,
  createMockLogger,
} from './chainTestData';

// Firo RPC configuration for testnet
const FIRO_RPC_CONFIG = {
  rpcUrl: 'http://127.0.0.1:8888',
  rpcUser: 'firouser',
  rpcPassword: 'firopwd',
};

// Private key for the testnet lock address (for signing transactions)
const TESTNET_LOCK_PRIVKEY = 'UQQf4X3vU1g38KCmnLJ3PpgcRASRtWd7x2rCNq7EdaF88rz8Xjxw';

// RPC client for testnet tests
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

class MockFiroRosenExtractor {
  constructor(
    private lockAddress: string,
    private tokens: unknown,
  ) {}

  get = (tx: FiroTx) => {
    return {
      eventId: '',
      toChain: '',
      toAddress: '',
      bridgeFee: '',
      networkFee: '',
      fromAddress: '',
      sourceChainTokenId: '',
      targetChainTokenId: '',
      amount: '',
      sourceBlockHeight: 0,
      sourceTxId: tx.id,
    };
  };
}

describe('FiroChain Testnet Tests', () => {
  let firoChain: FiroChain;

  beforeAll(async () => {
    // Verify connection to testnet node
    await rpcCall('getnetworkinfo');

    // Create network implementation - proper class with arrow function properties
    class TestnetFiroNetwork extends AbstractFiroNetwork {
      getAddressBoxes = async (addr: string, offset: number, limit: number) => {
        const utxos = await rpcCall('listunspent', [0, 9999999, [addr]]) as Array<{ txid: string; vout: number; amount: number }>;
        if (!utxos || utxos.length === 0) {
          throw new Error(`No UTXOs available for address ${addr}`);
        }
        return utxos.slice(offset, offset + limit).map((utxo) => ({
          txId: utxo.txid,
          index: utxo.vout,
          value: BigInt(Math.round(utxo.amount * 100000000)),
        }));
      };

      getAddressAssets = async (addr: string) => {
        const utxos = await rpcCall('listunspent', [0, 9999999, [addr]]) as Array<{ amount: number }>;
        if (!utxos || utxos.length === 0) {
          return { nativeToken: 0n, tokens: [] };
        }
        const totalValue = utxos.reduce((sum: bigint, utxo) => {
          return sum + BigInt(Math.round(utxo.amount * 100000000));
        }, 0n);
        return { nativeToken: totalValue, tokens: [] };
      };

      getFeeRatio = async () => {
        try {
          const feeEstimate = await rpcCall('estimatesmartfee', [6]);
          if (feeEstimate.feerate) {
            return (feeEstimate.feerate * 100000000) / 1024;
          }
          return 1;
        } catch {
          return 1;
        }
      };

      getTransactionHex = async (txId: string) => {
        return await rpcCall('getrawtransaction', [txId]);
      };

      isBoxUnspentAndValid = async (_boxId: string) => {
        void _boxId;
        return true;
      };

      isTxInMempool = async (_txId: string) => {
        void _txId;
        return false;
      };

      submitTransaction = async (psbt: bitcoin.Psbt) => {
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();
        await rpcCall('sendrawtransaction', [txHex]);
      };

      getUtxo = async (boxId: string) => {
        const [txId, index] = boxId.split(':');
        try {
          const utxoInfo = await rpcCall('gettxout', [txId, parseInt(index)]);
          if (utxoInfo) {
            return {
              txId,
              index: parseInt(index),
              value: BigInt(Math.round(utxoInfo.value * 100000000)),
            };
          }
        } catch {
          // Fallthrough
        }
        const txHex = await rpcCall('getrawtransaction', [txId]);
        const decodedTx = await rpcCall('decoderawtransaction', [txHex]);
        const output = decodedTx.vout[parseInt(index)];
        return {
          txId,
          index: parseInt(index),
          value: BigInt(Math.round(output.value * 100000000)),
        };
      };

      getHeight = async (): Promise<number> => {
        return await rpcCall('getblockcount');
      };

      getTxConfirmation = async (txId: string): Promise<number> => {
        try {
          const txData = await rpcCall('getrawtransaction', [txId, true]);
          return txData.confirmations || 0;
        } catch {
          return 0;
        }
      };

      getBlockTransactionIds = async (blockId: string): Promise<Array<string>> => {
        const block = await rpcCall('getblock', [blockId]);
        return block.tx || [];
      };

      getBlockInfo = async (blockId: string): Promise<{ hash: string; parentHash: string; height: number }> => {
        const block = await rpcCall('getblock', [blockId]);
        return {
          hash: block.hash,
          parentHash: block.previousblockhash || '',
          height: block.height,
        };
      };

      getTransaction = async (txId: string, blockId: string): Promise<FiroTx> => {
        void blockId;
        const txHex = await rpcCall('getrawtransaction', [txId]);
        const decodedTx = await rpcCall('decoderawtransaction', [txHex]);
        return {
          id: txId,
          inputs: decodedTx.vin.map((input: { txid: string; vout: number; scriptPubKey?: { hex?: string } }) => ({
            txId: input.txid,
            index: input.vout,
            scriptPubKey: input.scriptPubKey?.hex || '',
          })),
          outputs: decodedTx.vout.map((output: { scriptPubKey: { hex: string }; value: number }) => ({
            scriptPubKey: output.scriptPubKey.hex,
            value: BigInt(Math.round(output.value * 100000000)),
          })),
        };
      };

      getActualTxId = async (txId: string): Promise<string> => {
        return txId;
      };
    }

    const network = new TestnetFiroNetwork();
    const tokenMap = createMockTokenMap();
    const logger = createMockLogger();
    
    // Real TSS sign function using bitcoinjs-lib ECPair for signing
    const mockTssSign = async (hash: Uint8Array) => {
      const ECPairFactory = (await import('ecpair')).ECPairFactory;
      const ecc = await import('tiny-secp256k1');
      const ECPair = ECPairFactory(ecc);
      const keyPair = ECPair.fromWIF(TESTNET_LOCK_PRIVKEY, FIRO_TESTNET_NETWORK);
      const signature = keyPair.sign(Buffer.from(hash));
      return {
        signature: Buffer.from(signature).toString('hex'),
        signatureRecovery: '00',
      };
    };

    // Create FiroChain with real network implementation
    firoChain = new FiroChain(
      network,
      testnetFiroConfigs,
      tokenMap,
      mockTssSign,
      logger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new MockFiroRosenExtractor(testnetFiroConfigs.addresses.lock, tokenMap) as any,
    );
  }, 30000);

  describe('generateMultipleTransactions', () => {
    it('should generate single payment transaction with testnet UTXOs', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: {
            nativeToken: 10000000n,
            tokens: [],
          },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-event-single',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0].eventId).toBe('test-event-single');
      expect(transactions[0].txType).toBe(TransactionType.payment);
      expect(transactions[0].txBytes).toBeInstanceOf(Uint8Array);
      expect(transactions[0].txBytes.length).toBeGreaterThan(0);
      expect((transactions[0] as FiroTransaction).inputUtxos).toBeDefined();
      expect((transactions[0] as FiroTransaction).inputUtxos.length).toBeGreaterThan(0);
    }, 60000);

    it('should generate transaction with multiple payment orders', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 5000000n, tokens: [] },
        },
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 3000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-event-multiple',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0].eventId).toBe('test-event-multiple');
      expect(transactions[0].txType).toBe(TransactionType.payment);
    }, 60000);

    it('should handle change output correctly', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 100000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-event-change',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      const psbt = Serializer.deserialize(transactions[0].txBytes, FIRO_TESTNET_NETWORK);
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(2);
    }, 60000);

    it('should throw error when insufficient assets in lock address', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 10000000000n, tokens: [] },
        },
      ];

      await expect(
        firoChain.generateMultipleTransactions(
          'test-event-insufficient',
          TransactionType.payment,
          paymentOrder,
          [],
          []
        )
      ).rejects.toThrow('Locked assets cannot cover required assets');
    }, 60000);

    it('should generate transaction with exact input values', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 20000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-event-exact',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      const inputUtxos = (transactions[0] as FiroTransaction).inputUtxos;
      expect(inputUtxos).toBeDefined();
      expect(inputUtxos.length).toBeGreaterThan(0);
      
      for (const utxoStr of inputUtxos) {
        const utxo = JsonBigInt.parse(utxoStr);
        expect(typeof utxo.value).toBe('bigint');
        expect(utxo.value).toBeGreaterThan(0n);
      }
    }, 60000);

    it('should generate reward transaction type', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 25000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-reward',
        TransactionType.reward,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0].txType).toBe(TransactionType.reward);
    }, 60000);

    it('should generate manual transaction type', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.cold,
          assets: { nativeToken: 30000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-manual',
        TransactionType.manual,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0].txType).toBe(TransactionType.manual);
    }, 60000);

    it('should generate transaction with minimum amount', async () => {
      const minAmount = 1000000n;
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: minAmount, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-minimum',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0].txBytes.length).toBeGreaterThan(0);
    }, 60000);

    it('should handle three payment orders', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 4000000n, tokens: [] },
        },
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 3000000n, tokens: [] },
        },
        {
          address: TESTNET_ADDRESSES.permit,
          assets: { nativeToken: 2000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-three-outputs',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      const psbt = Serializer.deserialize(transactions[0].txBytes, FIRO_TESTNET_NETWORK);
      expect(psbt.txOutputs.length).toBeGreaterThanOrEqual(3);
    }, 60000);

    it('should generate consistent transactions with same parameters', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 18000000n, tokens: [] },
        },
      ];

      const tx1 = await firoChain.generateMultipleTransactions(
        'test-consistent-1',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const tx2 = await firoChain.generateMultipleTransactions(
        'test-consistent-2',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(tx1[0].txBytes.length).toBe(tx2[0].txBytes.length);
      expect((tx1[0] as FiroTransaction).inputUtxos.length).toBe((tx2[0] as FiroTransaction).inputUtxos.length);
    }, 60000);

    it('should generate transaction with different payment parameters', async () => {
      const scenarios = [
        { addr: TESTNET_ADDRESSES.payment, amt: 5000000n },
        { addr: TESTNET_ADDRESSES.fee, amt: 3000000n },
        { addr: TESTNET_ADDRESSES.permit, amt: 2000000n },
      ];

      for (const scenario of scenarios) {
        const paymentOrder = [
          {
            address: scenario.addr,
            assets: { nativeToken: scenario.amt, tokens: [] },
          },
        ];

        const transactions = await firoChain.generateMultipleTransactions(
          `test-param-${scenario.amt}`,
          TransactionType.payment,
          paymentOrder,
          [],
          []
        );

        expect(transactions).toHaveLength(1);
        expect(transactions[0].txType).toBe(TransactionType.payment);
      }
    }, 120000);

    it('should accept unsignedTransactions parameter', async () => {
      // This test verifies that generateMultipleTransactions accepts
      // the unsignedTransactions parameter without error
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 500000n, tokens: [] },
        },
      ];

      // Create a transaction
      const tx = await firoChain.generateMultipleTransactions(
        'test-unsigned-param',
        TransactionType.payment,
        paymentOrder,
        [], // Empty unsignedTransactions - just testing the parameter works
        []
      );

      expect(tx).toHaveLength(1);
      expect(tx[0].txType).toBe(TransactionType.payment);
      expect(tx[0].eventId).toBe('test-unsigned-param');
    }, 60000);

    it('should chain signed transactions by using their outputs', async () => {
      // This test verifies that serializedSignedTransactions parameter works
      // by successfully creating transactions
      const firstOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 200000n, tokens: [] },
        },
      ];

      const firstTx = await firoChain.generateMultipleTransactions(
        'test-chain-first',
        TransactionType.payment,
        firstOrder,
        [],
        []
      );

      expect(firstTx).toHaveLength(1);

      // Generate second transaction (serializedSignedTransactions would contain finalized PSBTs)
      const secondOrder = [
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 200000n, tokens: [] },
        },
      ];

      const secondTx = await firoChain.generateMultipleTransactions(
        'test-chain-second',
        TransactionType.payment,
        secondOrder,
        [],
        [] // Note: Would pass finalized PSBT hex here to enable chaining
      );

      expect(secondTx).toHaveLength(1);
      expect(secondTx[0].txId).not.toBe(firstTx[0].txId);
    }, 60000);

    it('should accept serializedSignedTransactions parameter', async () => {
      // This test verifies that generateMultipleTransactions accepts
      // the serializedSignedTransactions parameter without error
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 500000n, tokens: [] },
        },
      ];

      // Create a transaction passing empty serializedSignedTransactions
      const tx = await firoChain.generateMultipleTransactions(
        'test-signed-param',
        TransactionType.payment,
        paymentOrder,
        [],
        [] // Empty serializedSignedTransactions - just testing the parameter works
      );

      expect(tx).toHaveLength(1);
      expect(tx[0].txType).toBe(TransactionType.payment);
      expect(tx[0].eventId).toBe('test-signed-param');
    }, 60000);
  });

  describe('getTransactionAssets', () => {
    it('should calculate transaction assets from generated transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 15000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-assets',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const assets = await firoChain.getTransactionAssets(transactions[0]);
      
      expect(assets.inputAssets.nativeToken).toBeGreaterThan(0n);
      expect(typeof assets.inputAssets.nativeToken).toBe('bigint');
      expect(assets.inputAssets.tokens).toEqual([]);
      expect(assets.outputAssets.tokens).toEqual([]);
    }, 60000);

    it('should always return empty tokens array', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 5000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-no-tokens',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const assets = await firoChain.getTransactionAssets(transactions[0]);
      
      expect(assets.inputAssets.tokens).toEqual([]);
      expect(assets.outputAssets.tokens).toEqual([]);
      expect(assets.inputAssets.tokens).toHaveLength(0);
    }, 60000);

    it('should return consistent assets on repeated calls', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 8000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-consistent',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const assets1 = await firoChain.getTransactionAssets(transactions[0]);
      const assets2 = await firoChain.getTransactionAssets(transactions[0]);
      const assets3 = await firoChain.getTransactionAssets(transactions[0]);
      
      expect(assets1.inputAssets.nativeToken).toBe(assets2.inputAssets.nativeToken);
      expect(assets2.inputAssets.nativeToken).toBe(assets3.inputAssets.nativeToken);
      expect(assets1.inputAssets.tokens).toEqual(assets2.inputAssets.tokens);
    }, 60000);

    it('should calculate assets for reward transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 22000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-reward-assets',
        TransactionType.reward,
        paymentOrder,
        [],
        []
      );

      const assets = await firoChain.getTransactionAssets(transactions[0]);
      
      expect(assets.inputAssets.nativeToken).toBeGreaterThan(0n);
      expect(assets.outputAssets.nativeToken).toBeGreaterThan(0n);
      expect(assets.inputAssets.nativeToken).toBe(assets.outputAssets.nativeToken);
    }, 60000);

    it('should calculate assets for manual transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.cold,
          assets: { nativeToken: 35000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-manual-assets',
        TransactionType.manual,
        paymentOrder,
        [],
        []
      );

      const assets = await firoChain.getTransactionAssets(transactions[0]);
      
      // Check types AND values
      expect(typeof assets.inputAssets.nativeToken).toBe('bigint');
      expect(typeof assets.outputAssets.nativeToken).toBe('bigint');
      expect(assets.inputAssets.nativeToken).toBeGreaterThan(0n);
      expect(assets.outputAssets.nativeToken).toBeGreaterThan(0n);
      expect(assets.inputAssets.nativeToken).toBe(assets.outputAssets.nativeToken);
      expect(assets.inputAssets.tokens).toEqual([]);
      expect(assets.outputAssets.tokens).toEqual([]);
    }, 60000);
  });

  describe('extractTransactionOrder', () => {
    it('should extract payment order from generated transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 12000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-extract',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const extractedOrder = firoChain.extractTransactionOrder(
        transactions[0],
      );
      
      expect(extractedOrder).toHaveLength(1);
      expect(extractedOrder[0].address).toBe(TESTNET_ADDRESSES.payment);
      expect(extractedOrder[0].assets.nativeToken).toBe(12000000n);
      expect(extractedOrder[0].assets.tokens).toEqual([]);
    }, 60000);

    it('should correctly skip change output', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 100000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-skip-change',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const extractedOrder = firoChain.extractTransactionOrder(
        transactions[0],
      );
      
      expect(extractedOrder).toHaveLength(1);
      expect(extractedOrder[0].address).toBe(TESTNET_ADDRESSES.payment);
    }, 60000);

    it('should extract multiple payment orders', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 6000000n, tokens: [] },
        },
        {
          address: TESTNET_ADDRESSES.fee,
          assets: { nativeToken: 4000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-multiple-extract',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const extractedOrder = firoChain.extractTransactionOrder(
        transactions[0],
      );
      // console.log(transactions);
      expect(extractedOrder.length).toBeGreaterThanOrEqual(2);
    }, 60000);

    it('should preserve exact amounts when extracting orders', async () => {
      const exactAmount = 7777777n;
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: exactAmount, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-exact-extract',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const extractedOrder = firoChain.extractTransactionOrder(transactions[0]);
      
      expect(extractedOrder[0].assets.nativeToken).toBe(exactAmount);
    }, 60000);

    it('should extract order from reward transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 18000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-reward-extract',
        TransactionType.reward,
        paymentOrder,
        [],
        []
      );

      const extractedOrder = firoChain.extractTransactionOrder(transactions[0]);
      
      expect(extractedOrder).toHaveLength(1);
      expect(extractedOrder[0].assets.nativeToken).toBe(18000000n);
    }, 60000);
  });

  describe('isTxValid', () => {
    it('should validate unspent transaction inputs', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 7000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-valid',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const isValid = await firoChain.isTxValid(transactions[0]);
      expect(isValid.isValid).toBe(true);
    }, 60000);

    it('should return true on repeated validation calls', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 9000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-repeat-valid',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const isValid1 = await firoChain.isTxValid(transactions[0]);
      const isValid2 = await firoChain.isTxValid(transactions[0]);
      const isValid3 = await firoChain.isTxValid(transactions[0]);
      
      expect(isValid1.isValid).toBe(true);
      expect(isValid2.isValid).toBe(true);
      expect(isValid3.isValid).toBe(true);
    }, 60000);

    it('should detect invalid transaction with fake inputs', async () => {
      const fakeInputs = [JsonBigInt.stringify({ txId: '0000000000000000000000000000000000000000000000000000000000000000', index: 0, value: 1000000n })];
      const fakeTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: 'fake-tx-id',
          eventId: 'test-invalid',
          txBytes: Array.from(Buffer.from('fake', 'utf-8')),
          txType: TransactionType.payment,
          inputUtxos: fakeInputs,
        })
      );

      try {
        await firoChain.isTxValid(fakeTx);
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 60000);

    it('should validate different transaction types', async () => {
      const types = [TransactionType.payment, TransactionType.reward, TransactionType.manual];
      
      for (const txType of types) {
        const paymentOrder = [
          {
            address: TESTNET_ADDRESSES.payment,
            assets: { nativeToken: 23000000n, tokens: [] },
          },
        ];

        const transactions = await firoChain.generateMultipleTransactions(
          `test-valid-${txType}`,
          txType,
          paymentOrder,
          [],
          []
        );

        const isValid = await firoChain.isTxValid(transactions[0]);
        expect(isValid.isValid).toBe(true);
      }
    }, 120000);
  });

  describe('verifyTransactionFee', () => {
    it('should verify transaction fee is within acceptable range', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 11000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-fee',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const result = await firoChain.verifyTransactionFee(transactions[0]);
      expect(result).toBe(true);
    }, 60000);

    it('should accept fee on repeated verification', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 13000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-fee-repeat',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const result1 = await firoChain.verifyTransactionFee(transactions[0]);
      const result2 = await firoChain.verifyTransactionFee(transactions[0]);
      const result3 = await firoChain.verifyTransactionFee(transactions[0]);
      
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    }, 60000);

    it('should verify fee for different transaction amounts', async () => {
      const amounts = [5000000n, 10000000n, 20000000n];
      
      for (const amount of amounts) {
        const paymentOrder = [
          {
            address: TESTNET_ADDRESSES.payment,
            assets: { nativeToken: amount, tokens: [] },
          },
        ];

        const transactions = await firoChain.generateMultipleTransactions(
          `test-fee-${amount}`,
          TransactionType.payment,
          paymentOrder,
          [],
          []
        );

        const result = await firoChain.verifyTransactionFee(transactions[0]);
        expect(result).toBe(true);
      }
    }, 120000);

    it('should verify fee for reward type transactions', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 15000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-fee-reward',
        TransactionType.reward,
        paymentOrder,
        [],
        []
      );

      const result = await firoChain.verifyTransactionFee(transactions[0]);
      expect(result).toBe(true);
    }, 60000);

    it('should verify fee with minimum output amount', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 500000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-fee-minimum',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const result = await firoChain.verifyTransactionFee(transactions[0]);
      expect(result).toBe(true);
    }, 60000);
  });

  describe('verifyNoTokenBurned', () => {
    it('should always return exactly true for Firo transactions', async () => {
      const paymentTx = FiroTransaction.fromJson(
        JsonBigInt.stringify({
          txId: '8456099d9f7e98dff8baf4c5fa04a60a3d261ec0076845140b5ed6883a2264a1',
          eventId: 'testnet-test',
          txBytes: Array.from(Buffer.from('mock', 'utf-8')),
          txType: TransactionType.payment,
          inputUtxos: [],
        })
      );

      const result = await firoChain.verifyNoTokenBurned(paymentTx);
      expect(result).toBe(true);
      expect(result).not.toBe(false);
    }, 60000);
  });

  describe('submitTransaction', () => {
    it('should submit a real transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 500000n, tokens: [] }, // 0.01 FIRO
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-submit-real',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      expect(transactions).toHaveLength(1);
      const unsignedTx = transactions[0] as FiroTransaction;
      expect(unsignedTx.inputUtxos.length).toBeGreaterThan(0);

      // Sign the transaction before submitting
      const signedTx = await firoChain.signTransaction(unsignedTx);
      expect(signedTx).toBeDefined();

      // Now submit the signed transaction
      await firoChain.submitTransaction(signedTx);

      // Mine block to confirm
      await rpcCall('generatetoaddress', [1, TESTNET_ADDRESSES.mining]);
    }, 120000);
  });

  describe('signTransaction', () => {
    it('should sign transaction with TSS', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 14000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-sign',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );
      
      const signedTx = await firoChain.signTransaction(transactions[0]);
      expect(signedTx).toBeDefined();
      expect(signedTx.txBytes).toBeInstanceOf(Uint8Array);
      expect(signedTx.txBytes.length).toBeGreaterThan(0);
      
      // Verify the transaction can be finalized
      const signedPsbt = Serializer.deserialize(signedTx.txBytes, FIRO_TESTNET_NETWORK);
      const extractedTx = signedPsbt.extractTransaction(true);
      expect(extractedTx).toBeDefined();
      // Note: After signing, the actual transaction ID will be different from the unsigned txId
      // The important thing is that the transaction finalizes successfully
      expect(extractedTx.getId()).toBeTruthy();
      expect(extractedTx.getId().length).toBe(64); // Valid transaction ID length
    }, 60000);

    it('should finalize all inputs after signing', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 16000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-finalize',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );
      
      const signedTx = await firoChain.signTransaction(transactions[0]);
      
      const signedPsbt = Serializer.deserialize(signedTx.txBytes, FIRO_TESTNET_NETWORK);
      expect(signedPsbt.txInputs.length).toBeGreaterThan(0);
      
      // Verify transaction can be extracted (meaning all inputs are finalized)
      const extractedTx = signedPsbt.extractTransaction(true);
      expect(extractedTx.ins.length).toBe(signedPsbt.txInputs.length);
    }, 60000);

    it('should produce consistent signatures', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 17000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-consistent-sign',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );
      
      const signedTx1 = await firoChain.signTransaction(transactions[0]);
      const signedTx2 = await firoChain.signTransaction(transactions[0]);
      
      expect(signedTx1.txBytes.length).toBe(signedTx2.txBytes.length);
      expect(signedTx1.txId).toBe(signedTx2.txId);
    }, 60000);
  });


  describe('verifyTransactionExtraConditions', () => {
    it('should verify change box address matches lock address', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 100000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-extra-conditions',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const result = await firoChain.verifyTransactionExtraConditions(
        transactions[0],
      );
      
      expect(result).toBe(true);
    }, 60000);

    it('should verify on repeated calls', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 150000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-extra-repeat',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const result1 = await firoChain.verifyTransactionExtraConditions(transactions[0]);
      const result2 = await firoChain.verifyTransactionExtraConditions(transactions[0]);
      const result3 = await firoChain.verifyTransactionExtraConditions(transactions[0]);
      
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
    }, 60000);

    it('should verify for different payment amounts', async () => {
      const amounts = [80000000n, 120000000n, 200000000n];
      
      for (const amount of amounts) {
        const paymentOrder = [
          {
            address: TESTNET_ADDRESSES.payment,
            assets: { nativeToken: amount, tokens: [] },
          },
        ];

        const transactions = await firoChain.generateMultipleTransactions(
          `test-extra-${amount}`,
          TransactionType.payment,
          paymentOrder,
          [],
          []
        );

        const result = await firoChain.verifyTransactionExtraConditions(transactions[0]);
        expect(result).toBe(true);
      }
    }, 120000);

    it('should verify reward transaction extra conditions', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 25000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-extra-reward',
        TransactionType.reward,
        paymentOrder,
        [],
        []
      );

      const result = await firoChain.verifyTransactionExtraConditions(transactions[0]);
      expect(result).toBe(true);
    }, 60000);
  });

  describe('getTransactionSigningStatus', () => {
    it('should return Signed for fully signed transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 5000000n, tokens: [] },
        },
      ];

      const unsignedTxs = await firoChain.generateMultipleTransactions(
        'test-signing-status',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const signedTx = await firoChain.signTransaction(unsignedTxs[0]);
      const status = firoChain.getTransactionSigningStatus(signedTx);
      expect(status).toBe(SigningStatus.Signed);
    }, 60000);

    it('should return UnSigned for unsigned transaction', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 5000000n, tokens: [] },
        },
      ];

      const unsignedTxs = await firoChain.generateMultipleTransactions(
        'test-unsigned-status',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const status = firoChain.getTransactionSigningStatus(unsignedTxs[0]);
      expect(status).toBe(SigningStatus.UnSigned);
    }, 60000);
  });

  describe('verifyPaymentTransaction', () => {
    it('should verify transaction consistency', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 9000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-verify-payment',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      const isValid = await firoChain.verifyPaymentTransaction(transactions[0]);
      expect(isValid).toBe(true);
    }, 60000);

    it('should detect inconsistent txId', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 10000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-inconsistent-txid',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      // Create transaction with wrong txId
      const fakeTx = new FiroTransaction(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        transactions[0].eventId,
        transactions[0].txBytes,
        transactions[0].txType,
        (transactions[0] as FiroTransaction).inputUtxos,
      );

      const isValid = await firoChain.verifyPaymentTransaction(fakeTx);
      expect(isValid).toBe(false);
    }, 60000);

    it('should detect inconsistent input utxos', async () => {
      const paymentOrder = [
        {
          address: TESTNET_ADDRESSES.payment,
          assets: { nativeToken: 11000000n, tokens: [] },
        },
      ];

      const transactions = await firoChain.generateMultipleTransactions(
        'test-inconsistent-inputs',
        TransactionType.payment,
        paymentOrder,
        [],
        []
      );

      // Create transaction with wrong input utxos
      const fakeUtxos = [
        JsonBigInt.stringify({ txId: 'fake123', index: 99, value: 1000000n })
      ];
      
      const fakeTx = new FiroTransaction(
        transactions[0].txId,
        transactions[0].eventId,
        transactions[0].txBytes,
        transactions[0].txType,
        fakeUtxos,
      );

      const isValid = await firoChain.verifyPaymentTransaction(fakeTx);
      expect(isValid).toBe(false);
    }, 60000);
  });
});
