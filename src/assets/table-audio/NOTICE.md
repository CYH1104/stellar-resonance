# Table audio

All audio is bundled locally. No model, voice service, or external media request is made during gameplay.

- `tile-drop.wav`: unchanged `Mahjong-2020/resource/sound/discard.wav` from https://github.com/hkm-a/mahjong at commit `1069bf65e8b132602193c8e14a4d9f8616b74c9b`. Repository license: MIT; retained in LICENSE-mahjong.txt.
- `card-drop.mp3`: converted to 24 kHz mono MP3 from `public/static_assets/sounds/card-drop-1.ogg` in https://github.com/optimuspryne/open-tabletop at commit `3ca83253eceeb160e25a9eb6c395d89dbb71d9db`. Its docs/ASSET_CREDITS.md dedicates the sound collection to CC0: https://creativecommons.org/publicdomain/zero/1.0/ . The collection credits Kenney, HaelDB, BMacZero and OwlishMedia; the index does not assign individual card files to one of them.
- Other MP3 files: Chinese synthesized announcements created for this integration using Microsoft Edge online TTS (`zh-CN-YunxiNeural`, edge-tts 7.3.1), from the short generic phrases listed in provenance.json. They are not copied commercial-game character recordings. No character/private story text was submitted to synthesis. Silence was trimmed and files encoded as 24 kHz mono MP3. No claim that Microsoft's voice is licensed by either upstream game repository is made.

See provenance.json for exact phrases and SHA256 hashes.
