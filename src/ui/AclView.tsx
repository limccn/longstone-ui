import { useMemo, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { memoryRegistryAbi } from '@limccn/menhir-core';
import { useSettings } from '../settings/useSettings';
import { signersForOwner, toUiError } from '@limccn/longstone-surface';
import { useChainIndex } from '../chain/useChainIndex';
import { CHAIN_ID } from '../wallet/config';
import { isWriteChain } from '../wallet/chainGuard';

const ROLE_COMMIT = 1n;
const ROLE_RETRACT = 2n;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function rolesLabel(roles: bigint): string {
  const parts: string[] = [];
  if ((roles & ROLE_COMMIT) !== 0n) parts.push('commit');
  if ((roles & ROLE_RETRACT) !== 0n) parts.push('retract');
  return parts.length === 0 ? 'none' : parts.join(' + ');
}

function short(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function AclView() {
  const { address, isConnected, chainId } = useAccount();
  const settings = useSettings();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const { data: index, refetch } = useChainIndex();
  const [signerInput, setSignerInput] = useState('');
  const [roleCommit, setRoleCommit] = useState(true);
  const [roleRetract, setRoleRetract] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Known signers come from SignerUpdated events in the scan; latest mask wins.
  const signers = useMemo(() => {
    if (index === undefined || address === undefined) return [];
    return signersForOwner(index, address);
  }, [index, address]);

  const validSigner = ADDRESS_RE.test(signerInput);
  const registryReady = settings.registryAddress !== '';
  const wrongChain = isConnected && !isWriteChain(chainId);

  // Fresh on-chain read for the address being edited (may not be in scan yet).
  const { data: currentRoles } = useReadContract({
    address: registryReady
      ? (settings.registryAddress as `0x${string}`)
      : undefined,
    abi: memoryRegistryAbi,
    functionName: 'rolesOf',
    args: address !== undefined && validSigner ? [address, signerInput as `0x${string}`] : undefined,
    query: { enabled: address !== undefined && validSigner && registryReady },
  });

  async function setRoles(roles: bigint): Promise<void> {
    if (
      address === undefined ||
      !isWriteChain(chainId) ||
      !registryReady ||
      !validSigner ||
      publicClient == null
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        chainId: CHAIN_ID,
        address: settings.registryAddress as `0x${string}`,
        abi: memoryRegistryAbi,
        functionName: 'setSigner',
        args: [signerInput as `0x${string}`, roles],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setNotice(
        roles === 0n
          ? `Revoked all roles for ${short(signerInput)}. tx ${hash}`
          : `Granted ${rolesLabel(roles)} to ${short(signerInput)}. tx ${hash}`,
      );
      setSignerInput('');
      void refetch();
    } catch (err) {
      setError(toUiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <section data-testid="acl">
        <h2>Access control</h2>
        <p className="empty">Connect the owner wallet to manage signers.</p>
      </section>
    );
  }

  if (!registryReady) {
    return (
      <section data-testid="acl">
        <h2>Access control</h2>
        <p className="empty">Set the registry contract address in Settings first.</p>
      </section>
    );
  }

  const roles = (roleCommit ? ROLE_COMMIT : 0n) | (roleRetract ? ROLE_RETRACT : 0n);

  return (
    <section data-testid="acl">
      <h2>Access control</h2>
      <p>
        Agents sign commits with their own key. Grant <code>commit</code> to let an
        agent write on your behalf, <code>retract</code> to let it withdraw.
        Revoking sets the signer&apos;s roles to <code>none</code>.
      </p>

      {wrongChain && (
        <p className="empty" data-testid="acl-wrong-chain">
          Wrong network. Switch to Base Sepolia to manage signers.{' '}
          <button
            type="button"
            className="warn"
            data-testid="acl-switch-network"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
          >
            Switch to Base Sepolia
          </button>
        </p>
      )}

      <div className="row">
        <input
          data-testid="acl-signer"
          className="mono wide"
          placeholder="agent address (0x…)"
          value={signerInput}
          onChange={(event) => setSignerInput(event.target.value.trim())}
        />
        <label>
          <input
            type="checkbox"
            data-testid="acl-role-commit"
            checked={roleCommit}
            onChange={(event) => setRoleCommit(event.target.checked)}
          />{' '}
          commit
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="acl-role-retract"
            checked={roleRetract}
            onChange={(event) => setRoleRetract(event.target.checked)}
          />{' '}
          retract
        </label>
        <button
          type="button"
          data-testid="acl-grant"
          disabled={busy || wrongChain || !validSigner || roles === 0n}
          onClick={() => void setRoles(roles)}
        >
          {busy ? 'Signing…' : 'Grant'}
        </button>
        <button
          type="button"
          data-testid="acl-revoke"
          disabled={busy || wrongChain || !validSigner}
          onClick={() => void setRoles(0n)}
        >
          Revoke
        </button>
      </div>

      {validSigner && currentRoles !== undefined && (
        <p data-testid="acl-current-roles">
          On-chain roles for {short(signerInput)}:{' '}
          <strong>{rolesLabel(currentRoles as bigint)}</strong>
        </p>
      )}

      <h3>Current signers</h3>
      {signers.length === 0 ? (
        <p className="empty">No delegated signers yet. Your wallet is the only writer.</p>
      ) : (
        <ul data-testid="acl-list">
          {signers.map((entry) => (
            <li key={entry.signer}>
              <span className="mono">{entry.signer}</span> —{' '}
              <strong>{rolesLabel(entry.roles)}</strong>{' '}
              <span className="hint">(block {entry.updatedAt.toString()})</span>
            </li>
          ))}
        </ul>
      )}

      {notice !== null && (
        <p className="notice" data-testid="acl-notice" role="status">
          {notice}
        </p>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        Setting signer roles is signed by your connected owner wallet (msg.sender is
        the owner — implicit superuser). Revoking only stops future writes; already
        anchored memories stay verifiable.
      </p>
    </section>
  );
}
