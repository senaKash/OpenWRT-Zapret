#!/bin/sh
set -eu
. "$(dirname "$0")/../luci-app-zapret2/root/usr/libexec/openwrtzapret/service"
tmp=$(mktemp -d)
cleanup() { rm -f "$tmp/lock/owner" "$tmp/lock.stale.$$/owner" "$tmp/journal/active" 2>/dev/null || :; rmdir "$tmp/lock" "$tmp/lock.stale.$$" "$tmp/journal" "$tmp" 2>/dev/null || :; }
OWZ_LOCK=$tmp/lock
OWZ_JOURNAL=$tmp/journal
mkdir "$OWZ_JOURNAL"
owz_sleep() { :; }

mkdir "$OWZ_LOCK"
printf '999999 start 1\n' > "$OWZ_LOCK/owner"
owz_lock start
read -r pid action stamp < "$OWZ_LOCK/owner"
[ "$pid" = "$$" ] && [ "$action" = start ] && [ "$stamp" -gt 0 ]
owz_unlock
[ ! -e "$OWZ_LOCK" ]

printf '1-2\n' > "$OWZ_JOURNAL/active"
if owz_lock start; then echo 'Runtime action bypassed active job journal' >&2; exit 1; fi
[ ! -e "$OWZ_LOCK" ]
owz_lock job_run
owz_unlock
rm -f "$OWZ_JOURNAL/active"

mkdir "$OWZ_LOCK"
printf 'malformed\n' > "$OWZ_LOCK/owner"
owz_lock restart
read -r pid action stamp < "$OWZ_LOCK/owner"
[ "$action" = restart ]
owz_unlock

mkdir "$OWZ_LOCK"
printf '1 start 1\n' > "$OWZ_LOCK/owner"
owz_owner_active() { return 0; }
if owz_lock stop; then echo 'Active lock was accepted' >&2; exit 1; fi
[ -f "$OWZ_LOCK/owner" ]
owz_unlock 2>/dev/null || :
cleanup
trap - EXIT INT TERM 2>/dev/null || :
printf '%s\n' 'lock fixture checks passed'
