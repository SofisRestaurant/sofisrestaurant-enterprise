# INSTRUCTION: Sofi’s Restaurant — Coding & Architecture Rules

You are a developer/AI assistant for **Sofi’s Restaurant**. Follow these rules strictly when creating or modifying code, architecture, or documentation. Do not bypass any guideline.  

---

## 1. Project Overview
The Sofi’s Restaurant platform includes:
- Customer ordering system
- Checkout and payments (Stripe)
- Kitchen display and expo modules
- Admin dashboard, marketing, and analytics
- Loyalty programs
- Inventory and staff management

Use this as context when writing or modifying code.

---

## 2. Technology Stack
- Frontend: React + TypeScript
- Styling: Tailwind CSS
- Backend / Database: Supabase
- Payments: Stripe
- Build / Bundler: Vite
- Deployment / Hosting: Netlify

---

## 3. Coding Standards

**TypeScript**
- Strict typing (`strict: true`) is mandatory.
- Avoid `any` unless absolutely required.
- All React props must be explicitly typed.
- Use enums or union types for constants, roles, and flags.

**React Components**
- Use functional components only.
- Use hooks (`useState`, `useEffect`, custom hooks).
- Prefer `memo` and `useCallback` to prevent unnecessary re-renders.
- Components must follow modular separation:
  - `/components` — reusable UI
  - `/pages` — route entry points

**Exports**
- Default exports for pages and layout components.
- Named exports for utilities and shared components.

**Imports**
- Use `@` alias for `src` paths consistently.
- Group imports: external → internal → styles → assets.

**Styling**
- Use Tailwind utility classes.
- Avoid inline styles except for dynamic/conditional logic.
- Do not import external CSS unless absolutely required.

---

## 4. Project Architecture Rules

**Folder Organization**
- `src/app` — boot logic, providers, layouts
- `src/modules` — core modules (orders, checkout, menu)
- `src/features` — admin features and internal tools
- `src/pages` — router entry points
- `src/components` — reusable UI components
- `src/services` — API clients and integrations
- `src/hooks` — custom hooks
- `src/utils` — utilities and helpers

**Routing**
- Every route must return a valid component.
- Lazy-load large route modules only.
- Admin routes require authentication.
- Role-protected routes must use `RoleGuard`.
- Do not create empty or placeholder route components.

**Modules**
- Extend existing modules instead of creating duplicates.
- Follow consistent export and naming patterns across all modules.

---

## 5. Authentication & Roles
- Authentication via Supabase Auth.
- Role-based access enforced via `AuthGuard` and `RoleGuard`.
- Roles:
  - `admin` — full access
  - `staff` — kitchen, expo, internal tools
  - `customer` — public pages and order history
- Never bypass authentication or role checks.

---

## 6. Security Rules

**API Keys & Secrets**
- Do not store secrets in frontend code.
- Use `.env.local` for environment variables.

**Payments**
- Stripe validation occurs server-side.
- Never trust client-side payment responses.

**Data Protection**
- Use Supabase RLS for sensitive tables.
- Encrypt personal data in transit.

**Access Control**
- Admin pages require admin roles.
- Staff pages require staff/admin roles.
- Customers access only customer-specific data.

---

## 7. Performance Guidelines
- Lazy-load heavy routes.
- Use `React.memo`, `useCallback`, `useMemo` where needed.
- Optimize images and assets.
- Minimize bundle size.
- Avoid unnecessary DOM nodes and deep nesting.
- Ensure deterministic route loading for critical pages (e.g., `/menu`).

---

## 8. AI Behavior Guidelines
- Follow architecture strictly; do not create routes, modules, or folders outside the structure without approval.
- Do not perform major refactors automatically.
- AI-generated code must follow TypeScript strict rules.
- Follow modular patterns; never duplicate components.
- Respect `AuthGuard` and `RoleGuard` for all protected routes.
- Never expose secrets, bypass auth, or ignore RLS policies.
- Follow existing naming conventions.
- Prefer extending modules over creating new patterns unnecessarily.

---

## 9. Documentation & References
- Document all decisions in `docs/`.
- `docs/architecture` — system-level diagrams.
- `docs/decisions` — reasoning behind changes.
- `docs/security` — auth, RLS, and payment security decisions.
- Update `AI_RULES.md` whenever rules are changed.

---

# END OF INSTRUCTION