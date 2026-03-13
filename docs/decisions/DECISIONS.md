# DECISIONS.md — Sofi’s Restaurant Key Architectural Decisions

## 1. Routing
- Deterministic `/menu` route to avoid blank pages
- Lazy loading for non-critical pages with fallback UI
- `lazyPick()` ensures missing exports are caught with visible errors

## 2. State & Data Management
- **Zustand** for lightweight state management
- **React Query** for server data fetching
- Modular state per feature

## 3. AI-Assisted Code
- AI can create new features, modules, components
- Human review required for critical modules (router, providers, auth, checkout)
- `.cursorrules` defines safe AI behavior

## 4. Testing & Coverage
- Vitest for unit and integration tests
- Coverage required for core modules (`menu`, `checkout`, `orders`, `auth`)

## 5. Styling & UI
- Tailwind v4, modular classes
- Component-level styling encouraged; global in `/styles`
- Reusable typography, forms, and line-clamp plugins

## 6. Security
- AuthGuard & RoleGuard enforce permissions
- CSRF protection, rate limiting, and Stripe PCI compliance
- Sensitive modules restricted for AI editing

## 7. Deployment
- `main` branch deploys production
- `develop` for active development
- Staging environment validates features before production

## 8. Folder & File Decisions
- Modular folder layout for scalability
- `contracts` for shared types
- `features` for admin, marketing, and analytics modules