# email-utils docs site

The [Fumadocs](https://fumadocs.dev) site for `@email-utils`, published to
GitHub Pages at <https://email-utils.github.io/meta/>. It's a Next.js static
export (`basePath: '/meta'`) with static Orama search; pages live in
`content/docs/`, and the hand-written reference in `content/docs/reference/`. It's its own npm project, separate from meta's root.

```sh
npm ci               # also installs typedoc/
npm run api          # the API reference, into content/docs/api/
npm run dev          # http://localhost:3000/meta
npm run build        # static site in out/
npm run types:check  # Next.js route types, then tsc
npm run lint:links   # every link and #fragment in content/docs resolves
```

A `ts ts2js` code block renders as TypeScript and JavaScript tabs, and the
reader's choice carries across pages:

````md
```ts ts2js
const domain: string = 'example.com';
```
````

Every `ts` and `tsx` block is compiled with
[Twoslash](https://fumadocs.dev/docs/markdown/twoslash) against the
`@email-utils` packages in `package.json`, installed from npm (`next` until
1.0.0), so samples are checked against what readers install. A type error
fails `npm run build` and `npm run lint:links`. Hovering an identifier on the
site shows its type and TSDoc. A sample that's meant to fail marks the error
it expects with `// @errors: <code>`, and `no-twoslash` in a block's meta
skips the check. Dependabot bumps the packages daily.

The API reference in `content/docs/api/` is generated, not committed:
`npm run api` runs [TypeDoc](https://typedoc.org) with
[typedoc-plugin-markdown](https://typedoc-plugin-markdown.org) over the `.d.ts`
files of those same installed packages, one page per entry point. `dev`,
`build`, and `lint:links` run it first. TypeDoc doesn't support TypeScript 7
yet, so it lives in `typedoc/`, its own npm project on TypeScript 6, which
`npm ci` installs.

`.github/workflows/docs.yml` runs the typecheck, the link check, and the build
on every PR that touches `docs/`, and deploys to Pages from `main`.
