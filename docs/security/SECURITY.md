# SECURITY.md — Sofi’s Restaurant Security Guidelines

## 1. Authentication & Authorization
- **AuthGuard** for authenticated routes
- **RoleGuard** for role-based permissions (`admin`, `staff`, `customer`)
- Never bypass guards, even during AI development

## 2. Data Protection
- CSRF tokens enforced for all forms
- Rate limiting on sensitive endpoints (`/checkout`, `/orders`)
- Input validation on both client and server

## 3. Payment Security
- Stripe used for all payment processing
- PCI DSS compliance maintained
- Secrets stored in `.env` and never committed to Git

## 4. AI Safety Rules
- AI can edit only non-sensitive modules
- Critical modules (auth, router, payment) require **human approval**
- Follow `.cursorrules` and `AI_RULES.md`

## 5. Logging & Monitoring
- Sentry for error monitoring
- Web Vitals for performance tracking
- Audit logs for sensitive actions (checkout, admin updates)

## 6. Environment Management
- Separate `.env` files for `development`, `staging`, and `production`
- No secrets in client-side code
- CI/CD validates that environment variables are set before deployment

## 7. Compliance & Audits
- GDPR compliance for user data
- PCI compliance for payment info
- Regular security review every release