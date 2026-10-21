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

- Keep resolved-stage presentation in StageQuestion and scope compact sizing to the special-question resolved display, so admin behavior and guessing layouts stay unchanged.
- Live rooms: the host tab is the single writer (server fns gated by an encrypted host-key session); stage/players only read the room row via realtime, and players write only through the join_room/press_buzzer DB functions — keeps anonymous phones from altering game state.
- Package media is uploaded to the private quiz-assets bucket with 24h signed URLs when a room opens — blob URLs only exist in the host browser.
- Resolve question audio through the shared presentation helper, preserving legacy mediaType audio; only the stage plays question sound so phones never echo it.
- Keep question image selection and choice-option correctness in shared presentation helpers so stage rendering, player inputs, auto-complete and scoring agree across question types.
- Derive the quiz theme from package branding in shared state; scope semantic CSS tokens to stage/player roots so live room updates apply themes without changing admin styling.
- Compute overall team standings exclusively with the shared teamRanking helpers on stage and phones; include every tied podium team so array positions never determine places. Answer-speed scoring ranks remain separate.
- Party-mode solutions are computed by the host at resolve time and synced as state.partySolution; stage, phones and scoring use applyPartySolution so all read the same patched question.
