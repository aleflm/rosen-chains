# Changelog

All notable changes to this project will be documented in this file.

## [0.0.0] - 2025-11-07

### Added

- Initial implementation of Firo chain for Rosen bridge
- FiroChain class extending AbstractUtxoChain
- FiroTransaction class for transaction handling
- AbstractFiroNetwork interface for blockchain operations
- Firo-specific constants and utilities
- Basic serialization support for PSBT transactions

### Dependencies

- bitcoinjs-lib: ^6.1.5
- @rosen-bridge/rosen-extractor: ^11.0.0
- @rosen-chains/abstract-chain: ^15.0.1

### Notes

- This is the initial placeholder implementation
- Core transaction generation and signing methods need implementation
- Network interface implementations will be added in future versions
