# ARCHITECTURE.md — Sofi’s Restaurant Project Architecture

## 1. Overview
This document defines the **project architecture**, including folder structure, module responsibilities, and AI/human boundaries.  
It ensures **scalable, maintainable, and secure development**.

---

## 2. Folder Structure
/src
├─ _archive_ai_source/       # Historical AI-generated code
├─ app/                     # Core application (RootLayout, Providers, router)
├─ assets/                  # Images, fonts, icons
├─ components/              # Shared React components
├─ contexts/                # React Context providers
├─ contracts/               # Shared TypeScript types/interfaces
├─ domain/                  # Domain/business logic
├─ features/                # Feature modules (admin dashboard, marketing, etc.)
├─ hooks/                   # Custom React hooks
├─ lib/                     # Generic helper functions
├─ modules/                 # Core functional modules (menu, checkout, orders)
├─ pages/                   # Page-level components
├─ providers/               # Third-party service wrappers (Stripe, Supabase)
├─ security/                # Auth, CSRF, rate limiting, compliance
├─ services/                # API services and backend integrations
├─ shared/                  # Constants, enums, common UI elements
├─ status/                  # Global status handlers
├─ styles/                  # Tailwind + global CSS
├─ tests/                   # Unit and integration tests
├─ trust/                   # Audits, logs, trust/security documentation
├─ types/                   # Type definitions
├─ utils/                   # Generic utility functions
└─ vite-env.d.ts            # Vite environment typings
---

## 3. Core Principles

1. **Modular & Typed**
   - Each feature has its own folder.
   - TypeScript used throughout with types in `/contracts` or `/types`.

2. **AI-Assisted Development**
   - AI can create code **only in modular folders** (components, pages, modules, lib).
   - Sensitive modules (`router.tsx`, `Providers.tsx`, payment, auth) must be human-reviewed.
   - All AI code must follow `.cursorrules` and `AI_RULES.md`.

3. **Role-Based Access**
   - `AuthGuard` and `RoleGuard` enforce permissions.
   - Protected modules/components should only be modified by authorized developers.

4. **Lazy Loading & Deterministic Routes**
   - Critical pages (`/menu`) remain deterministic.
   - Non-critical pages use lazy-loading with **error handling for missing exports**.

5. **Testing**
   - Every module should have **unit and integration tests**.
   - Coverage thresholds must be met as per `DEV_WORKFLOW.md`.

6. **Tailwind & Styling**
   - Reusable Tailwind classes.
   - Component-level styling within `className`.
   - Global CSS in `/styles`.

---

## 4. Key Modules

- **Menu & Orders** — `/modules/menu`, `/modules/orders`
- **Checkout & Payment** — `/modules/checkout`, `/modules/orders`
- **User Accounts** — `/pages/Account`, `/modules/user`
- **Admin & Marketing** — `/features/admin`, `/pages/Admin/Marketing`
- **Kitchen & Expo** — `/modules/orders/components/KitchenScreen`, `/modules/orders/components/ExpoCommandCenter`
- **Security & Compliance** — `/security`, `/compliance`

---

## 5. Naming & Export Conventions

- **Files:** PascalCase for React components (`MenuPage.tsx`)  
- **Folders:** camelCase (`orderHistory`)  
- **Exports:** Named for utilities, default for pages/components

---