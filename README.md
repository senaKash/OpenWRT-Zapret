# OpenWRTZapret

LuCI-пакет для управления Zapret2 на OpenWrt.

![OpenWrt](https://img.shields.io/badge/platform-OpenWrt-00ADEF?logo=openwrt&logoColor=white)
![LuCI](https://img.shields.io/badge/interface-LuCI-2878B5)
![Engine](https://img.shields.io/badge/engine-Zapret2-6A5ACD)
![License](https://img.shields.io/badge/license-MIT-green)

**Теги:** `openwrt` · `luci` · `zapret2` · `nftables` · `router` · `dpi-bypass`

> Статус: разработка. Совместимость проверяйте на целевой версии OpenWrt.

## Возможности

- Статус и управление сервисом.
- Профили стратегий: применение, тест выбранного профиля и последовательный тест совместимых профилей.
- Списки доменов и IP: встроенные списки и пользовательские overrides.
- Диагностика, журнал и восстановление после прерванной тестовой задачи.
- Импорт совместимых конфигов Zapret для ПК (`general*.bat`); поддерживается часть параметров, файлы преобразуются и не запускаются.

## Требования

- OpenWrt с LuCI, `rpcd-mod-ucode` и nftables.
- Установленный пакет Zapret2 и `nfqws2`.
- Для очередей NFQUEUE — соответствующие прошивке модули, обычно `kmod-nfnetlink-queue` и `kmod-nft-queue`.

Модули ядра и пакеты должны соответствовать версии прошивки и ABI ядра устройства.

## Установка из релиза

Откройте [Releases](https://github.com/senaKash/OpenWRT-Zapret/releases) и скачайте пакеты `zapret2_*.apk` и `luci-app-zapret2_*.apk`, соответствующие вашей системе.

Скопируйте их на роутер:

```sh
scp zapret2_*.apk luci-app-zapret2_*.apk root@192.168.1.1:/tmp/
```

На OpenWrt с `apk` установите оба пакета:

```sh
apk add --allow-untrusted /tmp/zapret2_*.apk /tmp/luci-app-zapret2_*.apk
```

Откройте LuCI: **Services → OpenWRTZapret**.

## Сборка из исходного кода

Собирайте пакеты в OpenWrt SDK или buildroot, подходящем для целевой прошивки. Добавьте репозиторий в `feeds.conf`:

```text
src-link openwrtzapret /path/to/OpenWRTZapret
```

Затем из корня OpenWrt SDK/buildroot:

```sh
./scripts/feeds update -a
./scripts/feeds install -p openwrtzapret zapret2 luci-app-zapret2
make defconfig
make package/zapret2/compile V=s
make package/luci-app-zapret2/compile V=s
```

Пакеты появятся в `bin/`. Используйте сборку для версии OpenWrt и архитектуры устройства.

## Работа в LuCI

- **Dashboard** — состояние и управление сервисом.
- **Strategies** — выбор профиля, Apply, тест выбранной стратегии и Test All.
- **Lists** — встроенные списки и пользовательские overrides. После изменения нажмите **Apply Changes**.
- **Diagnostics & Tools** и **Log Viewer** — диагностика и журналы.
- **Import Strategy** — импорт поддерживаемого файла стратегии.

Тесты временно запускают профиль, выполняют сетевые проверки с роутера и восстанавливают исходную конфигурацию. Результат может отличаться от поведения трафика LAN-клиента.

## Документация

- [Архитектура](docs/architecture.md)
- [Тестирование стратегий](docs/testing.md)
- [Формат профиля](docs/profile-format.md)
- [Импорт стратегий](docs/flowseal-import.md) ([источник](https://github.com/Flowseal/zapret-discord-youtube))
- [Сторонние компоненты и лицензии](THIRD_PARTY_NOTICES.md)

## Лицензия

Основная лицензия репозитория — MIT, см. [LICENSE](LICENSE). Сведения о стороннем коде и его лицензиях приведены в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
