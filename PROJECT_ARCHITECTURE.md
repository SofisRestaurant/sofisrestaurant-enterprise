# PROJECT_ARCHITECTURE.md — Sofi’s Restaurant Platform

## 1. Overview

This document defines the **architecture and folder structure** of the Sofi’s Restaurant Platform.  
It is intended to guide both human developers and AI-assisted development tools.

The platform follows a **modular architecture**:

- Modular separation by functionality
- Clear routing and access control
- Consistent naming and export patterns
- Scalable for future features

---

## 2. Folder Structure
src/
├─ app/                  # Core application boot, router, and providers
│   ├─ AppBoot.tsx
│   ├─ Providers.tsx
│   ├─ RootLayout.tsx
│   ├─ router.tsx
│   └─ boot/             # Boot-time modules or initializers
├─ modules/              # Core product modules
│   ├─ menu/
│   ├─ orders/
│   ├─ checkout/
│   └─ admin/
├─ features/             # Administrative and internal features
│   ├─ admin-dashboard/
│   ├─ marketing/
│   └─ finance/
├─ pages/                # Route entry points (React Router)
│   ├─ Home.tsx
│   ├─ About/
│   ├─ Contact/
│   ├─ Gallery/
│   ├─ Catering/
│   ├─ Reservations/
│   ├─ Reviews/
│   ├─ Account/
│   ├─ UpdatePassword.tsx
│   └─ Legal/
├─ components/           # Reusable UI components
│   ├─ auth/             # AuthGuard, RoleGuard
│   ├─ ui/               # Buttons, modals, cards
│   └─ layout/           # Layout components
├─ contexts/             # React context providers
├─ hooks/                # Custom hooks
├─ providers/            # Providers for state, query, or theme
├─ services/             # API clients and integration logic
├─ utils/                # Helper functions and utilities
├─ styles/               # Tailwind global styles
├─ types/                # TypeScript types and interfaces
└─ shared/               # Shared constants and helpers
---

## 3. Module Responsibilities

### app/
- Bootstraps the application.
- Sets up routing and providers.
- Contains RootLayout and global providers.
- Handles error boundaries and hydration fallback.

### modules/
- Contains **core product logic** (menu, checkout, orders, admin tools).
- Each module encapsulates its own components, pages, and services.
- Modules communicate via defined interfaces only.

### features/
- Internal tools for admin, marketing, and finance.
- Dashboard and analytics components.
- Role-restricted features.

### pages/
- Each route maps to a component here.
- All public, auth-required, and role-protected routes live here.
- Follows React Router conventions.

### components/
- Reusable UI or logic components.
- AuthGuard, RoleGuard, layout helpers, and UI elements.
- Should never contain route-specific logic.

### contexts/, hooks/, providers/
- Contexts and providers manage state and app-wide behavior.
- Hooks provide reusable logic for components and modules.

### services/
- API clients for Supabase, Stripe, or other integrations.
- Contains business logic that interacts with the backend.

### utils/
- Generic helpers, validators, formatters, constants.
- Shared across modules and pages.

---

## 4. Routing & Access Control

- Routing is handled in `src/app/router.tsx`.
- **Public Routes:** Home, Menu, About, Contact, Gallery, Catering, Reservations, Reviews.
- **Account Routes:** AuthGuard required.
- **Admin / Staff Routes:** AuthGuard + RoleGuard required.
- **Lazy loading:** For large modules; `/menu` is deterministic (no lazy).
- **Error handling:** Each route must return a valid component or `RouteLoadError`.

---

## 5. Naming & Export Conventions

- Pages: default export
- Components: named export allowed
- Modules: default export for main page or component, named exports for sub-components
- Services: named export
- Hooks: named export
- Providers: default export

**Folder & file names** are lowercase, hyphen-separated (`my-feature`) except for pages (`Home.tsx`, `MenuPage.tsx`).

---

## 6. Integration Rules

- Modules may reference shared utilities or components but **never bypass folder boundaries**.
- Admin and staff features must **not be imported into public routes**.
- Payments and sensitive operations must always use services and server-side validation.
- AI-generated code must **follow these folder/module conventions strictly**.

---

## 7. Future-Proofing & Scalability

- Each module should be self-contained.
- Avoid introducing cross-module dependencies unless necessary.
- Architecture allows easy addition of:
  - New modules
  - New pages
  - AI-assisted tools for marketing, loyalty, or analytics

---

## 8. Developer & AI Instructions

1. Always reference `.cursorrules` and `AI_RULES.md`.
2. Place new code in the correct folder based on module responsibilities.
3. Follow export and naming conventions.
4. Respect role-based access control and routing rules.
5. Do not modify critical app-wide modules (`app`, `router`, `Providers`) without approval.

---

**End of PROJECT_ARCHITECTURE.md**