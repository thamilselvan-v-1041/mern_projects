# CI / CD Pipeline

The `ci-cd.yml` workflow runs on every push to `main`, every PR targeting `main`,
and on manual dispatch.

## Jobs

| Job             | Runs on            | Trigger                | Purpose                                            |
| --------------- | ------------------ | ---------------------- | -------------------------------------------------- |
| `server-tests`  | Node 18 + Node 20  | every push / PR        | Jest + Supertest backend suite, coverage upload    |
| `client-tests`  | Node 20            | every push / PR        | Vitest + RTL frontend suite, production Vite build |
| `deploy`        | Node 20            | push to `main` only    | Installs prod deps, runs `catalyst deploy`         |

All test jobs must pass before `deploy` is allowed to run.

## Required repository secrets

Configure these under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name             | What goes in it                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `CATALYST_CREDENTIALS`  | Full contents of your local `~/.catalystrc` after running `catalyst login` once |
| `CATALYST_PROJECT_ID`   | The numeric `project.id` from `catalyst.json`                                   |

### Optional repository variables

| Variable name        | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `CATALYST_APP_URL`   | Shown as the deployment URL on the GitHub Environment  |

## One-time setup

```bash
# 1. Authenticate locally to generate ~/.catalystrc
npm install -g zcatalyst-cli
catalyst login

# 2. Copy the contents into a GitHub secret
cat ~/.catalystrc           # paste the entire JSON into CATALYST_CREDENTIALS
```

## Branch protection (recommended)

In **Settings → Branches → Add rule** for `main`:

- ✅ Require status checks to pass before merging
  - `Server tests (Node 18)`
  - `Server tests (Node 20)`
  - `Client tests + build`
- ✅ Require branches to be up to date before merging
- ✅ Restrict who can push to matching branches

This guarantees `main` is always green and the `deploy` job only runs on
verified code.
