#!/usr/bin/env python3
"""Sequential implementation and diff-based verification pipeline for football-app.

Runs each configured task through two non-interactive `agy --print` phases:
1. `impl`   (--effort high by default)   -> .pipeline_logs/<name>_impl.log
2. `verify` (--effort xhigh by default)  -> .pipeline_logs/<name>_verify.log

The `verify` phase runs only when `impl` exits with status 0 and reverse-traces
all git diffs and modified files produced during `impl`.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_LOG_DIR = REPO_ROOT / ".pipeline_logs"
EFFORT_CHOICES = ("low", "medium", "high", "xhigh", "max")

COMMON_GUARDRAILS = """\
MANDATORY GUARDRAILS (MUST NEVER BE VIOLATED):
1. Never modify v2.5 economic engine WEIGHTS, RATES, or pass criteria constants (including `src/lib/weights.ts` and v2.5 engine constants in `src/lib/priceEngine.ts`).
2. Preserve `SimulatedEventsProvider` (`src/lib/providers/SimulatedEventsProvider.ts`), `.cache/ledger.json` ledger persistence/reuse policy, and `PlayerEvent.source` semantics untouched.
3. Never run `npm run build` during verification or edit loops to avoid `.next` cache collisions with a running Next.js dev server. Always verify with:
   - `npx tsc --noEmit`
   - `node --experimental-strip-types --test tests/*.test.ts`
4. Keep changes focused, strictly typed (no `any`, no `@ts-ignore`, no `eslint-disable`), and free of debug leftovers.
"""


@dataclass(frozen=True)
class PipelineTask:
    name: str
    summary: str
    impl_prompt: str
    verify_prompt: str


TASKS: tuple[PipelineTask, ...] = (
    PipelineTask(
        name="01_match_sync",
        summary=(
            "Unify today match matching/merging to eliminate duplicate fixtures and "
            "align match clock (1H/2H/LIVE minute) and score across cards, lineup, and chart."
        ),
        impl_prompt="""\
Task: `01_match_sync` — Unify today match deduplication/merging and synchronize match clock & score across views.

Objectives:
1. Single match-merge path (no duplicate today fixtures):
   - Audit how today's fixtures are fetched, merged, and overlaid across `src/lib/lineupStatus.ts`, `src/components/matches/MatchesTabView.tsx`, `src/store/useTradeStore.ts`, and `src/app/api/matches/route.ts`.
   - Ensure fixture enrichment/pinning merges into an existing matching fixture (matching by canonical team pair + date/fixture identity) instead of creating a second duplicate match card alongside the live/API fixture for the same game.
   - Keep live `SCORE_ONLY` API data cleanly separated from fixture/replay metadata when no matching fixture exists.
2. Consistent match clock (1H / 2H / HT / FT / LIVE minute) and score (`homeScore : awayScore`):
   - Ensure schedule cards (`src/components/matches/MatchAccordionCard.tsx`, `src/components/matches/MatchesTabView.tsx`), lineup/pitch view (`src/components/matches/FormationPitchModal.tsx`), and chart/header views (`src/components/market/MarketChartTabView.tsx`, `src/components/market/MatchTimelineChart.tsx`, `src/components/TopAssetHeader.tsx`) read from one consistent match clock and score source.
   - Eliminate drift where the schedule card shows a different minute, half indicator, or score from the lineup modal or player chart.
3. Tests & Verification:
   - Add or update focused unit tests in `tests/` covering duplicate match prevention and clock/score consistency.
   - Run `npx tsc --noEmit` and `node --experimental-strip-types --test tests/*.test.ts` and confirm all checks pass.
""",
        verify_prompt="""\
Verification Task: `01_match_sync` — Diff-based reverse-trace audit and repair.

Inspect all changes made since base commit `{base_rev}` (check `git status --short`, `git diff {base_rev}..HEAD`, and uncommitted `git diff`).
Verify each requirement by tracing the modified code paths end-to-end:
1. Confirm `git diff {base_rev} -- src/lib/weights.ts src/lib/providers/SimulatedEventsProvider.ts` shows zero forbidden modifications to v2.5 `WEIGHTS`, `RATES`, pass criteria, `.cache/ledger.json` policy, or `PlayerEvent.source`.
2. Confirm today's match list cannot render duplicate entries for the same real match (e.g., an API `fd-*` match and a fixture entry for the same teams on the same date are merged into one entry rather than duplicated).
3. Confirm match status/half/minute (1H/2H/HT/FT/LIVE) and score (`homeScore`, `awayScore`) match across schedule cards, lineup/pitch view, and chart views without divergence.
4. Confirm edge cases (past dates, future dates, `UPCOMING`, `HT`, `FT`, `SCORE_ONLY` API responses) are handled cleanly with unit test coverage.
5. If any defect, regression, type error, or missing test is found, fix it directly in the codebase and re-run:
   - `npx tsc --noEmit`
   - `node --experimental-strip-types --test tests/*.test.ts`
Do NOT run `npm run build`. Report every checked file, any fixes applied, and exact verification command outputs.
""",
    ),
    PipelineTask(
        name="02_badges_and_lang",
        summary=(
            "Restrict sub/card badges strictly to real match events and unify "
            "Korean/English player name display across pitch, bench, and chart."
        ),
        impl_prompt="""\
Task: `02_badges_and_lang` — Strict event-gated substitution/card badges and unified player name display.

Objectives:
1. Strict event-only substitution (`←` / `→`) and card badges:
   - Audit `src/lib/lineupStatus.ts`, `src/components/matches/FormationPitchModal.tsx`, `src/components/matches/MatchAccordionCard.tsx`, and `src/store/useTradeStore.ts`.
   - Guarantee that substitution out (`←` + minute), substitution in (`→` + minute), re-substitution, yellow card, and red card badges render ONLY when real matching substitution/card events or explicit verified lineup event fields exist for that exact player and match.
   - Ensure no fallback, synthetic, stale, cross-match, or click-triggered state ever displays a substitution or card badge when no real event exists.
2. Unified player name notation across pitch, bench, and chart:
   - Audit player display name resolution across `src/components/matches/FormationPitchModal.tsx`, `src/components/matches/MatchAccordionCard.tsx`, `src/components/market/MarketChartTabView.tsx`, `src/components/market/MatchTimelineChart.tsx`, `src/components/TopAssetHeader.tsx`, `src/components/PlayerDetailModal.tsx`, and `src/store/useTradeStore.ts`.
   - Unify mixed Korean/English player name rendering behind a clear, consistent display convention so the same player is labeled consistently across pitch nodes, bench/substitution rows, and market/chart panels without breaking player ID/event matching.
3. Tests & Verification:
   - Add or update focused unit tests in `tests/` verifying strict event-only badge gating and consistent player display name normalization/matching across pitch, bench, and chart.
   - Run `npx tsc --noEmit` and `node --experimental-strip-types --test tests/*.test.ts` and confirm all checks pass.
""",
        verify_prompt="""\
Verification Task: `02_badges_and_lang` — Diff-based reverse-trace audit and repair.

Inspect all changes made since base commit `{base_rev}` (check `git status --short`, `git diff {base_rev}..HEAD`, and uncommitted `git diff`).
Verify each requirement by tracing the modified code paths end-to-end:
1. Confirm `git diff {base_rev} -- src/lib/weights.ts src/lib/providers/SimulatedEventsProvider.ts` shows zero forbidden modifications to v2.5 `WEIGHTS`, `RATES`, pass criteria, `.cache/ledger.json` policy, or `PlayerEvent.source`.
2. Confirm substitution (`←`/`→`) and yellow/red card badges render exclusively when real substitution/card events exist for that player in that match, and never appear on empty/`UPCOMING`/`SCORE_ONLY` data or after clicking/selecting players.
3. Confirm player name notation is consistent across pitch lineup nodes, bench/substitution rows, and chart/market views, and that name formatting changes do not break event matching (`resolvePlayerMatchStatus`, lineup lookup, or store selection).
4. If any defect, regression, type error, or missing test is found, fix it directly in the codebase and re-run:
   - `npx tsc --noEmit`
   - `node --experimental-strip-types --test tests/*.test.ts`
Do NOT run `npm run build`. Report every checked file, any fixes applied, and exact verification command outputs.
""",
    ),
)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="run_pipeline.py",
        description=(
            "Run sequential implementation (impl) and diff-based verification (verify) "
            "tasks in football-app using non-interactive `agy --print`."
        ),
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("AGY_MODEL"),
        help=(
            "Default model passed via `--model` to `agy` for both phases "
            "(defaults to AGY_MODEL env var, or agy CLI default if unset)."
        ),
    )
    parser.add_argument(
        "--impl-model",
        default=None,
        help="Override `--model` for the implementation (impl) phase only.",
    )
    parser.add_argument(
        "--verify-model",
        default=None,
        help="Override `--model` for the verification (verify) phase only.",
    )
    parser.add_argument(
        "--impl-effort",
        choices=EFFORT_CHOICES,
        default="high",
        help="Reasoning effort for the impl phase (default: high).",
    )
    parser.add_argument(
        "--verify-effort",
        choices=EFFORT_CHOICES,
        default="xhigh",
        help="Reasoning effort for the verify phase (default: xhigh).",
    )
    parser.add_argument(
        "--tasks",
        nargs="+",
        metavar="TASK_NAME",
        help="Subset of task names to execute in order (default: all configured tasks).",
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        default=DEFAULT_LOG_DIR,
        help=f"Directory for pipeline logs (default: {DEFAULT_LOG_DIR.relative_to(REPO_ROOT)}).",
    )
    parser.add_argument(
        "--print-timeout",
        default=None,
        help="Optional `--print-timeout` duration forwarded to `agy` (e.g., 15m).",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue running subsequent tasks even if a task fails.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print resolved `agy` commands without invoking `agy`.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all configured tasks and exit.",
    )
    return parser.parse_args(argv)


def resolve_tasks(selected_names: Sequence[str] | None) -> list[PipelineTask]:
    if not selected_names:
        return list(TASKS)

    task_map = {task.name: task for task in TASKS}
    unknown = [name for name in selected_names if name not in task_map]
    if unknown:
        available = ", ".join(task_map.keys())
        raise SystemExit(
            f"Unknown task name(s): {', '.join(unknown)}. Available tasks: {available}"
        )
    return [task_map[name] for name in selected_names]


def get_git_head() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else "HEAD"


def build_prompt(body: str) -> str:
    return f"{COMMON_GUARDRAILS}\n{body.strip()}\n"


def build_agy_command(
    *,
    prompt: str,
    effort: str,
    model: str | None,
    print_timeout: str | None,
) -> list[str]:
    cmd = [
        "agy",
        "--print",
        prompt,
        "--output-format",
        "json",
        "--mode",
        "accept-edits",
        "--dangerously-skip-permissions",
        "--effort",
        effort,
    ]
    if model:
        cmd.extend(["--model", model])
    if print_timeout:
        cmd.extend(["--print-timeout", print_timeout])
    return cmd


def write_phase_logs(log_path: Path, stdout: str, stderr: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    if stdout:
        log_path.write_text(stdout, encoding="utf-8")
        if stderr:
            stderr_path = log_path.with_suffix(".stderr.log")
            stderr_path.write_text(stderr, encoding="utf-8")
    else:
        log_path.write_text(stderr, encoding="utf-8")


def summarize_json_output(raw_stdout: str) -> str | None:
    stripped = raw_stdout.strip()
    if not stripped:
        return None
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        for key in ("result", "response", "text", "message", "status"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                first_line = value.strip().splitlines()[0]
                return first_line[:160]
    return None


def run_phase(
    *,
    task_name: str,
    phase: str,
    prompt: str,
    effort: str,
    model: str | None,
    print_timeout: str | None,
    log_dir: Path,
    dry_run: bool,
) -> int:
    log_path = log_dir / f"{task_name}_{phase}.log"
    cmd = build_agy_command(
        prompt=prompt,
        effort=effort,
        model=model,
        print_timeout=print_timeout,
    )

    display_model = model or "<agy-default>"
    print(
        f"[{task_name}:{phase}] effort={effort} model={display_model} -> {log_path}",
        flush=True,
    )

    if dry_run:
        redacted_cmd = [
            "<PROMPT>" if idx == 2 else part for idx, part in enumerate(cmd)
        ]
        print(f"  dry-run cmd: {' '.join(redacted_cmd)}", flush=True)
        return 0

    started_at = time.monotonic()
    completed = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    elapsed = time.monotonic() - started_at
    write_phase_logs(log_path, completed.stdout, completed.stderr)

    status = "OK" if completed.returncode == 0 else f"FAILED (exit {completed.returncode})"
    print(f"[{task_name}:{phase}] {status} in {elapsed:.1f}s", flush=True)

    summary = summarize_json_output(completed.stdout)
    if summary:
        print(f"  summary: {summary}", flush=True)
    elif completed.returncode != 0 and completed.stderr.strip():
        first_err = completed.stderr.strip().splitlines()[0][:160]
        print(f"  stderr: {first_err}", flush=True)

    return completed.returncode


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)

    if args.list:
        for task in TASKS:
            print(f"{task.name}: {task.summary}")
        return 0

    selected_tasks = resolve_tasks(args.tasks)

    if not args.dry_run and shutil.which("agy") is None:
        print("Error: `agy` executable was not found in PATH.", file=sys.stderr)
        return 127

    log_dir = args.log_dir if args.log_dir.is_absolute() else (REPO_ROOT / args.log_dir)
    impl_model = args.impl_model or args.model
    verify_model = args.verify_model or args.model

    failures: list[str] = []

    for task in selected_tasks:
        base_rev = get_git_head()
        impl_prompt = build_prompt(task.impl_prompt)
        impl_rc = run_phase(
            task_name=task.name,
            phase="impl",
            prompt=impl_prompt,
            effort=args.impl_effort,
            model=impl_model,
            print_timeout=args.print_timeout,
            log_dir=log_dir,
            dry_run=args.dry_run,
        )
        if impl_rc != 0:
            failures.append(f"{task.name}:impl(exit={impl_rc})")
            print(
                f"[{task.name}] Skipping verify phase because impl failed.",
                file=sys.stderr,
                flush=True,
            )
            if not args.continue_on_error:
                break
            continue

        verify_prompt = build_prompt(task.verify_prompt.format(base_rev=base_rev))
        verify_rc = run_phase(
            task_name=task.name,
            phase="verify",
            prompt=verify_prompt,
            effort=args.verify_effort,
            model=verify_model,
            print_timeout=args.print_timeout,
            log_dir=log_dir,
            dry_run=args.dry_run,
        )
        if verify_rc != 0:
            failures.append(f"{task.name}:verify(exit={verify_rc})")
            if not args.continue_on_error:
                break

    if failures:
        print(f"Pipeline finished with failures: {', '.join(failures)}", file=sys.stderr)
        return 1

    print(f"Pipeline completed successfully ({len(selected_tasks)} task(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
