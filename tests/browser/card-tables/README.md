# Card table browser regression

Start Vite on an unused local port (default below is 5199), then run:

```sh
npm exec vite -- --host 127.0.0.1 --port 5199 --strictPort
node tests/browser/card-tables/check.cjs
```

The runner uses Playwright Chromium. Optional environment variables:

- `PLAYWRIGHT_MODULE_ROOT`: absolute directory containing the Playwright package and package.json (for a shared runtime).
- `CHROME_PATH`: installed Chromium/Chrome executable instead of Playwright's bundled browser.
- `TABLE_TEST_URL`: Vite origin; defaults to `http://127.0.0.1:5199`.
- `TABLE_TEST_OUTPUT`: screenshots and JSON receipt directory; defaults to `.integration/card-fixes-20261126`.

Fixtures render the real floating terminal, party room and card tables with synthetic in-memory saves. No account or paid model is used. The checks cover identical concealed Mahjong tiles, drawn versus concealed copies and their exact legal discard, hint selection, reset between rounds, both games' play/settlement/final orientation and next-round controls at six viewport sizes, and a twelve-card Landlord straight followed by two passes. All card bounds are checked against clipping ancestors on both screen axes, including the rotated terminal.

The original Mahjong component fails with two selected tiles; the original Landlord component clips the preceding play after the new-trick caption appears. Settlement bodies may scroll, but the next-round button must be visible and hit-testable.
