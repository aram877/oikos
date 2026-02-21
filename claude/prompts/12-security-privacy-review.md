# Prompt: Security Review

Review this codebase for security vulnerabilities.

## Focus Areas

- SQL injection risks
- Auth bypass possibilities
- Sensitive financial data leakage (logs, error messages, responses)
- CSV injection (formula injection via imported data)
- Rate limiting gaps
- Error message verbosity (stack traces in production)
- Insecure direct object references (IDOR)
- Missing input validation

## How to Use

Paste the relevant code after this prompt, then ask:

> "Review this for security vulnerabilities using the focus areas above."

## Deliver

1. Critical vulnerabilities (must fix before shipping)
2. Medium risks (fix soon)
3. Best practice gaps (low priority but worth noting)
4. Immediate fixes with code examples
5. Security headers checklist (CORS, CSP, HSTS, etc.)
