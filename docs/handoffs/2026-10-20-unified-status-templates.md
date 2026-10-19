# Unified status rows and module output templates

## Behavior

- Normal story generation emits each NPC's identity, attitude, strength and supported descriptive fields in one status row. It no longer requests model-generated JSONPatch operations.
- The server retains the existing small +/-2, large +/-5, neutral 0 policy and [-100,200] bounds. A missing judgment is never fabricated as a successful neutral review.
- Old attitudes and MVU responses remain readable. Explicit old-format reviews take precedence over embedded reviews to avoid applying a change twice.
- A status declaration with a uniquely matching known name reconciles an altered model ID before attitude application. Ambiguous names remain rejected.
- The current-state example includes every present NPC, with known spirit fields only. Inactive characters are not presented as present in the example.
- Conflicting default prompts requesting JSONPatch have been removed from the normal status contract.
- Targeted affinity repair now explicitly permits the requested character status rows; previously its output section could say not to emit status while the review prompt requested it.

## Templates

Enabled output templates cover status, quick replies, forum/comments, group chat, fanfic, spirit diary, interview, after-class vignette and custom theaters. The actual slot numbers are inserted into the wrappers and JSON. Disabled modules are filtered. Targeted repair uses the same complete companion templates for requested slots only.

Existing custom administrator prompt overrides are not overwritten. If an override still mandates an incompatible protocol, review that override against the updated defaults.

## Validation

- 266 server tests passed, including new unified-row, identity-reconciliation, module-template parsing and targeted-repair cases.
- TypeScript check passed.
- Logs: `.integration/status-card-server-tests.log` (local, not published).
- No claim of universal model compliance: truncation, malformed data and genuinely ambiguous identities still retain prior valid state with diagnostics.
- Public-server deployment and live-model acceptance must be distinguished from these local checks.
