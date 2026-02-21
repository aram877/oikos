# Route: [METHOD] /api/[path]

## Purpose

One sentence describing what this endpoint does.

## Request

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Path params:**
```
id: string (UUID)
```

**Query params:**
```
page?: number (default: 1)
limit?: number (default: 50, max: 200)
```

**Body:**
```json
{
  "field": "value"
}
```

## Validation Rules

- `field` is required, must be a non-empty string
- `amount` must be an integer (cents), non-zero
- `date` must be a valid ISO 8601 date string

## Response

**Success (200 / 201):**
```json
{
  "data": {},
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 123
  }
}
```

**Error (400):**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable description",
  "fields": {
    "amount": "Must be a non-zero integer"
  }
}
```

**Error (401):**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Missing or invalid token"
}
```

**Error (404):**
```json
{
  "error": "NOT_FOUND",
  "message": "Transaction not found"
}
```

## Security Considerations

- Requires auth: yes / no
- Ownership check: does the resource belong to the requesting user?
- Rate limited: yes / no

## Performance Considerations

- Uses index on: [column]
- Expected row count: small / medium / large
- Pagination: required / optional / not applicable
