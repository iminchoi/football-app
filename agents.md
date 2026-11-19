# [AGENTS.md](http://AGENTS.md)

Think and work in English. Reply in Korean.

## Git Commit Automation Rule

- Whenever you finish modifying or creating code files, automatically stage (`git add -A`) and commit (`git commit`) the changes without waiting for an extra prompt.

- Write the commit message in **Korean**, limited to **1 to 2 short lines**.

- Explain **what was changed and why** in plain, everyday language—avoid difficult developer jargon, English buzzwords, or vague phrases like "코드 리팩토링" or "버그 수정".

  - Good example:

    `과거 날짜 경기가 라이브로 뜨던 오류 수정 및 김민재 수비수 이벤트에서 골키퍼 선방이 나오던 문제 해결`

  - Bad example:

    `fix: refactor priceEngine event whitelist and normalize match status`

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



8. Project Status Tracking ([`STATUS.md`](http://STATUS.md)) - **Auto-Update After Every Task:** Whenever a code modification task is completed, create or update [`STATUS.md`](http://STATUS.md) in the project root (`football-app/[STATUS.md](http://STATUS.md)`). - **Keep It Current & Concise:** Overwrite outdated entries with the latest snapshot (max ~30 lines) using neutral English documentation style (no conversational filler): - `## Current State`: Summary of working features and latest `tsc` / build verification status. - `## Recent Changes`: Bullet list of files modified in the last completed task and what changed. - `## Known Issues & Next Steps`: Remaining bugs, unverified items, or logical next tasks. - **Read First on New Sessions:** At the start of any new session, read [`STATUS.md`](http://STATUS.md) alongside [`AGENTS.md`](http://AGENTS.md) to restore project context immediately.
9. Visual & UI Design System (PitchTrade Aesthetic)

- **Surface & Depth**: Use true obsidian black (`#060709`) as base canvas and subtle charcoal (`#0F1115`) for elevated surfaces. Avoid heavy borders; separate sections with negative space and hairline `1px solid rgba(255,255,255,0.07)`.
- **No AI Clichés**: Never use cheesy grass stripe patterns, loud gradient banners, bubbly cartoon pins, or generic card boxes.
- **Color Restraint**: Keep 90% of the UI monochrome (pure white `#FFFFFF` primary text, `#71717A` muted zinc labels). Use electric mint/lime (`#10B981` / `#A3E635`) and coral (`#F43F5E`) strictly for price action and primary CTAs.
- **Sports Typography**: Treat jersey numbers, match minutes (`71'`), and scores as bold editorial typography (large `tabular-nums`, tight tracking `-0.03em`) inspired by modern sports broadcast graphics.