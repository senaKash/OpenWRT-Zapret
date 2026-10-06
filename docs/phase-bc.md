# Phase B/C implementation notes

## Architecture

The imported upstream history and `upstream` remote remain intact; the repository is no longer shallow. Engine package names, `/opt/zapret2`, UCI settings, upstream init/functions, Sites/DPI diagnostic scripts and log viewer stay in place. The LuCI menu opens `dashboard.js`; the old Service page is retained as **Diagnostics & Tools** with Reset and Diagnostics. Package Upgrade was removed from that page and its ACL because it could restore upstream remittor packages. Hostlist/data update paths are separate and remain available. No automatic OpenWRTZapret package updater is configured.

The browser invokes four no-argument methods on the `openwrtzapret` ubus object: `status`, `start`, `stop`, `restart`. The ucode rpcd plugin calls a fixed shell adapter through `fs.popen([argv])` without shell parsing. The adapter accepts only these literal actions, serializes mutations with a lock, synchronizes UCI config before starts, calls upstream init actions, and verifies the resulting state. Runtime control does not change boot enablement.

Start is idempotent when already RUNNING; Stop is idempotent when already STOPPED. Start from PARTIAL first clears firewall then daemons. Restart calls `stop_fw`, `stop_daemons`, `start_daemons`, `start_fw` as needed. Stopping removes queue rules before the daemon. A failed step or unmet postcondition returns `ok:false`, a specific `stage` and `error`, `final_state` and the observed status. If daemons started but firewall startup or verification fails, the adapter tries `stop_fw` and `stop_daemons`, reprobes, and reports `cleanup_attempted` and `cleanup_success`.

This sequence uses the separate actions exposed by the [Zapret2 OpenWrt init script](https://github.com/bol-van/zapret2/blob/master/init.d/openwrt/zapret2); the adapter skips a stop action when its component is already absent. The pinned engine commit is selected by `zapret2/Makefile`, but its behavior still needs confirmation on the installed router before a live test.

`status` checks all `nfqws2` PIDs and their `/proc/PID/exe` targets under `/opt/zapret2`; stale PIDs are skipped, unreadable targets cause probe ERROR, and foreign binaries are rejected. A deleted but still mapped Zapret2 binary counts as running. It also inspects the configured inet nft table and `/etc/init.d/zapret2 enabled`. The table name is read as a simple literal `ZAPRET_NFT_TABLE` assignment from `/opt/zapret2/config`, defaulting to `zapret`, and strictly validated. Status includes `table_state`, `hooked`, `queue_rule`, `firewall`, `nfqueue`, `enabled`, `partial`, `error` and `state`. RUNNING requires a Zapret2 daemon plus a queue rule in a hooked or jump-reachable chain. This is only structural detection; it does not prove packet traversal or site reachability.

The fixed lock directory contains owner PID, action and timestamp. A live matching owner yields BUSY; a dead or malformed owner is isolated and cleared before retry. These paths are tested with local fixtures, but remain unverified on the target router.

The old buttons called `luci.setInitAction`, which may be absent on current LuCI and returned only a generic success indicator. Its false/default result led to `Command failed` without checking processes or nft. Runtime buttons now live on the dashboard; the old Tools page no longer shows those controls. Settings' deferred restart uses the new RPC path.

Phase B/C narrowed service control to named `openwrtzapret` RPC methods. Later profile/testing phases add only named profile and job methods (`list/get/apply`, test start/status/result/cancel); arbitrary shell execution is still not exposed through this RPC. The ACL removes `luci.setInitAction`, direct `/etc/init.d/zapret2*`, `sync_config.sh` and package `update-pkg.sh` execution. Remaining `file.exec` grants support upstream Reset, Diagnostics, package information and file editor behavior; reducing them further requires migration of those features. The engine preinstall check requires the package-owned `OPENWRTZAPRET_API=1` marker when LuCI is installed. Upgrade legacy LuCI to `r2` before engine `r2`; no URL or JS content is used as a compatibility test.

## Local checks

On Windows with Node and Git Bash:

```powershell
node tests/dashboard.test.cjs
node tests/rpc.test.cjs
node tests/acl.test.cjs
& 'C:\Program Files\Git\bin\bash.exe' -n luci-app-zapret2/root/usr/libexec/openwrtzapret/service
& 'C:\Program Files\Git\bin\bash.exe' tests/service-fixtures.sh
& 'C:\Program Files\Git\bin\bash.exe' tests/probe-fixtures.sh
& 'C:\Program Files\Git\bin\bash.exe' tests/lock-fixtures.sh
node --check luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/dashboard.js
```

Fixtures cover fully running, fully stopped, daemon-only, firewall-only, failed start and stop, compensation, active/stale/malformed locks, plus process and nft output parsing. These are local mocks, not a real nftables or router test. No OpenWrt SDK or ucode runtime is available locally, so the ucode plugin still requires target-side load verification.

## Read-only router checks before the first live Start/Stop test

After a candidate is installed, place `tools/router-audit.sh` on the router and run it with BusyBox `/bin/sh` before pressing runtime controls. It writes only `/tmp/openwrtzapret-audit.txt`, collects selected config variables and structural nft lines, and omits credential-like log entries. Review and redact the report before sharing.

```sh
/bin/sh /tmp/router-audit.sh
cat /tmp/openwrtzapret-audit.txt
```

An absent nft table is normal when stopped. Do not run `start`, `stop` or `restart` until this evidence is reviewed.

## Building candidate packages with a matching OpenWrt SDK

Use a Linux OpenWrt SDK built from the **same custom SNAPSHOT source/configuration** as the AX3000T v2 firmware for `qualcommax/ipq50xx` and `aarch64_cortex-a53`. A generic public SDK with the same architecture is not enough to establish compatibility with this custom image. The SDK needs the LuCI feed and build prerequisites. OpenWrt documents [SDK setup](https://openwrt.org/docs/guide-developer/toolchain/using_the_sdk) and [local feeds](https://openwrt.org/docs/guide-developer/feeds).

In the SDK directory, add an absolute path to this checkout near the top of `feeds.conf.default`:

```text
src-link openwrtzapret /absolute/path/to/OpenWRTZapret
```

Then run:

```sh
./scripts/feeds update -a
./scripts/feeds install -p openwrtzapret zapret2 luci-app-zapret2
make defconfig
make package/zapret2/compile V=s
make package/luci-app-zapret2/compile V=s
find bin/packages -type f \( -name 'zapret2*.apk' -o -name 'luci-app-zapret2*.apk' \)
```

Inspect the package metadata and dependencies produced by the matching SDK before any install. This repository has not completed such a build; APK compatibility is unverified. The engine remains on its OpenWRTZapret `r2` compatibility generation; the LuCI package is now `r5`. On a legacy install, upgrade LuCI first so its capability marker is present before upgrading the engine package.


## Phase D.1 profile hardening

Strategies now support Manual / Settings mode, preserve the pre-Apply RUNNING/STOPPED state, use structured requirements and a `compatible` flag, validate port ranges (1..65535), and accept safe `@/path` references in `NFQWS2_OPT` while rejecting shell metacharacters.


## Phase E/F strategy testing

Strategies now expose asynchronous Test Strategy and Test All jobs. Jobs keep a persistent snapshot/journal under `/etc/openwrtzapret/state`, serialize mutations with the existing lock, restore the prior config/profile/runtime state, cache results by profile hash/source version, and are supervised by `openwrtzapret-recovery` if the worker dies or exceeds its deadline. Network probes are bounded and include YouTube, GoogleVideo, Discord, Discord Media, and a Discord UDP/QUIC transport-only signal. No test auto-applies a profile. This remains unverified on the target router.
