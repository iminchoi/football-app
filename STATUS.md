# Project Status

## Current State
- Core match trading, lineup formation view (`FormationPitchModal.tsx`), substitution/card badges (`lineupStatus.ts`), manager strip (`교체명단`), and `v2.5` pricing engine (`WEIGHTS` untouched) are working.
- Sequential `impl -> verify` automation script (`run_pipeline.py`) is configured at repo root with `01_match_sync` and `02_badges_and_lang` tasks and `.pipeline_logs/` ignored in `.gitignore`.
- Verified with `python3 -m py_compile run_pipeline.py`, `python3 run_pipeline.py --help` / `--list` / `--dry-run`, and `npx tsc --noEmit`.

## Recent Changes
- `run_pipeline.py`: Added sequential `agy --print` (`--output-format json`, `--mode accept-edits`, `--dangerously-skip-permissions`) pipeline running `impl` (`--effort high`) then diff-based `verify` (`--effort xhigh`) on exit 0, with configurable `--model`, `.pipeline_logs/` logging, v2.5/ledger/no-build guardrails, and initial tasks `01_match_sync` and `02_badges_and_lang`.
- `.gitignore`: Added `/.pipeline_logs/` and `.pipeline_logs/`.

## Known Issues & Next Steps
- Execute `python3 run_pipeline.py` (optionally with `--model`) to run `01_match_sync` and `02_badges_and_lang` end-to-end.
- Perform an interactive UI pass in the browser on `/` after pipeline tasks complete.
