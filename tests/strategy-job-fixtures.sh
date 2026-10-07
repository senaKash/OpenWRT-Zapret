#!/bin/sh
set -e

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
sed "s|/opt/zapret2/config|$work/config|g" "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service" > "$work/service"
. "$work/service"
OWZ_JOB_ROOT="$work/jobs"
OWZ_RESULT_ROOT="$work/results"
OWZ_JOURNAL="$work/journal"
mkdir -p "$OWZ_JOB_ROOT" "$OWZ_RESULT_ROOT" "$OWZ_JOURNAL"
if ! command -v chmod >/dev/null 2>&1; then chmod() { :; }; fi

owz_lock() { return 0; }
owz_status() {
    OWZ_DAEMON=$MOCK_DAEMON OWZ_FIREWALL=$MOCK_FW OWZ_QUEUE_RULE=$MOCK_FW
    if [ "$MOCK_DAEMON" = true ] && [ "$MOCK_FW" = true ]; then OWZ_STATE=RUNNING
    elif [ "$MOCK_DAEMON" = false ] && [ "$MOCK_FW" = false ]; then OWZ_STATE=STOPPED
    else OWZ_STATE=PARTIAL; fi
    printf '{"state":"%s"}\n' "$OWZ_STATE"
}
owz_wait_for() { owz_status >/dev/null; [ "$OWZ_STATE" = "$1" ]; }
owz_init() {
    case "$1" in
        stop_fw) MOCK_FW=false; printf 'stop_fw\n' >> "$work/trace";;
        stop_daemons) MOCK_DAEMON=false; printf 'stop_daemons\n' >> "$work/trace";;
        start_daemons)
            local name=original
            if grep -q '^candidate=' "$work/config"; then name=$(sed -n 's/^candidate=//p' "$work/config"); fi
            MOCK_DAEMON=true; printf 'start:%s\n' "$name" >> "$work/trace";;
        start_fw) MOCK_FW=true; printf 'start_fw\n' >> "$work/trace";;
    esac
}
owz_profile_load() {
    OWZ_PROFILE_NAME=$1 OWZ_PROFILE_HASH=sha256:fixture OWZ_PROFILE_VERSION=X OWZ_PROFILE_COMPATIBLE=true
}
owz_profile_requirements_ready() { return 0; }
owz_sync() { return 0; }
owz_profile_overlay() {
    owz_wait_for STOPPED || return 1
    [ "$(cat "$work/config")" = baseline ] || return 1
    printf 'baseline:%s\n' "$1" >> "$work/trace"
    printf 'candidate=%s\n' "$1" >> "$work/config"
}
owz_profile_test_network() {
    OWZ_TEST_OVERALL=PASS
    OWZ_TESTS_JSON='{"youtube":{"status":"PASS"},"discord":{"status":"PASS"},"cloudflare":{"status":"PASS"},"github":{"status":"PASS"}}'
    [ "$MOCK_CANCEL" = true ] && : > "$MOCK_CANCEL_DIR/cancel"
    return 0
}
owz_profile_restore_pointer() {
    [ "$1" = builtin-default ] || return 1
    printf 'restore_pointer\n' >> "$work/trace"
}

run_case() {
    local job="$1" initial="$2" cancel="$3" dir="$OWZ_JOB_ROOT/$1"
    MOCK_DAEMON=$initial MOCK_FW=$initial
    MOCK_CANCEL=$cancel MOCK_CANCEL_DIR=$dir
    printf 'baseline\n' > "$work/config"
    : > "$work/trace"
    mkdir -p "$dir/snapshot" "$dir/results"
    cp "$work/config" "$dir/snapshot/config"
    printf 'old_profile=builtin-default\nold_state=%s\n' "$(if [ "$initial" = true ]; then printf RUNNING; else printf STOPPED; fi)" > "$dir/snapshot/meta"
    printf 'flowseal-a\nflowseal-b\n' > "$dir/profiles"
    printf 'all\n' > "$dir/mode"
    printf 'worker_pid=0\n' > "$dir/meta"
    : > "$dir/completed"
    printf '%s\n' "$job" > "$OWZ_JOURNAL/active"
    owz_job_run "$job"
    [ "$(cat "$work/config")" = baseline ]
    [ "$(grep -c '^start:flowseal-a$' "$work/trace")" -eq 1 ]
    if [ "$cancel" = true ]; then
        [ "$(grep -c '^start:flowseal-b$' "$work/trace" || :)" -eq 0 ]
        [ "$(grep -c '^baseline:' "$work/trace")" -eq 1 ]
        grep -Fq '"status":"CANCELLED"' "$dir/state.json"
    else
        [ "$(grep -c '^start:flowseal-b$' "$work/trace")" -eq 1 ]
        [ "$(grep -c '^baseline:' "$work/trace")" -eq 2 ]
        grep -Fq '"status":"DONE"' "$dir/state.json"
    fi
    [ "$(grep -c '^restore_pointer$' "$work/trace")" -eq 1 ]
    [ "$(grep -c '^start:original$' "$work/trace" || :)" -eq "$(if [ "$initial" = true ]; then printf 1; else printf 0; fi)" ]
    grep -Fq '"restored":true' "$dir/results/flowseal-a.json"
}

run_case 1-2 true false
run_case 1-3 false false
run_case 1-4 true true

dir="$OWZ_JOB_ROOT/1-5"
mkdir -p "$dir/snapshot" "$dir/results"
printf 'baseline\n' > "$dir/snapshot/config"
printf 'baseline\ncandidate=flowseal-a\n' > "$work/config"
printf 'old_profile=builtin-default\nold_state=RUNNING\n' > "$dir/snapshot/meta"
printf 'flowseal-a\nflowseal-b\n' > "$dir/profiles"
printf 'all\n' > "$dir/mode"
: > "$dir/completed"
: > "$work/trace"
MOCK_DAEMON=true MOCK_FW=true
printf '1-5\n' > "$OWZ_JOURNAL/active"
owz_job_recover 1-5 > /dev/null
[ "$(cat "$work/config")" = baseline ]
[ "$(grep -c '^start:original$' "$work/trace")" -eq 1 ]
grep -Fq '"status":"RECOVERED"' "$dir/state.json"
printf '%s\n' 'Test All isolation, cancel and recovery passed'
