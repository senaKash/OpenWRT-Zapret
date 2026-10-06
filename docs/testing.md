# Strategy testing

Phases E/F add asynchronous `Test Strategy` and `Test All Strategies` jobs. A test never commits the candidate as `active_profile`.

Before a job starts, OpenWRTZapret requires a clean Zapret2 UCI state and a verified RUNNING or STOPPED runtime. It stores a durable snapshot of `/opt/zapret2/config`, the active-profile pointer and the original runtime state under `/etc/openwrtzapret/state/jobs/<job-id>/snapshot`.

The worker temporarily starts each compatible profile, verifies the nfqws2 + nft/NFQUEUE structure, runs bounded HTTPS probes for YouTube, GoogleVideo, Discord and Discord Media, then performs an optional curl HTTP/3 probe to Discord as a limited UDP/QUIC transport signal. A PASS there means only that this Discord UDP transport probe worked; it does not verify an authenticated voice call or Discord voice media ports. The Discord Voice result is deliberately labelled **UDP / transport** and never claims that a real authenticated voice call succeeded.

Results are saved under `/etc/openwrtzapret/state/results/<profile-id>.json` with the profile `content_hash` and `source_version`. LuCI ignores cached results when either changes. Test All runs compatible profiles sequentially and shows progress plus per-profile results.

The journal, snapshot and cached results live under `/etc/openwrtzapret/state` so recovery evidence survives an rpcd/browser failure and normal reboot on OpenWrt overlay storage. A persistent journal identifies the active job. `/etc/init.d/openwrtzapret-recovery` supervises a lightweight recovery worker. If the job process disappears or exceeds its deadline, recovery attempts to restore the saved config, profile pointer and prior RUNNING/STOPPED state. Cancellation is cooperative and restoration still occurs before the job becomes terminal.

This implementation is locally syntax/mock checked only. Its procd lifecycle, curl capabilities, nft observations and rollback behavior still require validation on the target OpenWrt build before relying on it.

While a test is active, service/profile mutations through OpenWRTZapret are serialized by the same lock. Direct edits in the legacy Settings page are not yet transaction-locked; avoid changing Settings during a running test until that older path is migrated behind the manager.
