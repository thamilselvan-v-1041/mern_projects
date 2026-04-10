# Editor V2 Playback Validation and Cutover Checklist

This checklist is the acceptance gate for `v2-validate-cutover`.

## Validation Scope

- Playback stability in `/editor-v2` for single and multi-clip timelines.
- No visible flicker/regression in `play -> scrub -> play` cycles.
- Repeat/loop behavior is explicit and observable (transport mode + replay count).
- Clip-end transitions do not jump backwards unexpectedly or replay partial tails.

## Test Data Baseline

Use at least the following project fixtures before cutover:

1. **Single clip**: one video clip, >= 10 seconds.
2. **Multi clip sequential**: three clips end-to-end on the same track.
3. **Overlaps and mixed media**: overlapping video/audio + one text item.
4. **Short clip edge case**: clip shorter than one second near timeline start.

## Manual Validation Checklist

Mark each item with `PASS` before cutover.

### A) Transport and Playhead

- [ ] Press play from start; playhead advances continuously without jitter.
- [ ] Pause preserves exact frame/time position.
- [ ] Seek from ruler/timeline updates preview exactly once per interaction frame.
- [ ] `play -> scrub -> play` resumes from scrubbed position with no backward jump.
- [ ] Stop returns to timeline start (or configured range start) deterministically.

### B) Flicker and Rendering Stability

- [ ] Preview image remains visually stable during continuous playback.
- [ ] No frame flashing/flicker when crossing clip boundaries.
- [ ] No flicker when rapidly scrubbing across cuts.
- [ ] No layout thrash in timeline UI while playing (lane positions remain stable).

### C) Repeat / Loop Behavior

- [ ] Replay count increments only on real wrap/restart events.
- [ ] Replay count does not increment during normal forward playback.
- [ ] Loop-enabled mode restarts at range start cleanly (no partial-tail replay).
- [ ] Loop-disabled mode stops once at play range end.
- [ ] Status text clearly reflects transport mode and replay count while testing.

### D) Clip-End Transition Regression Guard

- [ ] At clip end, next clip starts without duplicate first-frame flash.
- [ ] No micro-replay near clip boundaries caused by tiny time drift.
- [ ] Audio and video stay aligned when crossing transition points.

## Temporary Debug State Requirement

Keep the following visible in V2 UI during validation:

- `transport.mode`
- `transport.playheadFrame` (or seconds)
- `transport.playRangeEndFrame`
- `transport.replayCount`
- `loopEnabled`

Remove or hide this debug panel only after cutover is complete.

## Cutover Go/No-Go Checklist

Switch navigation to `/editor-v2` only when all items are complete.

- [ ] All validation scenarios above are `PASS` on local dev.
- [ ] All validation scenarios above are `PASS` on production-like build.
- [ ] No open P0/P1 playback bugs (flicker, repeat-loop, playhead drift).
- [ ] Legacy `/editor` route remains intact as rollback path.
- [ ] Rollback procedure documented: route flag/nav toggle back to `/editor`.
- [ ] Team sign-off captured for product + engineering owner.

## Cutover Execution Steps

1. Switch entry points/navigation from `/editor` to `/editor-v2`.
2. Smoke test: open project, play, scrub, pause, resume, and confirm export flow.
3. Monitor first release window for playback regressions.
4. If regressions are detected, rollback route target to `/editor`.
5. After stability window, plan a dedicated cleanup PR to remove legacy timeline path.

## Validation Log

Use this table to record run history.

| Date | Environment | Fixture | Result | Notes |
| --- | --- | --- | --- | --- |
| _TBD_ | _local / staging / prod-like_ | _single / multi / overlap / short_ | _PASS/FAIL_ | _issues or links_ |
