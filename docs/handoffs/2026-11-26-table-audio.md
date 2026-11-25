# 2026-11-26 Mahjong backs and table audio

## Scope and implementation

- Replace only the Mahjong back with a real Mahjong tile sprite: amber back, ivory body and bevel, sourced from hkm-a/mahjong. Keep 80% face-art scale and all playing-card artwork.
- Mahjong: downloaded tile-discard impact, plus local Chinese chi/pon/kan/riichi/ron/tsumo announcements from resolved engine log entries. Rejected simultaneous choices cannot announce a call.
- Landlord: card impact, rank/pair calls, all classified patterns including rocket, triple-single and airplane variants, bids and passes. A high single/pair reply may say “压死”; a fresh lead cannot. Waiting line “我等的花都谢了” starts after 25 seconds of an idle player turn, at most twice with 45 seconds between, and pauses/reset during busy work.
- A small speaker toggle at the upper left of each active table shares the sound setting for the current page session. No new persisted field, localStorage key, IndexedDB store or backup schema.
- A user pointer/key gesture unlocks Web Audio. Disabled, hidden, read-only and closed views stop active sources and clear the queue. Reopening or unmuting does not replay earlier moves. Late fetch/decode cannot start audio after stopping. Real moves can interrupt idle speech; other voices are serialized and a backlog older than 3 seconds is dropped.
- 53 synthesized Chinese voice MP3s plus 2 downloaded impact sounds. All files are local assets; gameplay never contacts an external audio service. See src/assets/table-audio/NOTICE.md and provenance.json for exact sources, phrases, modifications and hashes. Voices were synthesized from generic phrases, not copied from commercial game recordings.

## Verification

- `npm run test -- tests/table-sounds.test.ts tests/table-sound-player.test.ts tests/landlord-table.test.ts tests/landlord-cards.test.ts tests/landlord-speech.test.ts tests/mahjong-artwork.test.ts tests/mahjong.test.ts tests/mahjong-rules.test.ts`: 8 suites / 35 tests passed.
- `npm run build`: type checking and production build passed. Existing large main-chunk warning remains.
- Chromium synthetic game checks: real AudioContext buffer decoding and source playback; rocket+card hit, opponent pass, Mahjong discard; mute stops, disabled actions silent, unmute/inactive-to-active without historical replay. All 55 audio files decoded with nonzero waveform and bounded duration. No page errors.
- UI: 844x390 landscape and 360x780 portrait with terminal rotation, both games. Speaker center is clickable, on/off icon states update. Screenshots inspected; Mahjong faces retain their margin, back is a separate Mahjong sprite.
- Evidence: `.integration/table-audio-20261126/browser-results.json` and screenshots. These verify decoding/playback/lifecycle, not human listening or real iOS/Android hardware audio routing.
- No private account save, paid model request, or API credential used in game tests.

## Coordination and deployment

- Starting local HEAD and remote main matched `56a781a2b836025663b8b2be14fdb869fca23d93`.
- Required four agent-hub reads attempted; D:/QQ/QQ文件/agent-hub/hub.mjs is absent (MODULE_NOT_FOUND), as in the preceding run. No hub ownership claim was made. This document is the handoff fallback.
- Server read-only baseline: HEAD e5c755001fb9f5da497b009a575d0b2d609a017d, clean. 9000 release b5fb0fce1fe84ea5 / PID 1016015. 8807 release 2714ea237e363c84 / PID 2955979, terminal SHA256 58bc6cc9976e1d8d4d375ce6b2d642862a434945e5fe136780d559bcd7f2518a.
- Deploy only 9000 with the guarded single-instance updater, reviewed target commit, backup and stable baseline assertions. Never run the default paired updater.
- Next: append verified release receipt, public asset checks, stable comparison and temporary-key cleanup result after deployment.

## Deployment recovery

- First target 5297d244501f93db6660fdef905dd5270908a85f produced snapshot 17c83b9e99d3e20d, which failed native Node startup. The updater automatically restored healthy test release b5fb0fce1fe84ea5. Stable remained unchanged. Backup: /home/ubuntu/.stellar-resonance-backups/update-20261126-023700-9Zcax1.
- Reproduced on the server snapshot and locally: ERR_MODULE_NOT_FOUND for tableSoundEvents, because Mahjong and its new sound module used extensionless runtime imports. Vite resolves these, native Node does not. Both runtime imports now include .ts.
- Added native Node server-import regression: observed failure before the fix, then passed after. Seven native server import/channel/HTTP tests passed, plus 15 audio/Mahjong tests and a fresh production build.
- Next: redeploy the corrected commit to test only, verify its active snapshot and public assets, record stable comparison and remove the temporary SSH private key.
