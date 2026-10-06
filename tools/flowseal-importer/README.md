# Flowseal importer (Phase G)

`import_flowseal.py` parses Flowseal `general*.bat` strictly as **data** and emits OpenWRTZapret JSON profiles. It never executes BAT/CMD/EXE/PowerShell content.

Single strategy:

```sh
python3 import_flowseal.py "fixtures/general (ALT).bat" \
  --source-version fixture-2026.10 \
  --output-dir ./profiles \
  --report ./report.json
```

Whole extracted Flowseal source directory:

```sh
python3 import_flowseal.py /path/to/zapret-discord-youtube \
  --source-version 1.10.0 \
  --output-dir ./profiles \
  --report ./report.json
```

The converter is allowlist-based. Unknown or unimplemented options are recorded in `import.unsupported` and make that profile `compatible=false`; they are never silently dropped. With the default `--game-filter=none`, Flowseal GameFilter-only groups are intentionally omitted and recorded in `import.warnings`.

Generated asset references are versioned below `/etc/openwrtzapret/flowseal/assets/<source_version>/{bin,lists}` so importing a newer release cannot silently mutate an older active profile's assets. Phase H will handle safe release download/extraction/copying and installation into `/etc/openwrtzapret/profiles/flowseal`.

`selftest.py` validates the supplied working `general (ALT).bat` fixture, multiple fake payload conversion, GameFilter omission and rejection of unknown/unresolved input.
