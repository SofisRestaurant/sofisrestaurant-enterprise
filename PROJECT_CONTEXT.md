# PROJECT_CONTEXT.md — Sofi’s Restaurant Platform

## 1. Project Overview

Sofi’s Restaurant Platform is a production-grade restaurant operating system designed to manage:

- Customer online ordering and reservations
- Checkout and secure payment processing
- Kitchen display and expo systems
- Admin dashboard for operations, finance, and marketing
- Loyalty programs and marketing automation
- Inventory management and staff operations
- Analytics and reporting

The platform is **modular, secure, and scalable**, built with React, TypeScript, Tailwind CSS, Supabase, and Stripe. It follows strict TypeScript and React standards, with clear separation of modules, pages, and components.

---

## 2. Long-term Vision

The goal is to grow the platform into a **full SaaS restaurant ecosystem**, including:

- Multi-location support
- Integrated marketing automation
- Customer loyalty and referral systems
- Advanced analytics dashboards for operations and finance
- Staff scheduling and role management
- AI-assisted optimization tools (menu recommendations, promotions, and abandoned cart recovery)

AI-generated features must **always follow existing architecture, authentication rules, and security standards**.

---

## 3. Modules & Responsibilities

### Public / Customer-Facing

- **Pages:** Home, Menu, About, Contact, Gallery, Catering, Reservations, Reviews
- **Checkout & Payments:** Stripe integration for secure payment and order confirmation
- **Account Management:** Customer profile, order history, and password management
- **Marketing Hooks:** Newsletter signup, promotions

### Admin / Staff

- **Admin Dashboard:** Overview of orders, revenue, analytics
- **Kitchen & Expo Screens:** Live order tracking and fulfillment
- **Menu Management:** Add/edit/remove menu items
- **Loyalty & Marketing:** Scan loyalty codes, manage campaigns, track abandoned carts
- **Finance:** Tax reporting, order revenue, transaction history
- **Notifications & Alerts:** Admin and staff notifications

---

## 4. Architecture Principles

- **Modular:** Separate concerns into `app`, `modules`, `features`, `pages`, `components`
- **Routing:** React Router handles all routes with `AuthGuard` and `RoleGuard` for access control
- **Lazy Loading:** Large modules are lazy-loaded, except critical pages like `/menu`
- **Single Source of Truth:** Supabase database for all persistent data
- **Security First:** Authentication, RLS, and server-side Stripe validation
- **Consistency:** Follow existing coding and naming conventions strictly

---

## 5. AI Integration Guidelines

- AI tools (Cursor, Claude, or similar) must only **extend existing modules**, **never bypass auth**, and **never expose secrets**.
- All new features must adhere to:
  - Folder structure
  - Export conventions
  - TypeScript strict rules
  - Tailwind styling rules
- AI suggestions should **reference existing modules and components first** before creating new ones.

---

## 6. Code Ownership & Maintenance

- All new modules must include **self-contained logic and exports**
- Critical modules (router, auth, payment, kitchen/expo) should **not be refactored automatically** without human approval
- All changes must **maintain backward compatibility** unless explicitly upgrading or replacing a module

---

## 7. Project Dependencies & External Services

- **Frontend:** React, TypeScript, Tailwind CSS
- **Backend:** Supabase (Auth, Database, RLS)
- **Payments:** Stripe (Checkout, Webhooks)
- **Hosting:** Netlify
- **Analytics / Monitoring:** Sentry, Web Vitals
- **Build:** Vite, TSConfig path aliases

---

## 8. Developer / AI Instructions

1. Always reference `.cursorrules` and `AI_RULES.md` before adding or editing code
2. Follow project folder hierarchy and naming conventions
3. Respect roles and access levels (`admin`, `staff`, `customer`)
4. Extend functionality rather than introducing duplicate patterns
5. Ensure any AI-generated code is **reviewable and testable** before production

---

**End of PROJECT_CONTEXT.md**