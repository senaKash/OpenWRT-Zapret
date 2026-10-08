<h1 align="center">OpenWRTZapret</h1>

<p align="center"><strong>Управление обходом DPI на OpenWrt через собственный интерфейс LuCI.</strong></p>

<p align="center">Настройка обхода DPI <strong><em>без ручного перебора команд</em></strong>: импортирует совместимые конфигурации ПК-версии zapret, проверяет стратегии и показывает результаты, чтобы выбрать рабочий вариант прямо в LuCI.</p>

<p align="center">
  <a href="https://github.com/senaKash/OpenWRT-Zapret/releases/tag/v0.9.20260307-r3"><img src="https://img.shields.io/badge/Release-r3-8B5CF6?style=for-the-badge" alt="Release r3" /></a>
  <img src="https://img.shields.io/badge/OpenWrt-00ADEF?style=for-the-badge&logo=openwrt&logoColor=white" alt="OpenWrt" />
  <img src="https://img.shields.io/badge/LuCI-2563EB?style=for-the-badge" alt="LuCI" />
  <img src="https://img.shields.io/badge/Status-Preview-F59E0B?style=for-the-badge" alt="Preview" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge" alt="MIT" /></a>
</p>

<p align="center"><img src="docs/media/dashboard-demo.gif" alt="Работа OpenWRTZapret в LuCI" width="900" /></p>

<p align="center">
  <a href="https://github.com/senaKash/OpenWRT-Zapret/releases/tag/v0.9.20260307-r3"><strong>Скачать r3</strong></a> ·
  <a href="#-установка"><strong>Установка</strong></a> ·
  <a href="#-документация"><strong>Документация</strong></a> ·
  <a href="https://github.com/senaKash/OpenWRT-Zapret/issues"><strong>Сообщить о проблеме</strong></a>
</p>

---

## ✨ Возможности

| Раздел | Что доступно |
| :-- | :-- |
| **Dashboard** | Статус сервиса и активный профиль, **Start / Stop / Restart** |
| **Strategies** | **Полуавтоматическая настройка:** тест отдельной стратегии или всех сразу (**Test / Test All**), результаты проверок и выбор подходящего профиля |
| **Update Strategies** | Обновление стратегий с отображением этапов и прогресса |
| **Import Strategy** | **Совместимость с конфигурациями ПК-версии zapret:** импорт и преобразование поддерживаемых `general*.bat` в настройки OpenWrt без запуска BAT-файлов |
| **Lists** | Списки доменов и IP-адресов, пользовательские правила и исключения |
| **Diagnostics / Log Viewer** | Диагностика и просмотр журналов сервиса |

> [!TIP]
> **Помощь в подборе стратегии:** импортируйте совместимую конфигурацию с ПК, запустите **Test** или **Test All** и сравните результаты в интерфейсе. Постоянное применение стратегии — отдельное действие пользователя, а не скрытая автоматическая смена настроек. Во время проверки приложение временно активирует выбранную стратегию, затем предусматривает восстановление прежней конфигурации. Результат теста на роутере не гарантирует одинаковое поведение каждого устройства в локальной сети.

---

## ⚙️ Настройка и конфигурации с ПК

OpenWRTZapret рассчитан не только на ручное управление `nfqws2`. Приложение **помогает подобрать рабочую стратегию прямо на маршрутизаторе**: позволяет импортировать готовые параметры, протестировать одну или несколько стратегий, посмотреть результаты и затем применить подходящий профиль через LuCI.

**Если вы уже используете zapret на компьютере**, не обязательно переносить параметры вручную. Раздел **Import Strategy** поддерживает импорт и преобразование **совместимых конфигураций из `general*.bat`** ПК-сборок zapret в формат проекта. При этом Windows-скрипты **не выполняются** на роутере.

> [!NOTE]
> Совместимость относится к **поддерживаемым форматам и параметрам стратегий**, а не к любому `.bat` или произвольной конфигурации для ПК. Часть аргументов может требовать адаптации или не поддерживаться. После импорта рекомендуется запустить тест и только затем применить профиль.

---

## 📦 Установка

### Выберите подходящую сборку

| Выпуск | Целевая система | Архитектуры | Состояние |
| :-- | :-- | :-- | :-- |
| **[r3 — Multi-Architecture Preview](https://github.com/senaKash/OpenWRT-Zapret/releases/tag/v0.9.20260307-r3)** | OpenWrt **25.12.0** (APK) | `aarch64_cortex-a53`, `aarch64_generic`, `x86_64` | Собрано в CI; установка на устройствах ещё не подтверждена |
| **[r2 — Unified Preview](https://github.com/senaKash/OpenWRT-Zapret/releases/tag/v0.9.20260307-r2)** | Использовавшаяся при проверке сборка **OpenWrt SNAPSHOT** | `aarch64_cortex-a53` | Проверено на **Xiaomi AX3000T v2** |

> [!IMPORTANT]
> **Не устанавливайте r3 на SNAPSHOT только потому, что совпала архитектура.** Сборки r3 сделаны с SDK OpenWrt 25.12.0, а установка и совместимость на реальных устройствах ещё требуют проверки. Зависимости и ABI модулей ядра должны соответствовать вашей прошивке. Перед изменениями сохраните конфигурацию роутера.

**1.** Определите архитектуру и версию OpenWrt на маршрутизаторе:

```sh
cat /etc/openwrt_release
apk --print-arch
```

**2.** Скачайте соответствующий APK со страницы нужного выпуска в **[Releases](https://github.com/senaKash/OpenWRT-Zapret/releases)**. В r3 архитектура указана в конце имени файла, например:

```text
openwrtzapret-0.9.20260307-r3-aarch64_cortex-a53.apk
```

**3.** Передайте скачанный файл с компьютера на маршрутизатор (пример для `aarch64_cortex-a53`):

```sh
scp -O openwrtzapret-0.9.20260307-r3-aarch64_cortex-a53.apk root@192.168.1.1:/tmp/openwrtzapret.apk
```

**4.** Подключитесь к роутеру и установите приложение:

```sh
ssh root@192.168.1.1
apk add --allow-untrusted /tmp/openwrtzapret.apk
```

**5.** Откройте **LuCI → Services → OpenWRTZapret**.

> [!NOTE]
> `192.168.1.1` — пример адреса. Для установки недостающих зависимостей маршрутизатору нужен доступ к репозиториям, совместимым с его прошивкой. `--allow-untrusted` относится к установке локального неподписанного пакета и не устраняет несовместимость зависимостей.

<details>
<summary><b>🔐 Проверка SHA-256 для r3</b></summary>

Скачайте с релиза файл `SHA256SUMS` вместе с выбранным APK и поместите оба файла в одну папку. `SHA256SUMS` содержит суммы для всех трёх архитектур; для проверки одного скачанного APK можно использовать:

```sh
sha256sum openwrtzapret-0.9.20260307-r3-aarch64_cortex-a53.apk
```

Сверьте выведенный хеш со строкой этого файла в `SHA256SUMS`.

Если в папке находятся **все три APK** с исходными именами, достаточно:

```sh
sha256sum -c SHA256SUMS
```

</details>

<details>
<summary><b>🔄 Обновление установленной версии</b></summary>

**Сначала проверьте совместимость нового выпуска с вашей прошивкой.** Не обновляйте проверенный r2 на SNAPSHOT до r3, собранного для OpenWrt 25.12.0, без отдельной проверки.

После передачи совместимого APK в `/tmp/openwrtzapret.apk` выполните на маршрутизаторе:

```sh
apk add --allow-untrusted --upgrade /tmp/openwrtzapret.apk
```

Если сетевые репозитории временно недоступны **и все необходимые зависимости уже установлены**:

```sh
apk add --repositories-file /dev/null --allow-untrusted --upgrade /tmp/openwrtzapret.apk
```

Обновите страницу LuCI без кеша (`Ctrl + F5`).

</details>

<details>
<summary><b>⚠️ Переход с отдельных zapret2 и luci-app-zapret2</b></summary>

Единый пакет **конфликтует** с раздельно установленными `zapret2` и `luci-app-zapret2`, поскольку часть файлов совпадает.

**Сначала сохраните настройки и пользовательские стратегии.** Проверьте список пакетов, планируемых к удалению:

```sh
apk del --simulate luci-app-zapret2 zapret2
```

После проверки и при наличии необходимых зависимостей удалите старые пакеты:

```sh
apk del luci-app-zapret2 zapret2
```

Установите совместимый APK OpenWRTZapret по инструкции выше. **Не используйте `--force`** для игнорирования конфликтов или зависимостей.

</details>

---

## 🛠️ Сборка из исходников

<details>
<summary><b>Инструкция для OpenWrt buildroot</b></summary>

Используйте buildroot, настроенный под целевую систему, и добавьте feed в `feeds.conf`:

```text
src-git openwrtzapret https://github.com/senaKash/OpenWRT-Zapret.git;openwrtzapret
```

В корне buildroot выполните:

```sh
./scripts/feeds update openwrtzapret
./scripts/feeds install -p openwrtzapret openwrtzapret
make menuconfig
```

Выберите пакет **`openwrtzapret`** в режиме модуля (`M`), затем:

```sh
make package/feeds/openwrtzapret/openwrtzapret/compile V=s -j1
```

Ожидаемый путь результата для APK-сборки: `bin/packages/<architecture>/openwrtzapret/openwrtzapret-*.apk`.

</details>

## 📚 Документация

| Тема | Ссылка |
| :-- | :-- |
| Архитектура | [docs/architecture.md](docs/architecture.md) |
| Тестирование стратегий | [docs/testing.md](docs/testing.md) |
| Формат профилей | [docs/profile-format.md](docs/profile-format.md) |
| Импорт стратегий | [docs/flowseal-import.md](docs/flowseal-import.md) |

---

## ⚖️ Компоненты и лицензии

OpenWRTZapret содержит собственную LuCI-панель и логику управления. Для обработки трафика используется [Zapret2](https://github.com/bol-van/zapret2) (`nfqws2`); поддерживается импорт и преобразование совместимых конфигураций ПК-версии zapret, включая поддерживаемые стратегии из [zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube). Сторонние проекты развиваются независимо от OpenWRTZapret.

**Лицензия проекта:** [MIT](LICENSE) · **Сторонние компоненты:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
