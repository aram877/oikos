# Export Format: finance-tracker-backup.json

## Version

`v1`

The `version` field must always be the first key in the file. Restore logic reads this before parsing anything else.

## Top-Level Structure

```json
{
  "version": 1,
  "exportedAt": "2025-01-15T14:32:00.000Z",
  "appVersion": "0.4.2",
  "contents": {
    "accounts": [],
    "categories": [],
    "transactions": [],
    "splits": []
  },
  "metadata": {
    "accountCount": 0,
    "categoryCount": 0,
    "transactionCount": 0,
    "splitCount": 0,
    "dateRange": {
      "earliest": "2024-01-01",
      "latest": "2025-01-15"
    }
  }
}
```

## Contents

### accounts[]
```json
{
  "id": "uuid",
  "name": "Girokonto",
  "currency": "EUR",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "deletedAt": null
}
```

### categories[]
```json
{
  "id": "uuid",
  "name": "Groceries",
  "parentId": "uuid-or-null",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "deletedAt": null
}
```

### transactions[]
```json
{
  "id": "uuid",
  "accountId": "uuid",
  "amountCents": -4250,
  "currency": "EUR",
  "date": "2024-11-03",
  "description": "REWE Filiale",
  "notes": null,
  "createdAt": "2024-11-03T18:45:00.000Z",
  "deletedAt": null
}
```

### splits[]
```json
{
  "id": "uuid",
  "transactionId": "uuid",
  "categoryId": "uuid",
  "amountCents": -4250,
  "createdAt": "2024-11-03T18:45:00.000Z"
}
```

## Invariants

- All `id` values are UUIDs and globally unique within their collection
- `exportedAt` and `createdAt` are ISO-8601 datetime strings (UTC)
- `date` (transaction date) is an ISO-8601 date-only string (`YYYY-MM-DD`)
- All amounts are integers (cents) — never floats
- Negative amounts are expenses, positive amounts are income
- `splits[].amountCents` for a transaction must sum to `transactions[].amountCents`
- `splits[].transactionId` must reference an `id` in `transactions[]`
- `splits[].categoryId` must reference an `id` in `categories[]`
- `transactions[].accountId` must reference an `id` in `accounts[]`

## Validation Rules on Restore

| Rule | Error if violated |
|------|------------------|
| `version` field present and is an integer | Reject file |
| `version` > app's max supported version | Reject with "file is from a newer version of the app" |
| All required fields present per entity | Reject with field name |
| All amounts are integers | Reject with row reference |
| Referential integrity holds | Reject with broken reference |
| IDs are unique within their collection | Reject with duplicate ID |

## Minimal Valid Example

```json
{
  "version": 1,
  "exportedAt": "2025-01-15T00:00:00.000Z",
  "appVersion": "0.1.0",
  "contents": {
    "accounts": [
      { "id": "a1", "name": "Main", "currency": "EUR", "createdAt": "2025-01-01T00:00:00.000Z", "deletedAt": null }
    ],
    "categories": [
      { "id": "c1", "name": "Food", "parentId": null, "createdAt": "2025-01-01T00:00:00.000Z", "deletedAt": null }
    ],
    "transactions": [
      { "id": "t1", "accountId": "a1", "amountCents": -1000, "currency": "EUR", "date": "2025-01-10", "description": "Test", "notes": null, "createdAt": "2025-01-10T10:00:00.000Z", "deletedAt": null }
    ],
    "splits": [
      { "id": "s1", "transactionId": "t1", "categoryId": "c1", "amountCents": -1000, "createdAt": "2025-01-10T10:00:00.000Z" }
    ]
  },
  "metadata": {
    "accountCount": 1,
    "categoryCount": 1,
    "transactionCount": 1,
    "splitCount": 1,
    "dateRange": { "earliest": "2025-01-10", "latest": "2025-01-10" }
  }
}
```
