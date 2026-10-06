#!/bin/sh
# Read-only router inspection. Only the fixed output report is written.
OUT=/tmp/openwrtzapret-audit.txt
section() { printf '\n=== %s ===\n' "$1"; }
safe_table() {
	case "$1" in ''|*[!a-zA-Z0-9_]*) return 1;; esac
}
{
	section 'OpenWrt release'
	[ -r /etc/openwrt_release ] && cat /etc/openwrt_release
	section 'Kernel'
	uname -a
	section 'Installed package versions'
	if command -v apk >/dev/null 2>&1; then
		apk info -v zapret2 luci-app-zapret2 rpcd rpcd-mod-ucode 2>&1
	elif command -v opkg >/dev/null 2>&1; then
		opkg list-installed zapret2 luci-app-zapret2 rpcd rpcd-mod-ucode 2>&1
	fi
	section 'ubus method signatures'
	for object in luci rc openwrtzapret; do
		ubus -v list "$object" 2>&1
	done
	section 'Zapret2 procd state'
	ubus call service list '{"name":"zapret2"}' 2>&1
	section 'Init wrapper and selected calls'
	readlink -f /etc/init.d/zapret2 2>&1
	grep -nE '(^[[:space:]]*\.|source[[:space:]]|start_daemons|stop_daemons|start_fw|stop_fw|ZAPRET_BASE|ZAPRET_ORIG_INITD)' /etc/init.d/zapret2 2>&1 | head -n 80
	section 'Autostart'
	/etc/init.d/zapret2 enabled >/dev/null 2>&1 && echo enabled || echo disabled_or_unknown
	section 'Selected Zapret2 variables'
	if [ -r /opt/zapret2/config ]; then
		grep -E '^(ZAPRET_NFT_TABLE|FWTYPE|NFQWS2_ENABLE|QNUM)=' /opt/zapret2/config
	fi
	section 'nfqws2 process executables'
	for pid in $(pidof nfqws2 2>/dev/null); do
		case "$pid" in ''|*[!0-9]*) continue;; esac
		printf 'pid=%s exe=' "$pid"
		readlink "/proc/$pid/exe" 2>&1
	done
	section 'nft tables'
	nft list tables 2>&1
	section 'Zapret nft hooks and queue structure'
	table=$(sed -n 's/^ZAPRET_NFT_TABLE=//p' /opt/zapret2/config 2>/dev/null | tail -n 1)
	[ -n "$table" ] || table=zapret
	case "$table" in \'*\') table=${table#\'}; table=${table%\'};; \"*\") table=${table#\"}; table=${table%\"};; esac
	if safe_table "$table"; then
		printf 'inet table: %s\n' "$table"
		nft -t list table inet "$table" 2>&1 | grep -E '(^table |^[[:space:]]*flags dormant|^[[:space:]]*chain |type .*hook |queue (num|flags)| jump | goto )' | head -n 100
	else
		echo 'Invalid table name in config; skipped nft query'
	fi
	section 'Relevant logread tail (credential-like lines omitted)'
	logread 2>/dev/null | grep -Ei 'zapret2|openwrtzapret|rpcd' | grep -Evi 'password|passwd|token|secret|private.key|pppoe' | tail -n 60
} > "$OUT"
printf 'Audit written to %s\n' "$OUT"
