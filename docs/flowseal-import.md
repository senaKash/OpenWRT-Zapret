# Flowseal import and update — Phases G/H

Phase G implements an allowlisted host-side converter for `Flowseal/zapret-discord-youtube` `general*.bat` strategies. Flowseal files are parsed as inert text only; `.bat`, `.cmd`, `.exe`, `.ps1`, `service.bat` and `winws.exe` are never executed by OpenWRTZapret.

Pipeline: join BAT continuation lines (`^`) → minimal tokenizer → option groups split by `--new` → allowlist/variable validation → Zapret1/winws to Zapret2 conversion → OpenWRTZapret JSON profile.

The initial supported subset covers the supplied working `general (ALT).bat`: TCP/UDP/L7 filters, hostlists/ipsets and excludes, fixed domains, `fake`, `fakedsplit`, repeats, `fooling=ts`, `ip-id`, fake QUIC/TLS/HTTP/Discord/STUN blobs, `any-protocol`, cutoff and `--new`.

Important mappings are aligned with Zapret2's documented migration model:

- nfqws1 `--dpi-desync=fake,fakedsplit --dpi-desync-repeats=N --dpi-desync-fooling=ts` becomes separate Lua stages: `fake:...:repeats=N:tcp_ts=-600000` and `fakedsplit:...:tcp_ts=-600000`.
- `--payload` is emitted before the Lua stages it governs. Zapret2 explicitly permits multiple `--payload` filters in one strategy profile.
- repeated nfqws1 fake payload options are preserved as repeated `--lua-desync=fake:blob=...` instances in source order; they are not collapsed into an invalid repeated `blob=` argument.
- old cutoff such as `n4` is represented as the outgoing range `--out-range=-n4`.
- file-backed fakes are declared once with `--blob=name:@/absolute/path` and referenced by alias.

Asset paths include the sanitized Flowseal source version: `/etc/openwrtzapret/flowseal/assets/<version>/...`. This matters because test-result hashes and active profiles must not change behavior merely because a newer Flowseal release was downloaded.

Unknown or unimplemented options are never silently ignored. They appear in `import.unsupported` and force `compatible=false`. With default GameFilter mode, groups whose filter is exactly `%GameFilterTCP%` or `%GameFilterUDP%` are omitted and a warning is emitted; the normal Discord/YouTube strategy core remains importable.

The Python importer remains a development/reference implementation and adds no Python dependency to the router. Phase H provides a router-side AWK converter plus an asynchronous updater. It checks the latest stable GitHub release, downloads the release tarball into `/tmp`, rejects unsafe paths and non-regular selected members, extracts only `general*.bat`, required `bin/*.bin`, and `lists/*.txt`, applies size/count limits, converts strategies into versioned Flowseal profiles, and installs only referenced assets.

Persistent Flowseal state lives under `/etc/openwrtzapret/flowseal`; generated profiles live under `/etc/openwrtzapret/profiles/flowseal`. Update results classify each strategy as `Added`, `Changed`, `Unchanged`, or `Unsupported`. Unknown options remain `compatible=false`; they are never silently discarded. The current active Flowseal profile is retained even when a newer release is installed. Flowseal update never writes `/opt/zapret2/config`, never changes `active_profile`, never overwrites user profiles, and never updates the Zapret2/nfqws2 engine.

LuCI exposes local/remote Flowseal version plus **Check** and **Update** actions on the Strategies page. Update runs through the existing asynchronous job system and can be cancelled. A lost updater worker is recovered by clearing the updater journal only; recovery does not touch the running Zapret configuration because updater installation is file-based and does not activate a profile.

References used for the translation rules:
- https://github.com/bol-van/zapret2/blob/master/docs/readme.md
- https://github.com/bol-van/zapret2/blob/master/config.default
- https://github.com/bol-van/zapret/blob/master/docs/readme.en.md

The converter being syntactically faithful does not prove identical network behavior. Final equivalence still requires testing on the target OpenWrt/Zapret2 build.
