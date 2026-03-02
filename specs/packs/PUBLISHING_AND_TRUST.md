# Tandem Pack Publishing and Trust

## Scope

Defines publisher identity, signature hooks, verification tiers, and trust UX requirements.
Cryptographic verification implementation may be phased, but schema and UX contracts are fixed now.

## Verification Tiers

- `unverified`: self-asserted publisher identity
- `verified`: marketplace-verified publisher identity
- `official`: first-party Tandem or designated official partner

## Signature File

Optional root artifact:

- filename: `tandempack.sig`
- location: zip root only

For `verified`/`official` marketplace tiers, signature validity is policy-required.

## Signed Scope

Signature payload must bind:

- canonicalized `tandempack.yaml`
- deterministic list of all pack file hashes (except signature file)
- pack identity (`pack_id`, `version`)
- signing metadata (`key_id`, algorithm, timestamp)

Canonical payload shape:

```json
{
  "schema": "tandem.pack.signature.v1",
  "pack_id": "tpk_...",
  "version": "1.0.0",
  "manifest_sha256": "...",
  "files": [{ "path": "agents/github_worker.md", "sha256": "..." }],
  "signed_at": "2026-03-02T00:00:00Z",
  "key_id": "kid_...",
  "alg": "ed25519"
}
```

## Client Trust Status

Client must classify and render one of:

- `missing`
- `valid`
- `invalid`
- `untrusted_key`
- `unsupported`

## Mandatory Client UX Signals

Before install/upgrade, both UIs must show:

- publisher display name
- verification badge
- signature status
- clear warning if status is not `valid`

## Marketplace Publishing Pipeline

1. marker validation
2. archive safety validation
3. manifest schema validation
4. metadata and SPDX validation
5. secret scanning
6. portability scan (`non_portable` classification)
7. signature verification (policy by tier)
8. risk summary generation
9. accept/reject with machine-readable code

## Minimum Reject Codes

- `PACK_MARKER_MISSING`
- `PACK_MANIFEST_INVALID`
- `PACK_MARKETPLACE_FIELDS_MISSING`
- `PACK_ARCHIVE_UNSAFE`
- `PACK_SECRET_DETECTED`
- `PACK_LICENSE_INVALID`
- `PACK_SIGNATURE_REQUIRED`
- `PACK_SIGNATURE_INVALID`
- `PACK_PORTABILITY_POLICY_VIOLATION`

## Local Install Compatibility

Local zip installs remain compatible without marketplace publication metadata/signature, subject to local policy.

## Enterprise Key/Trust Hooks (Future)

- trusted publisher key registry sync
- key pinning for enterprise offline mode
- key rotation with historical release verification retention

## No Script Rule

Marketplace and local policy both prohibit arbitrary post-install execution.
