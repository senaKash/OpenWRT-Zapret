#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
printf '%s\n' 'original runtime config' > "$work/config"
sed "s|/opt/zapret2/config|$work/config|g" "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service" > "$work/service"
. "$work/service"

if ! command -v sha256sum >/dev/null 2>&1; then
    : "${OWZ_TEST_PYTHON:=python3}"
    sha256sum() {
        "$OWZ_TEST_PYTHON" -c 'import hashlib,sys; p=sys.argv[1]; print(hashlib.sha256(open(p,"rb").read()).hexdigest(), p)' "$1"
    }
fi

owz_lock() { return 0; }
owz_profile_load() {
    OWZ_PROFILE_COMPATIBLE=true
    OWZ_PROFILE_BLOBS="$work/missing.bin"
    OWZ_PROFILE_HOSTLISTS=''
    OWZ_PROFILE_IPSETS=''
}
owz_status() { OWZ_STATE=RUNNING; printf '%s\n' '{"state":"RUNNING"}'; }
owz_init() { printf '%s\n' "$1" >> "$work/init-calls"; return 1; }
uci() {
    case "$*" in
        '-q changes zapret2') return 0;;
        '-q get zapret2.config.active_profile') printf '%s\n' builtin-default;;
        *) printf 'unexpected uci mutation: %s\n' "$*" >&2; return 1;;
    esac
}

before=$(sha256sum "$work/config"); before=${before%% *}
result=$(owz_apply_profile flowseal-x-general-alt12)
after=$(sha256sum "$work/config"); after=${after%% *}
[ "$before" = "$after" ]
[ ! -e "$work/init-calls" ]
[ "$(uci -q get zapret2.config.active_profile)" = builtin-default ]
printf '%s\n' "$result" | grep -Fq '"error":"missing_requirements"'
printf '%s\n' "$result" | grep -Fq '"state":"RUNNING"'
printf '%s\n' "$result" | grep -Fq '"missing_requirement":"'"$work"'/missing.bin"'
printf '%s\n' 'Apply validation keeps config SHA, profile pointer and RUNNING state'
