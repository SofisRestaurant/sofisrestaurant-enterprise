# Project Architecture — SofisRestaurantV2

This document provides an overview of the **SofisRestaurantV2** project structure, modules, and recommended organization. Use this as a reference for both developers and AI-assisted coding tools.

---

## 1. Core Folders

- `src/` – Main source code  
- `src/app/` – Bootstrapping, providers, routing  
- `src/components/` – Reusable UI components  
- `src/pages/` – Public, admin, account pages  
- `src/modules/` – Feature-specific modules (menu, orders, checkout)  
- `src/domain/` – Core business logic (loyalty, auth, orders)  
- `src/services/` – Backend integrations and API services  
- `src/hooks/` – Shared React hooks  
- `src/lib/` – Utilities, analytics, API clients  
- `src/tests/` – Unit and integration tests  
- `docs/` – Architecture, security, decisions documentation  

---

## 2. Feature Modules

- **menu** – Menu, modifiers, API, UI components  
- **orders** – Order management, kitchen, expo modules  
- **checkout** – Payment flows, Stripe integration  
- **auth** – Authentication, session management  
- **admin** – Admin dashboard, finance, marketing, growth  
- **loyalty** – Rewards, tiers, customer engagement  

---

## 3. Backend

- **Supabase Functions** – Server-side workflows and business logic  
- **Policies** – Row-Level Security (RLS) for sensitive data  
- **Migrations** – Database schema changes  
- **Triggers** – Real-time events (e.g., order paid, status updates)  
- **Functions** – Workflows like checkout, loyalty, and campaign automation  

---

## 4. Testing & Quality

- **Vitest** – Unit and integration testing framework  
- **Coverage** – Enforced with `@vitest/coverage-v8`  
- Maintain **>70% coverage** on all critical modules  
- Follow `DEV_WORKFLOW.md` for development best practices  

---

## 5. Notes

- Keep modules **modular and reusable**.  
- Extend existing modules instead of duplicating logic.  
- Document architecture or feature decisions in `docs/decisions`.  
- All code must adhere to `AI_RULES.md` and `DEV_WORKFLOW.md` standards.