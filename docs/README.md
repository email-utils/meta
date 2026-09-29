# email-utils docs site

The [Fumadocs](https://fumadocs.dev) site for `@email-utils`, published to
GitHub Pages at <https://email-utils.github.io/meta/>. It's a Next.js static
export (`basePath: '/meta'`); pages live in `content/docs/`.

```sh
npm ci
npm run dev    # http://localhost:3000/meta
npm run build  # static site in out/
```

Scaffold only: [#41](https://github.com/email-utils/meta/issues/41) tracks
moving the `api/` drafts in, the Pages deploy, and the CI checks.
