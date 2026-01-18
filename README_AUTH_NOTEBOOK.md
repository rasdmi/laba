# Auth + Notebook (Google)

Если видишь `auth/unauthorized-domain`, это НЕ код, а настройка Firebase.

## Сделать один раз
Firebase Console → **Authentication → Settings → Authorized domains**
Добавь: **rasdmi.github.io**

Firebase Console → **Authentication → Sign-in method**
Включи: **Google**

## Роуты
- `#/login`
- `#/notebook`
- `#/character/<id>`

## Debug
На сайте в DevTools Console:
- `[firebase] host=...`
- `[firebase] projectId=...`


## Важно про шрифт Vasek

1) Положи файл шрифта в папку `media/` и **переименуй** в `Vasek-Italic_0.ttf` (без пробелов).
2) Проверь, что путь в `style.css` совпадает: `media/Vasek-Italic_0.ttf`.
3) На GitHub Pages чувствителен регистр и пробелы — поэтому на других устройствах шрифт мог не грузиться.
