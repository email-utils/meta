---
name: setup
description: Set up or repair a local email-utils workspace. Checks git, SSH access to GitHub, mani, gh (and its `project` scope), Node against .nvmrc, npm, and Docker, then clones any missing package repos with `mani sync`, runs `npm ci` in meta and every package, and makes sure lefthook's git hooks are installed. Use it when someone has just cloned email-utils/meta, is new to the project, asks how to get started, or hits errors that point to a missing clone, missing dependencies, a missing tool, the wrong Node version, or git hooks that don't run.
allowed-tools: Read, Bash(git --version), Bash(git rev-parse --show-toplevel), Bash(ssh -T -o BatchMode=yes git@github.com), Bash(mani --version), Bash(mani run status), Bash(mani exec --target packages --output table 'npx lefthook check-install && echo installed || echo missing'), Bash(gh --version), Bash(gh auth status), Bash(node --version), Bash(npm --version), Bash(docker --version)
---

# Set up the email-utils workspace

The workspace is the `email-utils/meta` clone. `mani.yaml` at its root lists
the package repos, which `mani sync` clones into subdirectories of it. This
skill checks the tools first and changes nothing until the person agrees.

Work only with the person's own sessions. Never run `gh auth token`,
`gh auth status --show-token`, or `npm token`, never read `~/.npmrc`,
`~/.config/gh`, `~/.ssh`, or environment variables holding credentials, and
never log in or add keys for them. When a login or scope is missing, give
them the command to run themselves; in Claude Code they can prefix it with
`!` to run it in this session.

## 1. Find the workspace root

Run `git rev-parse --show-toplevel`. The root is the directory holding
`mani.yaml`: the top level itself when you're in meta, or its parent when
you're in a package clone. Run everything below from the root.

If neither has `mani.yaml`, meta isn't cloned here. Tell them to clone it and
run the skill again from inside it:

```sh
gh repo clone email-utils/meta email-utils
```

## 2. Check the tools

These are all read-only. Run them together, then report.

| Check         | Command                                              | Passes when                                                                 |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| git           | `git --version`                                      | it runs                                                                     |
| SSH to GitHub | `ssh -T -o BatchMode=yes git@github.com`             | the output says "successfully authenticated" (the exit code is 1 even then) |
| mani          | `mani --version`                                     | it runs                                                                     |
| gh            | `gh --version`, `gh auth status`                     | logged in to github.com, and the token scopes include `project`             |
| Node          | `node --version`, and read `templates/synced/.nvmrc` | the major version matches `.nvmrc`                                          |
| npm           | `npm --version`                                      | major version 11 or later                                                   |
| Docker        | `docker --version`                                   | it runs                                                                     |

What each one is for, and what to tell them when it fails:

- **SSH to GitHub.** `mani.yaml` clones over SSH (`git@github.com:...`).
  Without a key on their GitHub account, `mani sync` can't clone. Point them
  to `gh ssh-key add` or GitHub's SSH key docs. `BatchMode=yes` keeps ssh from
  stopping at a prompt; a "Host key verification failed" error means they
  haven't connected to github.com before and should run `ssh -T
git@github.com` once themselves to accept its key.
- **mani.** It clones the repos and runs tasks across them. Install it from
  https://manicli.com (`brew install mani` on macOS).
- **gh.** The other email-utils skills open PRs and move issues on the project
  board. The board needs the `project` scope, which `gh auth login` doesn't
  grant by default. Not logged in: `gh auth login`. Scope missing:
  `gh auth refresh -s project`.
- **Node.** CI runs the Node major in `.nvmrc`. Another major can pass locally
  and fail in CI, or the other way round. Suggest their version manager's
  command (`nvm use`, `fnm use`, `volta install node@<major>`) from a package
  directory, or an install from https://nodejs.org. Don't install Node or a
  version manager for them. A mismatch is a warning: ask whether to carry on.
- **npm.** Node 24 ships npm 11. The package.json files approve install
  scripts through `allowScripts`, which npm 11 and later read. Update with
  `npm install -g npm@latest` if they want to, but it's their call.
- **Docker.** Only meta's own `npm run lint` needs it (actionlint, zizmor, and
  ShellCheck run from pinned images). The packages don't. A warning, never a
  blocker.

Report the results as a table with a ✅, ⚠️, or ❌ per row and a one-line
note on each failure. Missing git, mani, SSH access, or a gh login are
blockers: stop there, give the fixes, and offer to check again once they're
done. Anything else is a warning.

## 3. Get the go-ahead

Say what the next step does before doing it:

- `mani sync` clones any package repo that isn't there yet and updates meta's
  `.gitignore` to list them. It leaves existing clones alone.
- `npm ci` in meta and in each package deletes `node_modules` and reinstalls
  exactly what `package-lock.json` pins. It doesn't touch tracked files, so
  uncommitted work is safe, but it takes a minute or two per repo.
- lefthook's install script adds a `pre-commit` hook in each package that runs
  lint, format check, and typecheck, the same as CI's first legs.

If `mani run status` shows a clone off `main` or with uncommitted changes,
mention it; `npm ci` will install that branch's lockfile, which is fine but
may not be what they expect.

Ask once for all of it. If they only want some of it, do just that.

## 4. Clone and install

Run these in order and stop at the first failure:

1. `mani sync` from the root.
2. `npm ci` in the root, for meta's linters and `claude plugin validate`.
3. `mani run install`, which runs `npm ci` in each package in dependency
   order.

If `npm ci` fails because `package-lock.json` is out of step with
`package.json`, don't fix it with `npm install`. The lockfile is committed,
so changing it belongs in a PR. Report which repo and what npm said.

## 5. Check the git hooks

lefthook installs its hooks from its own install script during `npm ci`.
Confirm it did:

```sh
mani exec --target packages --output table 'npx lefthook check-install && echo installed || echo missing'
```

For any package showing `missing`, run `npx lefthook install` in it and check
again. The usual causes are `LEFTHOOK=0` in their shell, which also stops the
hooks from running, or `ignore-scripts=true` in their npm config. Mention
whichever applies; don't change their shell or npm config.

## 6. Report

Finish with a short summary: which checks passed or warned, which repos were
cloned, where `npm ci` ran, and whether every package has its hooks. End with
anything they still need to do themselves, such as switching Node versions or
adding the `project` scope. If nothing's left, say the workspace is ready and
that `mani run check` runs everything CI gates on.
