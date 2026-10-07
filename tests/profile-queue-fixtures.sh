#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
mkdir -p "$work/builtin" "$work/flowseal/imported" "$work/user"

printf '%s\n' '{"compatible":true}' > "$work/builtin/builtin-default.json"
printf '%s\n' '{"compatible":true}' > "$work/flowseal/flowseal-general-alt.json"
printf '%s\n' '{"compatible":true}' > "$work/flowseal/imported/flowseal-general-alt10.json"
printf '%s\n' '{"compatible":true}' > "$work/flowseal/imported/flowseal-general-alt11.json"
printf '%s\n' '{"compatible":false}' > "$work/flowseal/imported/flowseal-broken.json"

sed -e "s|/usr/share/openwrtzapret/profiles/builtin|$work/builtin|g" \
    -e "s|/etc/openwrtzapret/profiles/flowseal|$work/flowseal|g" \
    -e "s|/etc/openwrtzapret/profiles/user|$work/user|g" \
    "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service" > "$work/service"
. "$work/service"

owz_profile_load() {
    local file
    file=$(owz_profile_file "$1") || return 1
    OWZ_PROFILE_COMPATIBLE=$(sed -n 's/.*"compatible":\(true\|false\).*/\1/p' "$file")
    [ -n "$OWZ_PROFILE_COMPATIBLE" ]
}
owz_profile_requirements_ready() { return 1; }

listing=$(owz_profile_list)
queue=$(owz_list_compatible_profiles)
total=$(printf '%s\n' "$queue" | awk 'NF{n++} END{print n+0}')
[ "$total" -eq 4 ]
for id in builtin-default flowseal-general-alt flowseal-general-alt10 flowseal-general-alt11; do
    printf '%s\n' "$queue" | grep -Fqx "$id"
    printf '%s\n' "$listing" | grep -Fq '"'"$id"'"'
done
printf '%s\n' "$listing" | grep -Fq '"flowseal-broken"'
! printf '%s\n' "$queue" | grep -Fqx flowseal-broken
! printf '%s\n' "$queue" | grep -Fqx __manual__
printf '%s\n' 'Profile queue fixture passed: 4 compatible profiles'
