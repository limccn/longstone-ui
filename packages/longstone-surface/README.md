# @limccn/longstone-surface

Browser-safe verification surface shared by every MemoryOverEth UI shell (the
web app, the Chrome/Edge extension, and the VS Code webview).

## Trust invariant

Expected digests come from chain state, never from the gateway and never from
the caller:

- `verifyCommitment({ hash, client, registryAddress, gateway })` builds the
  chain reader itself and compares **both** digests: `keccak256(bytes)` against
  the commitment's `contentHash`, and `sha256(bytes)` against its `cidDigest`.
- `verifyByCommitmentHash` is `@internal` and stays exported for tests and
  advanced callers that already own a chain-backed `CommitmentReader`.
- Only the byte-fetch transport (gateway URL, optional hisaishi URL) is
  caller-controlled. No hash function and no expected-digest value is
  injectable, so a gateway that substitutes bytes yields `content-mismatch`,
  never `verified`.

## API

- Verify: `verifyCommitment`, `verifyByCommitmentHash`, `verifyByCid`,
  `makeReader`, `readerFor`, `commitmentHash`, `cidDigest`
- Gateway transport: `fetchFromGateway`, `fetchFromHisaishi`,
  `fetchContentByDigest`, `fetchStagedMemories`, `blockscoutTxUrl`,
  `blockscoutAddressUrl`
- Chain scan: `makePublicClient`, `decodeLog`, `isSignerRecord`, `scanRange`,
  `findDeployBlock`, `memoryRegistryAbi`
- Derivation: `deriveIndex`, `signersForOwner`, `statesForOwner`,
  `predecessorOf`, `successorOf`, `filterByTags`, `EMPTY_INDEX`
- Errors: `UiError`, `toUiError`, `uiMessage`

## Browser-safe

The package imports no Node built-ins and only `@limccn/menhir-core` (root
export; the Node-only `/vectors` subpath is never referenced) and `viem`. It
ships ESM plus type declarations with `"sideEffects": false`.

A CID alone is never an on-chain verdict: `verifyByCid` reports
`not-anchored` because only a commitment hash can prove an on-chain memory.
