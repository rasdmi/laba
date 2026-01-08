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
