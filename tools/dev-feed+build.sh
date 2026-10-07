#!/usr/bin/env bash
set -euo pipefail

BUILDROOT="$HOME/build/openwrt-xiaomi-ax3000t-rd03v2/openwrt"
FEED_DIR="$BUILDROOT/feeds/openwrtzapret"
REPO_URL="https://github.com/senaKash/OpenWRT-Zapret.git"
BRANCH="dev-flowseal-ui"
PACKAGE="luci-app-zapret2"

GREEN='\033[1;32m'
CYAN='\033[1;36m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
RESET='\033[0m'

step() {
    printf "\n${CYAN}==> %s${RESET}\n" "$1"
}

die() {
    printf "\n${RED}ERROR: %s${RESET}\n" "$1" >&2
    exit 1
}

[ -d "$BUILDROOT" ] || die "Buildroot не найден: $BUILDROOT"

cd "$BUILDROOT"

step "Обновляю dev-feed OpenWRTZapret"

if [ ! -d "$FEED_DIR/.git" ]; then
    rm -rf "$FEED_DIR"
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$FEED_DIR"
else
    git -C "$FEED_DIR" remote set-url origin "$REPO_URL"

    git -C "$FEED_DIR" fetch origin \
        "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"

    git -C "$FEED_DIR" checkout -B "$BRANCH" "refs/remotes/origin/$BRANCH"
fi

printf "${YELLOW}Ветка:${RESET} "
git -C "$FEED_DIR" branch --show-current

printf "${YELLOW}Коммит:${RESET} "
git -C "$FEED_DIR" log -1 --oneline

printf "${YELLOW}PKG_RELEASE:${RESET} "
grep -m1 '^PKG_RELEASE' "$FEED_DIR/luci-app-zapret2/Makefile" || true

step "Обновляю ссылки пакетов feed"
./scripts/feeds install -p openwrtzapret -f zapret2 luci-app-zapret2

step "Очищаю предыдущую сборку $PACKAGE"
make package/feeds/openwrtzapret/luci-app-zapret2/clean

step "Собираю $PACKAGE"
make package/feeds/openwrtzapret/luci-app-zapret2/compile V=s

step "Ищу свежий APK"

APK="$(
    find "$BUILDROOT/bin" -type f -name 'luci-app-zapret2*.apk' \
        -printf '%T@ %p\n' 2>/dev/null |
    sort -nr |
    head -n 1 |
    cut -d' ' -f2-
)"

[ -n "$APK" ] && [ -f "$APK" ] || die "Сборка завершилась, но APK не найден"

SIZE="$(du -h "$APK" | awk '{print $1}')"

printf "\n${GREEN}=============================================${RESET}\n"
printf "${GREEN} APK ГОТОВ${RESET}\n"
printf "${GREEN}=============================================${RESET}\n"
printf "${GREEN}%s${RESET}\n" "$APK"
printf "Размер: %s\n" "$SIZE"
printf "Коммит: %s\n" "$(git -C "$FEED_DIR" rev-parse --short HEAD)"
printf "Ветка:  %s\n" "$(git -C "$FEED_DIR" branch --show-current)"
printf "${GREEN}=============================================${RESET}\n"
printf '\a'


step "Отправляю APK на роутер"

ROUTER="root@192.168.1.1"
REMOTE_APK="/tmp/$(basename "$APK")"

printf "${YELLOW}Роутер:${RESET} %s\n" "$ROUTER"
printf "${YELLOW}Файл:${RESET} %s\n" "$REMOTE_APK"
printf "Введите пароль root роутера:\n\n"

scp -O "$APK" "$ROUTER:$REMOTE_APK"

printf "\n${GREEN}=============================================${RESET}\n"
printf "${GREEN} APK ОТПРАВЛЕН НА РОУТЕР${RESET}\n"
printf "${GREEN}=============================================${RESET}\n"
printf "%s\n" "$REMOTE_APK"
printf "\nДля установки на роутере:\n"
printf "${CYAN}apk add --allow-untrusted '%s'${RESET}\n" "$REMOTE_APK"
printf "${GREEN}=============================================${RESET}\n"