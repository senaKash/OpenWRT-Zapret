#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
printf '%s\n' 'baseline config' > "$work/config"
sed "s|/opt/zapret2/config|$work/config|g" "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service" > "$work/service"
. "$work/service"

ACTIVE_PROFILE=builtin-old
DAEMON=false
FIREWALL=false
QUEUE=false
FAIL_START_FW_ONCE=false

owz_lock() { return 0; }
owz_unlock() { :; }
owz_profile_load() {
	OWZ_PROFILE_COMPATIBLE=true
	OWZ_PROFILE_BLOBS=''
	OWZ_PROFILE_HOSTLISTS=''
	OWZ_PROFILE_IPSETS=''
	return 0
}
owz_profile_requirements_ready() { return 0; }
owz_profile_overlay() { printf 'profile config %s\n' "$1" > "$work/config"; }
owz_sync() { return 0; }
owz_status() {
	OWZ_DAEMON=$DAEMON
	OWZ_FIREWALL=$FIREWALL
	OWZ_QUEUE_RULE=$QUEUE
	OWZ_NFQUEUE=$QUEUE
	if [ "$DAEMON" = true ] && [ "$FIREWALL" = true ] && [ "$QUEUE" = true ]; then
		OWZ_STATE=RUNNING
	elif [ "$DAEMON" = false ] && [ "$FIREWALL" = false ] && [ "$QUEUE" = false ]; then
		OWZ_STATE=STOPPED
	else
		OWZ_STATE=PARTIAL
	fi
	printf '{"state":"%s"}\n' "$OWZ_STATE"
}
owz_wait_for() {
	owz_status >/dev/null
	[ "$OWZ_STATE" = "$1" ]
}
owz_init() {
	case "$1" in
		stop_fw) FIREWALL=false; QUEUE=false;;
		stop_daemons) DAEMON=false;;
		start_daemons) DAEMON=true;;
		start_fw)
			if [ "$FAIL_START_FW_ONCE" = true ]; then FAIL_START_FW_ONCE=false; return 1; fi
			FIREWALL=true; QUEUE=true;;
		*) return 1;;
	esac
	return 0
}
uci() {
	case "$1 $2" in
		'-q changes') return 0;;
		'-q get')
			[ "$3" = zapret2.config.active_profile ] || return 1
			[ -n "$ACTIVE_PROFILE" ] || return 1
			printf '%s\n' "$ACTIVE_PROFILE";;
		'-q set')
			case "$3" in zapret2.config.active_profile=*) ACTIVE_PROFILE=${3#*=};; *) return 1;; esac;;
		'-q delete') ACTIVE_PROFILE='';;
		'-q commit') return 0;;
		*) return 1;;
	esac
}

# Apply из STOPPED должен запустить выбранный профиль.
owz_apply_profile flowseal-from-stopped > "$work/result.json"
result=$(cat "$work/result.json")
printf '%s\n' "$result" | grep -Fq '"ok":true'
printf '%s\n' "$result" | grep -Fq '"state":"RUNNING"'
[ "$OWZ_STATE" = RUNNING ]
[ "$ACTIVE_PROFILE" = flowseal-from-stopped ]
grep -Fq 'profile config flowseal-from-stopped' "$work/config"

# Apply из RUNNING также должен оставить новую стратегию в RUNNING.
ACTIVE_PROFILE=flowseal-from-stopped
printf '%s\n' 'running baseline config' > "$work/config"
DAEMON=true; FIREWALL=true; QUEUE=true
owz_apply_profile flowseal-from-running > "$work/result.json"
result=$(cat "$work/result.json")
printf '%s\n' "$result" | grep -Fq '"ok":true'
printf '%s\n' "$result" | grep -Fq '"state":"RUNNING"'
[ "$OWZ_STATE" = RUNNING ]
[ "$ACTIVE_PROFILE" = flowseal-from-running ]

# Ошибка кандидата должна вернуть предыдущий config/profile и запустить их.
ACTIVE_PROFILE=flowseal-previous
printf '%s\n' 'previous config' > "$work/config"
DAEMON=false; FIREWALL=false; QUEUE=false
FAIL_START_FW_ONCE=true
owz_apply_profile flowseal-failing > "$work/result.json"
result=$(cat "$work/result.json")
printf '%s\n' "$result" | grep -Fq '"ok":false'
printf '%s\n' "$result" | grep -Fq '"rolled_back":true'
printf '%s\n' "$result" | grep -Fq '"state":"RUNNING"'
[ "$OWZ_STATE" = RUNNING ]
[ "$ACTIVE_PROFILE" = flowseal-previous ]
grep -Fxq 'previous config' "$work/config"

printf '%s\n' 'Apply transitions and rollback restore RUNNING'
