# Canall: Architectural Blueprint (Phase 1)

## Overview
Canall is a cross-platform, end-to-end encrypted (E2EE) chat application built with a Zero-Knowledge backend architecture.

## Tech Stack
- **Client (Web/Linux):** React (TypeScript) + Electron
- **Client (Android):** React Native
- **Backend (Relay):** Node.js + WebSocket (ws)
- **Database (Ephemeral):** Redis
- **Cryptography:** Web Crypto API (Web/Linux), react-native-quick-crypto (Android)

## Cryptographic Protocol
- **Key Exchange:** Elliptic Curve Diffie-Hellman (ECDH) using P-256 or X25519.
- **Encryption:** AES-GCM (256-bit) for message payloads.
- **Authentication:** EdDSA (Ed25519) for message signing and identity verification.
- **Derivation:** HKDF for session key derivation from shared secrets.

## Project Structure (Monorepo)
- `apps/server`: Node.js WebSocket Relay Server.
- `apps/web`: React Web application (also used for Electron/Linux).
- `apps/mobile`: React Native Android application.
- `packages/shared`: Shared cryptographic logic and TypeScript definitions.
