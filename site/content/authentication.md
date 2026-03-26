---
layout: layouts/doc.njk
title: Authentication
description: How to authenticate WRL API requests using bearer tokens, manage per-tenant API keys, understand scopes, and rotate keys safely.
---

# Authentication

Every WRL request that creates or reads captures requires a bearer token. This guide covers how to use your API key, what scopes control access, and how operators manage keys.

## Using Your API Key

Set your API key as a bearer token in the `Authorization` header on every request.

```bash
curl https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Replace `YOUR_API_KEY` with your actual key. Keys issued by the admin API are prefixed with `wrl_live_`. Keep your key secret -- anyone who has it can submit captures and read your capture history.

### Scopes

Every API key is granted one or more scopes that control which endpoints it can reach.

| Scope | What it allows |
|-------|----------------|
| `capture` | Submit new captures (`POST /v1/captures`, `POST /v1/captures/batch`). Implies `read`. |
| `read` | List captures (`GET /v1/captures`), retrieve capture records and artifacts, and run verifications. |
| `admin` | Reserved for future use. Has no runtime effect today -- admin endpoints use a separate credential. |

Because `capture` implies `read`, a key with `capture` scope can do everything a `read`-only key can do plus submit new captures.

### Endpoint scope requirements

| Endpoint | Required scope |
|----------|----------------|
| `POST /v1/captures` | `capture` |
| `POST /v1/captures/batch` | `capture` |
| `GET /v1/captures` | `read` |
| `GET /v1/captures/{id}` | None (public) |
| `GET /v1/captures/{id}/status` | None (public) |
| `GET /v1/captures/{id}/artifacts/*` | None (public) |
| `GET /v1/verify/{id}` | None (public endpoint) |
| `GET /.well-known/signing-key` | None (public endpoint) |
| `GET /.well-known/signing-keys` | None (public endpoint) |
| `POST /v1/webhooks` | `capture` |
| `GET /v1/webhooks` | `capture` |
| `DELETE /v1/webhooks/{id}` | `capture` |
| `POST /v1/webhooks/{id}/ping` | `capture` |
| `POST /v1/admin/keys` | Admin credential |
| `GET /v1/admin/keys` | Admin credential |
| `DELETE /v1/admin/keys/{keyHash}` | Admin credential |

> **Note:** The verification endpoint and individual capture endpoints are public by design -- anyone with the capture ID can access the capture and its artifacts. The list endpoint (`GET /v1/captures`) requires your API key.

---

## Managing API Keys (Operators)

If you operate a WRL deployment, you manage API keys through the admin API. Admin endpoints require a separate admin credential -- a secret key set by the operator during deployment. This credential is distinct from tenant API keys and does not grant capture or read access.

### Create a key

```bash
curl -X POST https://api.webresourceledger.com/v1/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "acme-corp",
    "scopes": ["capture"],
    "name": "ci-pipeline"
  }'
```

```json
{
  "key": "wrl_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefghij",
  "keyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "tenantId": "acme-corp",
  "scopes": ["capture"],
  "name": "ci-pipeline",
  "createdAt": "2026-03-22T12:00:00.000Z",
  "warning": "Store this key now. It cannot be retrieved after this response."
}
```

**The raw key is shown exactly once.** Store it immediately -- it cannot be retrieved later. The `keyHash` is the opaque identifier returned at creation time; you will use it if you need to revoke this key.

Request fields:

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | string | Identifier for the tenant this key belongs to. Lowercase letters, digits, underscores, and hyphens. Max 64 characters. |
| `scopes` | array | One or more of: `capture`, `read`, `admin`. |
| `name` | string | Human-readable label. 1--128 characters. |

### List keys

```bash
curl https://api.webresourceledger.com/v1/admin/keys \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

```json
{
  "keys": [
    {
      "keyHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "tenantId": "acme-corp",
      "scopes": ["capture"],
      "name": "ci-pipeline",
      "createdAt": "2026-03-22T12:00:00.000Z",
      "createdBy": "admin"
    }
  ]
}
```

The list never includes raw key values. Use `keyHash` values to identify keys for revocation.

### Revoke a key

Pass the `keyHash` from the creation response (or the list endpoint) to revoke a key immediately.

```bash
curl -X DELETE \
  https://api.webresourceledger.com/v1/admin/keys/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

Revocation is immediate and idempotent. Revoking a key that is already revoked returns the same response without error.

### Key rotation pattern

To rotate a key without downtime:

1. **Create a new key** for the same tenant and scope.
2. **Distribute the new key** to all systems that use the old one.
3. **Verify** the new key is working in production.
4. **Revoke the old key** using its `keyHash`.

This order ensures access is never interrupted. The brief window where both keys are valid is safe -- old captures remain accessible regardless of which key created them.

---

<details>
<summary>Legacy Single-Key Mode</summary>

Early WRL deployments used a single static bearer token called `CAPTURE_API_KEY`. This key is set directly by the operator during deployment and applies to all requests.

```bash
curl -X POST https://api.webresourceledger.com/v1/captures \
  -H "Authorization: Bearer YOUR_CAPTURE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

When per-tenant key management is enabled (the admin API is configured), the legacy key is disabled. Requests authenticated with the old static key will be rejected.

We recommend migrating to per-tenant keys. Create a key via `POST /v1/admin/keys` and replace the static value in your integrations. Per-tenant keys support scope restrictions, named labels, and individual revocation -- none of which are possible with the legacy single-key mode.

</details>

---

For the full security model behind API key authentication — including hash storage, timing-safe comparison, scope enforcement, and session security — see the [Security Whitepaper](/security/whitepaper/).
