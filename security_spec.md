# XAIWork POS Security Specification

## 1. Data Invariants
1. Every shop document (`/shops/{shopId}`) must belong to an authenticated, email-verified user whose `request.auth.uid` matches `ownerUid` (which is immutable after creation).
2. Every subcollection document under `/shops/{shopId}/...` must pass the Master Gate (`get(/databases/$(database)/documents/shops/$(shopId)).data.ownerUid == request.auth.uid`) AND match `data.ownerUid == request.auth.uid`.
3. All document IDs (`shopId`, `branchId`, `itemId`, `tableId`, `orderId`, `shiftId`, `ingredientId`, `reservationId`, `invoiceId`, `logId`, `userId`) must satisfy `^[a-zA-Z0-9_\-]+$` and length `<= 128`.
4. Terminal states (`orders.status in ['paid', 'voided']`, `shifts.status == 'closed'`, `reservations.status in ['seated', 'cancelled', 'no_show']`) cannot be mutated back or overwritten after closing.
5. Audit logs (`/shops/{shopId}/auditLogs/{logId}`) and VAT invoices (`/shops/{shopId}/invoices/{invoiceId}`) are append-only (`update` and `delete` denied).
6. User PII (`/users/{userId}/private/info`) is strictly isolated to `request.auth.uid == userId`.
7. Timestamps (`createdAt`, `updatedAt`, `openedAt`) must equal `request.time`.
8. Unverified emails (`request.auth.token.email_verified != true`) are denied writes.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Shop Create**: `create /shops/shop_1` with `{ ownerUid: "attacker_uid", ... }` by `uid: "user_a"` -> **PERMISSION_DENIED**.
2. **Shadow Field Injection on Shop Create**: `create /shops/shop_1` with extra ghost field `{ isVerified: true }` -> **PERMISSION_DENIED** (`keys().hasOnly(...)`).
3. **OwnerUid Hijack on Shop Update**: `update /shops/shop_1` attempting to change `ownerUid` -> **PERMISSION_DENIED** (immutable `ownerUid` + `affectedKeys().hasOnly(...)`).
4. **Cross-Tenant Subcollection Read**: `get /shops/shop_a/orders/ord_1` as `user_b` -> **PERMISSION_DENIED**.
5. **Unverified Email Write**: `create /shops/shop_a/menuItems/m_1` with `email_verified: false` -> **PERMISSION_DENIED**.
6. **ID Poisoning Attack**: `create /shops/bad$id!...` -> **PERMISSION_DENIED** (`isValidId`).
7. **Timestamp Forgery**: `create /shops/shop_a/orders/ord_1` with backdated `createdAt` (`!= request.time`) -> **PERMISSION_DENIED**.
8. **Terminal State Mutation**: `update /shops/shop_a/orders/ord_1` when `existing().status == 'paid'` trying to change `totalUsd` -> **PERMISSION_DENIED**.
9. **Audit Log Tampering**: `update` or `delete /shops/shop_a/auditLogs/log_1` -> **PERMISSION_DENIED**.
10. **VAT Invoice Deletion**: `delete /shops/shop_a/invoices/inv_1` -> **PERMISSION_DENIED**.
11. **PII Blanket Read**: `get /users/user_a/private/info` by `user_b` -> **PERMISSION_DENIED**.
12. **Blanket List Query Scraping**: `list /shops` without `where('ownerUid', '==', uid)` -> **PERMISSION_DENIED** (`resource.data.ownerUid == request.auth.uid`).
