#!/bin/sh
# Установка Casebook (Arch, Debian/Ubuntu, Gentoo и любой другой Linux).
# Node.js не нужен: Electron скачивается готовым и кладётся в папку проекта.
set -e
cd "$(dirname "$0")"
APP="$(pwd)"
ELECTRON_VERSION="${ELECTRON_VERSION:-33.4.11}"
say() { printf '%s\n' "$*"; }
die() { say "Ошибка: $*"; exit 1; }
[ -r /etc/os-release ] && . /etc/os-release
FAMILY="${ID:-linux} ${ID_LIKE:-}"

find_electron() {
  if [ -n "$ELECTRON_BIN" ] && [ -x "$ELECTRON_BIN" ]; then echo "$ELECTRON_BIN"; return 0; fi
  if [ -x "$APP/electron/electron" ]; then echo "$APP/electron/electron"; return 0; fi
  p=$(command -v electron 2>/dev/null) && [ -n "$p" ] && { echo "$p"; return 0; }
  for d in "$HOME"/*/node_modules/electron/dist/electron; do
    [ -x "$d" ] && { echo "$d"; return 0; }
  done
  return 1
}

download_electron() {
  case "$(uname -m)" in
    x86_64) A=x64 ;; aarch64|arm64) A=arm64 ;;
    *) die "архитектура $(uname -m) не поддерживается скриптом. Поставьте electron пакетом и запустите: ELECTRON_BIN=/путь/к/electron sh install.sh" ;;
  esac
  URL="https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-linux-$A.zip"
  TMP=$(mktemp -d)
  say "Скачиваю Electron $ELECTRON_VERSION (около 100 МБ)…"
  if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 -o "$TMP/e.zip" "$URL" || die "не удалось скачать $URL"
  elif command -v wget >/dev/null 2>&1; then wget -O "$TMP/e.zip" "$URL" || die "не удалось скачать $URL"
  else die "нужен curl или wget (Debian/Ubuntu: sudo apt install curl)"; fi
  mkdir -p "$APP/electron"
  if command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$TMP/e.zip" -C "$APP/electron"
  elif command -v unzip >/dev/null 2>&1; then unzip -q -o "$TMP/e.zip" -d "$APP/electron"
  elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -e "$TMP/e.zip" "$APP/electron"
  else die "нужен один из инструментов: bsdtar, unzip или python3"; fi
  chmod +x "$APP/electron/electron" "$APP/electron/chrome_crashpad_handler" "$APP/electron/chrome-sandbox" 2>/dev/null || true
  rm -rf "$TMP"
}

ELECTRON="$(find_electron)" || { download_electron; ELECTRON="$APP/electron/electron"; }
[ -x "$ELECTRON" ] || die "не найден исполняемый файл Electron"
say "Electron: $ELECTRON"

# Проверка системных библиотек: на минимальных установках (особенно Debian) часть из них не стоит
if command -v ldd >/dev/null 2>&1; then
  MISSING=$(ldd "$ELECTRON" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')
  if [ -n "$MISSING" ]; then
    say ""
    say "Не хватает системных библиотек: $MISSING"
    case "$FAMILY" in
      *debian*|*ubuntu*) say "Установите: sudo apt install libgtk-3-0 libnss3 libxss1 libgbm1 libxtst6 libnotify4 libxkbcommon0 libatspi2.0-0 libdrm2 libasound2"
                         say "(на Debian 13 и Ubuntu 24.04 вместо libasound2 пакет называется libasound2t64)" ;;
      *arch*)            say "Установите: sudo pacman -S --needed gtk3 nss alsa-lib libxss libnotify libxtst" ;;
      *gentoo*)          say "Установите: sudo emerge --ask x11-libs/gtk+ dev-libs/nss media-libs/alsa-lib x11-libs/libXScrnSaver x11-libs/libnotify" ;;
      *)                 say "Установите GTK 3, NSS, ALSA, libXScrnSaver, libnotify средствами вашего дистрибутива." ;;
    esac
    say "После установки запустите этот скрипт ещё раз."
    exit 1
  fi
fi

# Старые файлы первой версии (лежали в корне папки)
rm -f "$APP/index.html" "$APP/board.js" "$APP/preload.js"

# На Ubuntu 24.04+ AppArmor запрещает песочницу Chromium без прав: добавляем --no-sandbox
FLAGS=""
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then
  FLAGS="--no-sandbox"
  say "Замечание: в системе включено ограничение пользовательских пространств имён, запуск будет с --no-sandbox."
fi

BIN="$HOME/.local/bin"; APPS="$HOME/.local/share/applications"
mkdir -p "$BIN" "$APPS"
cat > "$BIN/casebook" << LAUNCH
#!/bin/sh
exec "$ELECTRON" "$APP" $FLAGS "\$@"
LAUNCH
chmod +x "$BIN/casebook"
cat > "$APPS/casebook.desktop" << DESK
[Desktop Entry]
Type=Application
Name=Casebook
Comment=Рабочее место для OSINT-расследований
Exec=$BIN/casebook
Terminal=false
Categories=Utility;Network;
DESK

say ""
say "Готово. Запуск: casebook"
case ":$PATH:" in *":$BIN:"*) ;; *) say "Папки $BIN нет в PATH. Добавьте в ~/.profile: export PATH=\"\$PATH:$BIN\"" ;; esac
say "Данные и настройки: ${XDG_CONFIG_HOME:-$HOME/.config}/casebook/"
