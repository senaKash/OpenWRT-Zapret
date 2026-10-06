# OpenWRTZapret

OpenWRTZapret — интерфейс управления и менеджер стратегий для Zapret2/nfqws2 на OpenWrt.

Проект добавляет в LuCI управление состоянием Zapret2, работу с профилями стратегий, безопасное применение с откатом, тестирование стратегий и импорт конфигураций Flowseal. Сам механизм обхода DPI остаётся за Zapret2/nfqws2; OpenWRTZapret выступает управляющим слоем поверх него.

> **Status:** pre-release. Основной функционал реализован, но текущая версия ещё проходит проверку на целевых OpenWrt-системах.

## Возможности

- Dashboard в LuCI со статусом `nfqws2`, nftables, NFQUEUE и автозапуска.
- Start / Stop / Restart с проверкой фактического состояния сервиса.
- Профили стратегий из источников `builtin`, `flowseal` и `user`.
- Режим `Manual / Settings` для использования обычного `/opt/zapret2/config`.
- Безопасный Apply: перед изменением сохраняются текущий профиль, runtime-конфигурация и состояние сервиса; при ошибке выполняется rollback.
- `Test Strategy` — временный запуск выбранной стратегии с последующим восстановлением исходного состояния.
- `Test All` — последовательная проверка совместимых стратегий без автоматического применения результата.
- Сетевые проверки для YouTube, GoogleVideo, Discord, Discord Media и Discord Voice UDP/transport.
- Асинхронные задачи для долгих операций, журнал состояния и восстановление после прерывания.
- Импорт `general*.bat` из Flowseal как данных, без запуска Windows-скриптов и исполняемых файлов.
- Проверка stable-релизов Flowseal и обновление набора стратегий с состояниями `Added`, `Changed`, `Unchanged` и `Unsupported`.

## Требования

OpenWRTZapret рассчитан на OpenWrt с LuCI, `rpcd`, `rpcd-mod-ucode`, nftables и установленным Zapret2/nfqws2.

Для NFQUEUE обычно требуются:

```text
kmod-nfnetlink-queue
kmod-nft-queue
```

Для SNAPSHOT и сторонних сборок OpenWrt пакеты и kernel-модули должны соответствовать конкретной версии прошивки и ABI ядра.

## Установка

На данный момент готовые релизные APK не публикуются, поэтому пакеты необходимо собрать под целевую версию OpenWrt.

После сборки должны быть получены два пакета:

```text
luci-app-zapret2_*.apk
zapret2_*.apk
```

Скопируйте их на роутер, например:

```sh
scp luci-app-zapret2_*.apk root@192.168.1.1:/tmp/
scp zapret2_*.apk root@192.168.1.1:/tmp/
```

Подключитесь по SSH и установите сначала LuCI-пакет, затем основной пакет:

```sh
apk add --allow-untrusted /tmp/luci-app-zapret2_*.apk
apk add --allow-untrusted /tmp/zapret2_*.apk
```

После установки перезапустите `rpcd` и веб-интерфейс:

```sh
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
```

После этого откройте LuCI и перейдите в:

```text
Services → OpenWRTZapret
```

Перед первым применением профилей рекомендуется убедиться, что Dashboard корректно определяет текущее состояние Zapret2.

## Сборка

Используйте OpenWrt SDK или buildroot, соответствующий прошивке роутера.

Добавьте репозиторий как локальный feed:

```text
src-link openwrtzapret /path/to/OpenWRTZapret
```

Затем:

```sh
./scripts/feeds update -a
./scripts/feeds install -p openwrtzapret zapret2 luci-app-zapret2

make defconfig

make package/zapret2/compile V=s
make package/luci-app-zapret2/compile V=s
```

Найти собранные пакеты можно командой:

```sh
find bin -type f \( -name 'zapret2*.apk' -o -name 'luci-app-zapret2*.apk' \)
```

Не устанавливайте пакеты, собранные для несовместимого OpenWrt SNAPSHOT или другого kernel ABI.

## Использование

По умолчанию можно оставить Zapret2 в режиме `Manual / Settings`. В этом режиме OpenWRTZapret не управляет содержимым `/opt/zapret2/config`.

Для работы с профилями откройте страницу Strategies, выберите стратегию и сначала запустите `Test Strategy`. Тест временно применяет профиль, выполняет проверки и затем восстанавливает предыдущую конфигурацию и исходное состояние сервиса.

Если результат устраивает, профиль можно применить вручную через `Apply`.

`Test All` использует тот же механизм временного применения и восстановления для последовательной проверки всех совместимых профилей. OpenWRTZapret не выбирает и не применяет «лучшую» стратегию автоматически.

## Flowseal

OpenWRTZapret может импортировать стратегии из проекта [Flowseal/zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube).

Файлы `general*.bat` рассматриваются только как входные данные. `.bat`, `.cmd`, `.exe` и `.ps1` не выполняются.

Импортер разбирает поддерживаемые параметры, формирует профиль OpenWRTZapret и отмечает неизвестные опции как несовместимые. Несовместимый профиль отображается в интерфейсе, но не может быть применён.

Flowseal updater загружает stable-релиз во временный каталог, проверяет архив, импортирует стратегии и необходимые assets. Обновление не меняет активный профиль и не обновляет сам Zapret2/nfqws2.

## Надёжность

Операции применения и тестирования используют snapshot предыдущего состояния. При ошибке OpenWRTZapret пытается восстановить предыдущую runtime-конфигурацию, активный профиль и состояние `RUNNING`/`STOPPED`.

Долгие операции выполняются как отдельные jobs. Восстановление не должно зависеть от открытой вкладки браузера или активного RPC-соединения.

Проверка firewall/NFQUEUE является структурной: она подтверждает наличие ожидаемого процесса и правил nftables, но не является полной трассировкой прохождения каждого пакета.

## Текущий статус

Локально реализованы Dashboard, управление сервисом, профили, Apply/Rollback, `Test Strategy`, `Test All`, асинхронные jobs, Flowseal parser/converter и Flowseal updater.

До первого стабильного релиза необходимо подтвердить сборку и работу на целевом OpenWrt, включая rpcd/ucode, Apply/Rollback, сетевые тесты и обновление Flowseal.

## Происхождение и лицензии

OpenWRTZapret основан на пакетной инфраструктуре [remittor/zapret-openwrt](https://github.com/remittor/zapret-openwrt) и использует [bol-van/zapret2](https://github.com/bol-van/zapret2) как DPI-bypass engine.

Flowseal используется как источник стратегий и данных для импорта.

Информация о сторонних компонентах и лицензиях находится в `THIRD_PARTY_NOTICES.md`.
