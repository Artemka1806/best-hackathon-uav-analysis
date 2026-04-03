# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server (http://localhost:5173)
npm run build     # Type-check and build for production
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Architecture

**Stack:** React 19 + TypeScript, Vite, Tailwind CSS, Shadcn/ui (Radix UI), React Router v7, Zustand, TanStack Query, React Hook Form + Zod.

**Entry points:** `src/main.tsx` mounts the app; `src/providers/index.tsx` wraps with QueryClientProvider and toast; `src/App.tsx` owns routing via React Router `BrowserRouter`.

**API layer (`src/lib/api.ts`):** Generic `fetch` wrapper exported as `api.get/post/put/patch/delete`. Sends credentials (cookies), reads `VITE_API_URL` (defaults to `http://localhost:8000`). Throws `Error` on non-OK responses.

**State management:**
- Server state → TanStack Query (`src/lib/query-client.ts`)
- Auth/user state → Zustand store (`src/store/auth.store.ts`): `useAuthStore` exposes `user`, `setUser`, `clearUser`

**UI components:** Shadcn/ui components live in `src/components/ui/`. Use the `cn()` utility from `src/lib/utils.ts` (wraps `clsx` + `tailwind-merge`) for conditional class names. Add new Shadcn components via `npx shadcn@latest add <component>`.

**Path alias:** `@/*` resolves to `src/*`.

**Environment:** Copy `.env.example` to `.env` and set `VITE_API_URL` to point at the backend.

**E2E tests:** Playwright tests go in `./tests/`. The config auto-starts `npm run dev` before running tests.