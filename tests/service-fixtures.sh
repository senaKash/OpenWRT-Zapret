#!/bin/sh
set -eu
. "$(dirname "$0")/../luci-app-zapret2/root/usr/libexec/openwrtzapret/service"
set +e

owz_lock() { [ "${MOCK_LOCK:-}" != busy ]; }
owz_sleep() { :; }
MOCK_TRACE=$(mktemp)
trap 'rm -f "$MOCK_TRACE"' EXIT
owz_sync() { printf 'sync\n' >> "$MOCK_TRACE"; [ "${MOCK_FAIL:-}" != sync ]; }
owz_probe_daemon() { [ "$MOCK_DAEMON" = true ]; }
owz_probe_firewall() {
	if [ "$MOCK_FW" = true ]; then OWZ_FIREWALL=true OWZ_HOOKED=true; fi
	if [ "$MOCK_NFQ" = true ]; then OWZ_NFQUEUE=true OWZ_QUEUE_RULE=true; fi
	if [ "$MOCK_FW" = true ] && [ "$MOCK_NFQ" = true ] && [ "${MOCK_POSTCOND_FAIL:-false}" != true ]; then OWZ_TABLE_STATE=processing; fi
	return 0
}
owz_probe_enabled() { OWZ_ENABLED=false; }
owz_init() {
	printf '%s\n' "$1" >> "$MOCK_TRACE"
	case "$1" in
		stop_fw) [ "${MOCK_FAIL:-}" = stop_fw ] || [ "${MOCK_CLEANUP_FAIL:-}" = true ] && return 1; MOCK_FW=false MOCK_NFQ=false;;
		stop_daemons) [ "${MOCK_FAIL:-}" = stop_daemons ] && return 1; [ "$MOCK_DAEMON" = true ] || return 1; MOCK_DAEMON=false;;
		start_daemons) [ "${MOCK_FAIL:-}" = start_daemons ] && return 1; MOCK_DAEMON=true;;
		start_fw) [ "${MOCK_FAIL:-}" = start_fw ] && return 1; MOCK_FW=true MOCK_NFQ=true;;
	esac
	return 0
}

assert_contains() {
	case "$1" in *"$2"*) :;; *) printf 'Expected %s in %s\n' "$2" "$1" >&2; exit 1;; esac
}
assert_json() { printf '%s' "$1" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'; }

MOCK_DAEMON=true MOCK_FW=true MOCK_NFQ=true
assert_contains "$(owz_status)" '"state":"RUNNING"'
MOCK_FAIL=sync
assert_contains "$(owz_control start)" '"ok":true'
assert_json "$(owz_control start)"
MOCK_FAIL=''

MOCK_DAEMON=false MOCK_FW=false MOCK_NFQ=false
assert_contains "$(owz_status)" '"state":"STOPPED"'
MOCK_FAIL=stop_fw
assert_contains "$(owz_control stop)" '"ok":true'
MOCK_FAIL=''
assert_contains "$(owz_control start)" '"state":"RUNNING"'
assert_json "$(owz_control start)"

MOCK_DAEMON=true MOCK_FW=false MOCK_NFQ=false
assert_contains "$(owz_status)" '"state":"PARTIAL"'
assert_contains "$(owz_control start)" '"state":"RUNNING"'

MOCK_DAEMON=false MOCK_FW=true MOCK_NFQ=true
assert_contains "$(owz_status)" '"state":"PARTIAL"'
assert_contains "$(owz_control stop)" '"state":"STOPPED"'

MOCK_DAEMON=true MOCK_FW=true MOCK_NFQ=true
: > "$MOCK_TRACE"
assert_contains "$(owz_control restart)" '"state":"RUNNING"'
actual=$(tr '\n' ' ' < "$MOCK_TRACE")
[ "$actual" = 'stop_fw stop_daemons sync start_daemons start_fw ' ] || {
	printf 'Wrong restart order: %s\n' "$actual" >&2
	exit 1
}

MOCK_DAEMON=false MOCK_FW=false MOCK_NFQ=false MOCK_FAIL=start_daemons
assert_contains "$(owz_control start)" '"error":"start_daemons_failed"'
assert_json "$(owz_control start)"

MOCK_DAEMON=false MOCK_FW=false MOCK_NFQ=false MOCK_FAIL=start_fw
: > "$MOCK_TRACE"
result=$(owz_control start)
assert_contains "$result" '"cleanup_attempted":true'
assert_contains "$result" '"cleanup_success":true'
assert_contains "$result" '"final_state":"STOPPED"'
assert_json "$result"
actual=$(tr '\n' ' ' < "$MOCK_TRACE")
[ "$actual" = 'sync start_daemons start_fw stop_fw stop_daemons ' ] || { echo "Wrong cleanup order: $actual" >&2; exit 1; }

MOCK_DAEMON=false MOCK_FW=false MOCK_NFQ=false MOCK_FAIL=start_fw MOCK_CLEANUP_FAIL=true
result=$(owz_control start)
assert_contains "$result" '"cleanup_success":false'
assert_json "$result"
MOCK_CLEANUP_FAIL=false

MOCK_DAEMON=true MOCK_FW=true MOCK_NFQ=true MOCK_FAIL=stop_fw
result=$(owz_control stop)
assert_contains "$result" '"error":"stop_firewall_failed"'
assert_contains "$result" '"stage":"stop_firewall"'
assert_json "$result"

MOCK_FAIL=stop_daemons
assert_contains "$(owz_control restart)" '"stage":"stop_daemons"'
MOCK_DAEMON=false MOCK_FW=false MOCK_NFQ=false MOCK_FAIL=start_daemons
assert_contains "$(owz_control restart)" '"stage":"start_daemons"'
MOCK_FAIL=start_fw
assert_contains "$(owz_control restart)" '"stage":"start_firewall"'
MOCK_FAIL='' MOCK_POSTCOND_FAIL=true
assert_contains "$(owz_control restart)" '"stage":"verify_final"'
MOCK_POSTCOND_FAIL=false

MOCK_FAIL='' MOCK_LOCK=busy
assert_contains "$(owz_control restart)" '"error":"busy"'

printf '%s\n' 'service fixture checks passed'
