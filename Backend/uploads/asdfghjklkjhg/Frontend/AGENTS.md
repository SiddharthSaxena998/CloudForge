<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## CloudForge conventions
- All app pages live under the pathless `_shell` layout route, which renders the sidebar and redirects unauthenticated visitors to `/login`; keeps the auth gate and chrome in one place.
- All data access goes through `src/lib/api-client.ts` (axios + JWT interceptor) with `USE_MOCK_API` toggling mock data, so the separate Express API can be swapped in without touching screens.
