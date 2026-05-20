# Enterprise Signing Key Rotation

This runbook covers hosted and enterprise signing keys used for Tandem-owned
security objects. It applies to every `SigningKeyPurpose` lane:

- `context_assertion`
- `approval_receipt`
- `delegation_projection`
- `a2a_peer_assertion`
- `break_glass_admin_assertion`

The private signing key must remain in the hosted control plane or KMS-backed
signer. Runtime services, ACA, worker containers, customer workloads, and LLM
prompts receive only public verifier keyrings.

## Key Metadata

Every verifier keyring entry should carry enough metadata to prevent key reuse
across trust lanes:

- `kid`
- `purpose`
- `organization_id`
- `deployment_id`
- public key bytes
- algorithm
- allowed audiences
- allowed resource-scope prefixes
- `not_before_ms`
- `not_after_ms`
- status
- rotation group

`kid` values are not secret. They should identify the deployment, purpose, time
period, and sequence without exposing KMS project names or raw provider resource
paths. A recommended shape is:

```text
<deployment-id>-<purpose-short-name>-<yyyy-mm>-<sequence>
```

Example:

```text
acme-prod-ctx-2026-05-01
```

## Standard Rotation

Use overlap-based rotation by purpose and deployment.

1. Create a new KMS signing key version for the same organization, deployment,
   purpose, algorithm, audience, and resource-scope envelope.
2. Export or fetch the public key material and create the new verifier keyring
   entry with `status = active` and a future or immediate `not_before_ms`.
3. Deploy verifier keyrings to runtime and ACA before signing any token with the
   new `kid`.
4. Confirm runtime and ACA can verify a canary token signed by the new key.
5. Switch the hosted control plane signer for that purpose/deployment to emit
   the new `kid`.
6. Keep the previous public key in verifier keyrings for at least token TTL,
   maximum clock skew, retry duration, and rollback window. The default overlap
   window is 24 hours.
7. After overlap, stop signing with the old key if it has not already been
   disabled.
8. Mark the old verifier key entry as retired or remove it from generated
   verifier config.
9. Destroy old KMS key material only after audit retention and rollback
   retention requirements are satisfied.

Do not rotate multiple purposes in the same operational change unless an
incident requires it. Separate purpose lanes keep context assertion failures
from accidentally taking down approval receipts, delegation projections, A2A
peer assertions, or break-glass/admin assertions.

## Rollback

Rollback must preserve verifier overlap.

1. Confirm the previous public key is still present and active in runtime and
   ACA verifier keyrings.
2. Switch the hosted signer back to the previous `kid` for only the affected
   purpose/deployment.
3. Mark the failed new key as disabled or inactive in signer configuration.
4. Keep both public keys in verifier keyrings until all tokens signed by the
   failed key have expired.
5. Record the reason, affected purpose, deployment, key ids, start time, end
   time, and validation evidence in the audit log.

Rollback must not broaden resource-scope prefixes, audiences, organization
binding, or deployment binding. If the previous key cannot satisfy the intended
scope, fail closed and mint a corrected replacement key.

## Emergency Revocation

Use emergency revocation when private key material, signer configuration, KMS
permissions, or generated verifier config may be compromised.

1. Disable the affected signer immediately in the hosted control plane or KMS.
2. Generate a replacement key for the same purpose/deployment with the narrowest
   valid scope.
3. Deploy verifier keyrings containing the replacement key.
4. Remove or mark the compromised key inactive in verifier keyrings.
5. Shorten overlap to token TTL plus clock skew only if accepting existing
   tokens is still safe. If not safe, revoke immediately and expect in-flight
   requests to fail closed.
6. Rotate any downstream secrets or credentials exposed by the compromised
   signing lane.
7. Capture audit evidence and incident notes before destroying key material.

Emergency revocation can invalidate active work. That is preferable to allowing
tokens signed with a compromised key to remain trusted.

## Purpose-Specific Notes

Context assertions should use short TTLs, usually 5 to 15 minutes. Verifiers
must reject context assertions signed with approval, delegation, A2A, or
break-glass/admin keys.

Approval receipts may need longer audit visibility than context assertions, but
execution-time acceptance should still be bounded by policy-specific expiry and
action/resource hashes.

Delegation projection keys should be scoped to the narrow delegated resource
branch and external principal class. They must not verify broad hosted context
assertions.

A2A peer assertion keys should be tied to the peer relationship, audience, and
accepted resource envelope. They should not share key ids or verifier namespaces
with vendor delegation projection keys.

Break-glass/admin assertion keys should be disabled by default, heavily audited,
and excluded from normal automated rotation batches.

## Verification Checklist

Before marking rotation complete:

- Runtime verifier config contains the expected new `kid`.
- ACA verifier config contains the expected new `kid`.
- The signer emits the new `kid` for the intended purpose only.
- Tokens signed with the old key verify during the overlap window.
- Tokens signed with the new key verify after signer cutover.
- Tokens signed with a different-purpose key fail closed.
- Tokens outside the key's org, deployment, audience, status window, or
  resource-scope prefix fail closed.
- The old key is retired only after TTL, clock skew, retries, rollback, and
  audit-retention requirements are satisfied.
