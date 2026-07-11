# Contributing to fairaudit

Thanks for considering a contribution. This is a small project, so the bar for a first PR is low — typo fixes, test additions, and small scoped features are all welcome.

## Getting set up

- Python engine: `cd engine && pip install -r requirements.txt && pip install -e .`
- Server: `cd server && npm install`
- Dashboard: `cd dashboard && npm install`

Run `pytest` from `engine/` before opening a PR that touches the Python package.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Keep PRs small and scoped to one change.
3. If you're changing fairness math (metrics.py, severity.py, gate.py), add or update a test that shows the expected numbers.
4. Open a PR with a short description of what changed and why.

## Reporting bugs

Open an issue with what you expected, what happened instead, and (if it involves the audit output) the domain and metric involved.
