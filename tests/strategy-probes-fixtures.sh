#!/bin/sh
set -u
. "$(dirname "$0")/../luci-app-zapret2/root/usr/libexec/openwrtzapret/service"

owz_probe_http() {
    local name
    case "$1" in
        *youtube.com*) name=youtube;;
        *discord.com*) name=discord;;
        *cloudflare.com*) name=cloudflare;;
        *github.com*) name=github;;
        *) return 2;;
    esac
    if [ "$name" = "${MOCK_FAIL:-}" ]; then
        printf '%s' '{"status":"FAIL"}'
        return 1
    fi
    printf '%s' '{"status":"PASS"}'
}

MOCK_FAIL=''; owz_profile_test_network
[ "$OWZ_TEST_OVERALL" = PASS ]
MOCK_FAIL=github; owz_profile_test_network
[ "$OWZ_TEST_OVERALL" = PARTIAL ]
MOCK_FAIL=cloudflare; owz_profile_test_network
[ "$OWZ_TEST_OVERALL" = PARTIAL ]
MOCK_FAIL=discord; owz_profile_test_network
[ "$OWZ_TEST_OVERALL" = FAIL ]
MOCK_FAIL=youtube; owz_profile_test_network
[ "$OWZ_TEST_OVERALL" = FAIL ]
for name in youtube discord cloudflare github; do
    case "$OWZ_TESTS_JSON" in *'"'"$name"'":'*) :;; *) exit 1;; esac
done
case "$OWZ_TESTS_JSON" in *googlevideo*|*discord_media*|*discord_voice_udp*) exit 1;; esac
printf '%s\n' 'Four HTTPS probe result rules passed'
