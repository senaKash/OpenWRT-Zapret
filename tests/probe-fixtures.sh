#!/bin/sh
set -u
. "$(dirname "$0")/../luci-app-zapret2/root/usr/libexec/openwrtzapret/service"

owz_table_name() { printf zapret; }
owz_proc_exists() { [ "$1" != 999 ]; }
pidof() { [ "${MOCK_PIDS:-}" != '' ] && printf '%s\n' "$MOCK_PIDS"; }
readlink() {
	[ "$1" = /proc/999/exe ] && return 1
	printf '%s\n' "${MOCK_EXE:-/opt/zapret2/nfq2/nfqws2}"
}
nft() {
	[ "${MOCK_NFT_ERROR:-false}" = true ] && return 1
	case "$*" in
		'list tables') [ "$MOCK_TABLE" = true ] && printf 'table inet zapret\n'; return 0;;
		'-t list table inet zapret')
			[ "${MOCK_DORMANT:-false}" = true ] && printf 'flags dormant;\n'
			[ "$MOCK_HOOK" = true ] && printf 'chain forward {\n type filter hook forward priority -1; policy accept;\n %s\n}\n' "${MOCK_JUMP:-}"
			[ "$MOCK_QUEUE" = true ] && printf 'chain packet_filter {\n tcp dport 443 queue num 300 bypass\n}\n'
			[ "$MOCK_STRAY_QUEUE" = true ] && printf 'chain unused {\n udp dport 443 queue num 301 bypass\n}\n'
			return 0;;
	esac
	return 1
}
owz_probe_enabled() { OWZ_ENABLED=null; }

assert_state() {
	result=$(owz_status)
	case "$result" in *'"state":"'"$1"'"'*) :;; *) printf 'Expected %s in %s\n' "$1" "$result" >&2; exit 1;; esac
}
assert_contains() {
	case "$1" in *"$2"*) :;; *) printf 'Expected %s in %s\n' "$2" "$1" >&2; exit 1;; esac
}

MOCK_PIDS='999 123' MOCK_TABLE=true MOCK_HOOK=true MOCK_QUEUE=true MOCK_JUMP='jump packet_filter'
MOCK_STRAY_QUEUE=false MOCK_NFT_ERROR=false MOCK_DORMANT=false
assert_state RUNNING
assert_contains "$(owz_status)" '"table_state":"processing"'
MOCK_EXE='/opt/zapret2/alternate/nfqws2 (deleted)'
assert_state RUNNING
MOCK_EXE=/usr/bin/nfqws2
assert_state PARTIAL
MOCK_EXE=/opt/zapret2/nfq2/nfqws2
MOCK_JUMP=''
assert_state PARTIAL
assert_contains "$(owz_status)" '"table_state":"unreachable_queue"'
MOCK_JUMP='jump packet_filter'
MOCK_QUEUE=false MOCK_STRAY_QUEUE=true
assert_state PARTIAL
MOCK_PIDS='' MOCK_TABLE=false MOCK_HOOK=false MOCK_QUEUE=false MOCK_STRAY_QUEUE=false
assert_state STOPPED
MOCK_TABLE=true
assert_state STOPPED
MOCK_PIDS=123 MOCK_TABLE=false
assert_state PARTIAL
MOCK_PIDS='' MOCK_TABLE=true MOCK_HOOK=true MOCK_QUEUE=true
assert_state PARTIAL
MOCK_DORMANT=true
assert_state STOPPED
MOCK_DORMANT=false MOCK_NFT_ERROR=true
assert_state ERROR

owz_valid_table_name zapret_2 || exit 1
if owz_valid_table_name 'zapret;reboot'; then exit 1; fi
if owz_valid_table_name '../zapret'; then exit 1; fi
printf '%s\n' 'probe fixture checks passed'
