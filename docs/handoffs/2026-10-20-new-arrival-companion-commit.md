# New-arrival status prevented companion commit

## User report

A response using `present/enter/exit` declared `npc-lin-yu` (林雨), a neutral attitude, player spirit thought, four choices, two forum posts and a group-chat scene. Both sidebars stayed empty.

## Reproduced causes

1. The attitude adapter registered a new NPC without an explicit row-level `present` as absent, even though `present/enter` declared the arrival. The resulting snapshot contradicted its roster and failed with `MODEL_STATE_ROSTER_INVALID`.
2. With `requireDynamicState:true` (the normal website path), compatibility validation iterated the legacy-only `out.presentCharacterIds`. New delta outputs do not have that property, causing a TypeError before the final done outcome. Existing delta unit tests did not enable this website option.

Since the done outcome never reached the client, the valid forum, group chat, choices and player thought were not committed either.

## Changes

- Attitude registration receives the resolved presence of each candidate.
- New status-only registrations infer initial presence from explicit delta arrival/presence claims, even if the attitude is missing. Missing attitude remains a visible diagnostic rather than discarding the card or companion modules.
- Compatibility field validation uses the resolved present roster for both new and legacy protocols.
- Regression tests exercise the reported payload, persistence/state replay, forum/theater selectors and streaming decoder path with `requireDynamicState:true`, without extra API requests.

## Validation

- 284 server tests passed.
- No public-server deployment or live-model test is claimed.
- Previously failed replies without a committed outcome need manual repair after updating the server; updating the code alone does not reconstruct missing saved data.
