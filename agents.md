# AGENTS.md

Think and work in English. Reply in Korean.

---

## 1. Repo Text & Documentation (Absolute)
Covers code, identifiers, log/error messages, comments, docs, examples, and commit messages.
- Write for a reader who has only the repo: what it is, its contract, how to run and maintain it, and the reason behind each value, exclusion, or exception.
- Say what that reader needs once and briefly; link instead of repeating.
- Never address the requester or session: no requests, no accounts of changes, nothing that needs the conversation or an earlier version to make sense. History belongs in VCS; change explanations in the reply.
- Use English, imperative or neutral third person for all repo text.

---

## 2. Design, Scope & Code Discipline
- **Plan-First Execution:** Before modifying multiple files or core architecture, outline the cases, weigh likelihood against cost, and present a concise implementation plan (files affected, state/data flow changes). Wait for confirmation on major architectural changes; for small, isolated tasks, state a 1-2 line plan and proceed.
- **Ask Before Guessing:** Ask when ambiguity or conflicts change the design; decide minor details autonomously and state them clearly.
- **Minimal & Focused (No Over-Engineering):** Do only what the task needs. No unrequested refactors, renames, reformatting, speculative abstractions, or "future-proofing" boilerplate. Suggest improvements in the reply instead.
- **Objective Judgment:** Judge each question fresh; drop an earlier recommendation once it proves wrong. On factual corrections, agree only if reasoning holds; otherwise explain. On user decisions (naming, structure, scope), raise concerns once, then follow.
- **Production-Ready:** Leave touched code clean in repo conventions, without debug leftovers (`console.log`, unused imports, commented-out code).
- **Commits:** Follow Conventional Commits with an imperative subject (e.g., `feat: add portfolio chart filter`). Body only if needed: `-` bullets, ≤72 chars each, no prose, no restating the subject.

---

## 3. Tech Stack Conventions (Next.js / TypeScript / Tailwind / Zustand)
- **TypeScript Strictness:** Never use `any` or suppress errors (`@ts-ignore`, `eslint-disable`). Define explicit interfaces/types for props, API payloads, and store states.
- **Next.js & React:** Default to Server Components; add `'use client'` only when hooks, browser APIs, or interactive event listeners are required. Keep components focused; extract helpers or hooks only when logic is duplicated or exceeds ~100 lines of distinct responsibility.
- **Zustand State:** Keep store actions atomic and clean. Select only necessary state slices to avoid unnecessary re-renders.
- **Tailwind CSS:** Use standard utility classes and existing project design tokens/color palettes rather than arbitrary hex values unless specified.

---

## 4. Existing Solutions First
- Before writing a function, check in order:
  1. Standard library / Web APIs
  2. Already declared dependencies in `package.json`
  3. An established library not yet declared (propose it per Security rules below)
  4. Custom code
- Do not add a dependency for what a few clear lines of stdlib code handle; use an established library for tricky domains (dates, URLs, parsing, networking, concurrency, crypto).
- Write custom code only when no option meets a stated requirement, checked against docs. Keep it minimal and comment the requirement and options checked.
- Count speed only when measured on that path; fewer lines alone count for nothing.

---

## 5. Evidence & External Code Compliance
- **No Hallucinations:** External facts (APIs, versions, licenses, security) require a checked primary source; repo facts require reading the code itself. Mark anything else unverified or inferred.
- Never invent URLs, domains, package names, CLI flags, or schemas—even as placeholders. Check signatures and config keys against docs for the exact version in use.
- **License & IP Compliance (Absolute):** License compliance comes first. Do not copy, translate, or paraphrase external repositories' code or structure without explicit user approval and license compatibility verification. Comply with all applicable laws, regulations, and third-party API Terms of Service.

---

## 6. Security & Dependency Management
- **Zero Secrets:** Never hardcode API keys, tokens, or sensitive values anywhere (including tests and examples). Always use environment variables (`.env.local`) or secret stores.
- **Dependency Vetting:** Before installing any new package (`npm install`, etc.), propose it and wait for user approval with:
  - Package name & exact registry publisher (to prevent typosquatting)
  - Maintainer, release history, and active maintenance status
  - Why it is needed & alternatives considered
  - Any known security vulnerabilities or supply-chain incidents
- Pin versions cleanly and commit lockfiles (`package-lock.json` / `pnpm-lock.yaml`).

---

## 7. Verification & Compatibility
- **Define & Verify:** Define expected behavior before implementing. Run relevant checks (`npx tsc --noEmit`, linter, tests) after changes.
- **Browser UI Verification:** For UI, layout, or interactive changes, use the built-in browser agent to verify rendering, responsiveness, and zero console errors.
- **Integrity:** Never weaken tests, remove assertions, or fake results to make checks pass. Never claim a command or test passed unless it actually ran and succeeded.
- **Reporting:** Clearly separate what changed, what was verified, and what remains untested or failing, followed by optional suggestions.
- **Compatibility:** Preserve public interfaces, API contracts, and existing user data unless the task explicitly requires a breaking change (flag it before implementing).