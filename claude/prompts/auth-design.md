# Prompt: Auth Design

Design authentication for the MVP.

## Constraints

- Simple email/password only (no OAuth in MVP)
- Secure password hashing (bcrypt or argon2 — justify choice)
- JWT or session-based — justify your decision
- Single user per deployment is acceptable for MVP
- Must be upgradeable to multi-user later without breaking changes

## Deliver

1. Auth flow (register → login → access protected resource → logout)
2. Token/session strategy with justification
3. DB schema additions required (users table, sessions if applicable)
4. Middleware design for protecting routes
5. Security risks and mitigations:
   - Brute force
   - Token theft
   - CSRF (if session-based)
6. Rate limiting strategy for login endpoint
7. Password reset flow (design only, not implementation)
