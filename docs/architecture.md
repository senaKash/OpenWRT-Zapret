# OpenWRTZapret architecture

Status: Phases B/C, C.6, D, local E/F strategy testing and Phase G Flowseal parsing/conversion are implemented, 2026-10-06; SDK build and router behavior remain unverified. See [upstream-audit.md](upstream-audit.md) and [phase-bc.md](phase-bc.md).

## Base and ownership

OpenWRTZapret builds on [`remittor/zapret-openwrt`](https://github.com/remittor/zapret-openwrt), **master** commit `124c9f7983dcd6fddf46d3e863fc67853017c4fd`. Its default `zap1` branch packages Zapret 1; `master` has the required `zapret2/` and `luci-app-zapret2/`. The engine package pins [`bol-van/zapret2`](https://github.com/bol-van/zapret2) commit `d3b3011000f103c5af161cc4e3167e80fd6928a2`. Preserve upstream Git ancestry, licenses, copyright headers, package integration and the working installed Zapret2 service. Rebrand and extend incrementally. There must be one service owner, not a second competing init script.

Reuse `/opt/zapret2/config`, `/etc/config/zapret2`, nfqws2, procd, nftables/NFQUEUE, hostlists/ipsets, current Settings, daemon logs, Sites check and DPI check. Phase B/C keeps upstream package names and paths. The engine is on the OpenWRTZapret `r2` compatibility generation; the LuCI package is now `r5` after profile and testing additions.

## Privileged control boundary

```
LuCI JS (existing app, extended)
  -> named rpcd/ubus methods with narrow ACL
  -> validated, serialized service adapter
  -> existing /etc/init.d/zapret2 wrapper and Zapret2 engine
```

The browser invokes no-argument `status`, `start`, `stop` and `restart` methods. It never passes a shell command, executable path or arbitrary archive path. ucode starts the fixed adapter with the argv form of `fs.popen()`, which bypasses shell parsing. The upstream Service page called legacy `luci.setInitAction`; current LuCI source lacks this method and uses `rc.init`, which does not relay the child exit status. Phase C replaces that control path with fixed named methods. An action succeeds only after verifying the expected nfqws2 process and Zapret-owned nft hook-to-queue structure. Report partial states, stages, cleanup outcome and errors. The actual router's RPC methods, wrapper and nft table must be inspected before live tests.

## Configuration and future transactions

Existing Settings edit `/etc/config/zapret2`; `sync_config.sh` copies selected fields into `/opt/zapret2/config` before Start/Restart. `NFQWS2_OPT` and TCP/UDP ports remain in UCI for upstream compatibility. Phase D profile JSON has `builtin`, `flowseal` and `user` namespaces with a stable ID, source version, validated options and content hash. An active profile overrides the legacy strategy values after sync. Apply snapshots runtime config and commits only the active UCI pointer after verified startup; it attempts rollback on failure. Strategy Test differs from Apply. An asynchronous job snapshots runtime config, active profile and RUNNING/STOPPED state under `/etc/openwrtzapret/state/jobs`, temporarily activates a candidate, verifies daemon and NFQUEUE structure, runs bounded network probes, writes results keyed by profile hash/source version, restores the snapshot and verifies restoration. A durable active journal plus the procd-supervised `openwrtzapret-recovery` worker restores a snapshot if the job process dies or exceeds its deadline. Test All reuses the same serialized transaction path sequentially. Short service actions and Apply remain synchronous; testing uses `start_test`, `start_test_all`, `current_job`, `job_status`, `job_result` and `cancel_job`.

Flowseal BAT/CMD/EXE/PS1 files are input data only. A tokenizer/parser builds an AST for command segments and `--new`; an allowlisted converter emits verified nfqws2 arguments or marks the profile incompatible. Safe archive extraction checks paths, sizes and file types. Flowseal update never updates nfqws2 or the Zapret2 package.

## Final repository layout

```
LICENSE                         # preserve upstream MIT text
THIRD_PARTY_NOTICES.md
README.md                       # Phase B rebrand
docs/architecture.md
docs/upstream-audit.md
docs/phase-bc.md
docs/testing.md                 # Phase E
docs/flowseal-import.md         # Phase G
zapret2/                        # existing engine package and integration
  Makefile  init.d.sh  comfunc.sh  sync_config.sh  dwc.sh  ...
luci-app-zapret2/               # existing LuCI package, evolved/rebranded
  Makefile
  htdocs/luci-static/resources/view/zapret2/
  root/usr/share/luci/menu.d/
  root/usr/share/rpcd/acl.d/
  root/usr/share/rpcd/ucode/     # named actions, Phase C
  root/usr/libexec/openwrtzapret/ # fixed control adapter, Phase C
openwrtzapret/                  # added manager code/data, Phases D-H
  profiles/{builtin,flowseal,user}/
  libexec/
tests/                           # mock adapter, fixtures, transaction tests
tools/flowseal-importer/         # Phase G development tools
```

Retain original source paths until migration is tested; moving files only for branding would complicate upstream merges.

## Packaging and phases

The existing `zapret2/Makefile` builds the pinned engine and declares nftables, curl, gzip, coreutils, queue/NAT/offload kernel modules and supporting libraries. LuCI depends on `zapret2`. Reuse its APK/opkg build system. Claim compatibility only after building against an SDK/buildroot matching the target custom SNAPSHOT and ABI. No Python process is required on the router.

- **A audit:** import master, document code and risks. Source audit complete; installed-router behavior unverified.
- **B foundation:** attribution, README, menu/dashboard branding and upgrade path while preserving working views and configuration. Implemented locally.
- **C service:** named status/start/stop/restart, informational boot enabled state, narrowed ACL, fixed adapter, state verification and failure handling. Local mocks pass; router validation remains. Separate enable/disable controls are deferred.
- **D:** file-based profile catalog and transactional Apply with rollback. Implemented locally; router validation remains.
- **E–F:** one-profile Test with durable rollback, Test All and comparison UI. Implemented locally; router validation remains.
- **G:** Flowseal parser/converter. Implemented locally for the supported allowlist; supplied `general (ALT)` converts compatible.
- **H:** safe Flowseal stable-release updater, asset installation and diff UI. Not implemented yet.
- **I:** package build, upgrade/uninstall verification, documentation and mobile QA.

No live router state was changed. Before a live control test, inspect the installed wrapper, sourced init script/config, ubus methods, procd state and nft queue rules read-only.

The package Upgrade page and its LuCI execution grant are disabled until OpenWRTZapret has a validated release source; hostlist/data maintenance remains separate. CI builds the triggering repository/ref and logs its SHA. Automatic release publication and release-feed generation are disabled pending package and router validation. The installed LuCI package owns `/usr/share/openwrtzapret/api` containing `OPENWRTZAPRET_API=1`; the engine preinstall check requires it when LuCI is already installed. A legacy LuCI package must be upgraded first (to the current OpenWRTZapret LuCI package) before the engine `r2`, so the capability marker exists.

Phase D profiles are JSON files in `/usr/share/openwrtzapret/profiles/builtin` or `/etc/openwrtzapret/profiles/{flowseal,user}`. Profiles include `compatible`, validated TCP/UDP ports, `nfqws2`, structured `requirements` (`blobs`, `hostlists`, `ipsets`) and a SHA-256 content hash over normalized profile fields. UCI stores only `active_profile`; clearing it selects **Manual / Settings** mode, where normal Zapret2 UCI settings remain authoritative. Apply snapshots the runtime config and previous RUNNING/STOPPED state, verifies a candidate while temporarily running it, restores STOPPED when that was the initial state, and rolls back config, pointer and runtime state on failure. `builtin-general-alt` remains an incompatible reference placeholder. The async test job model is implemented locally. Phase G Flowseal conversion is a host-side/offline tool and adds no router Python dependency. Phase H download/import work must use a bounded job rather than blocking rpcd.
