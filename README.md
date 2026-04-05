# UAV Telemetry Analysis MVP

MVP для парсингу ArduPilot DataFlash `.BIN` логів, розрахунку метрик польоту та 3D превʼю місії.

[![Netlify Status](https://api.netlify.com/api/v1/badges/7f414f34-9052-47c0-8428-2f05eb8ce4f7/deploy-status)](https://app.netlify.com/projects/best-type-shit/deploys)

## Чому саме цей стек

- `FastAPI` забезпечує швидкий API для завантаження та простий спосіб обслуговувати MVP превʼю з того ж бекенду.
- `pybind11 + C++` використовується для парсингу бінарних ArduPilot логів та конвертації GPS в ENU, де нативний код ідеально підходить для пропускної здатності та низькорівневого декодування бінарних даних.
- `React + Vite` надає швидкий DX та оптимальний production build.
- `CesiumJS` дає інтерактивний 3D вигляд місії з керуванням камерою з коробки.
- `Three.js + React Three Fiber` для локальної 3D візуалізації траєкторії в координатах ENU.
- `Chart.js` достатньо для легких графіків місії всередині dashboard.

## Реалізовано в MVP

- Завантаження ArduPilot `.BIN` логів.
- Парсинг доступних повідомлень з бінарного потоку.
- Конвертація GPS координат з WGS-84 в локальні ENU координати відносно точки зльоту.
- Розрахунок метрик місії:
  - загальна відстань через `haversine`
  - тривалість польоту
  - максимальний набір висоти
  - максимальна горизонтальна швидкість з IMU прискорення через трапецієподібну інтеграцію
  - максимальна вертикальна швидкість з IMU прискорення через трапецієподібну інтеграцію
  - максимальне прискорення
- Dashboard з:
  - 3D траєкторією (глобальна та локальна)
  - розфарбовкою траєкторії за швидкістю або часом
  - картками метрик
  - графіками висоти, швидкості та прискорення
  - попередженнями / аномаліями
  - AI-асистентом для аналізу польоту

## Структура проєкту

```
.
├── backend/
│   ├── src/
│   │   ├── main.py                          — FastAPI app, routing, CORS
│   │   ├── core/
│   │   │   └── config.py                    — Налаштування (pydantic-settings)
│   │   ├── api/
│   │   │   ├── router.py                    — HTTP endpoints
│   │   │   └── ws.py                        — WebSocket для AI чату
│   │   ├── services/
│   │   │   ├── flight_parser.py             — Python обгортка над C++ модулем
│   │   │   └── flight_analysis.py           — Розрахунок метрик
│   │   └── native/
│   │       └── main.cpp                     — C++ парсер та аналізатор
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── app.tsx                          — Головний компонент з роутингом
    │   ├── features/
    │   │   └── flight-analysis/             — Feature модуль аналізу
    │   ├── components/
    │   │   ├── cesium-viewer.tsx            — Глобальна 3D траєкторія
    │   │   ├── enu-viewer.tsx               — Локальна 3D траєкторія (Three.js)
    │   │   ├── telemetry-charts.tsx         — Синхронізовані графіки
    │   │   └── ai-debrief.tsx               — AI чат інтерфейс
    │   ├── hooks/                           — React хуки
    │   ├── lib/                             — Утиліти та конфіги
    │   └── styles/                          — Глобальні стилі
    └── package.json
```

---

## Frontend Stack

### Core Technologies

- **React 19** — UI бібліотека з новими хуками та Server Components
- **TypeScript 5.9** — Статична типізація для надійності коду
- **Vite 7** — Швидкий bundler з HMR та оптимізованими production builds
- **React Router 7** — Декларативний роутинг з типобезпекою

### UI Framework

- **shadcn/ui** — Composable компоненти побудовані на Radix UI
- **Radix UI** — Unstyled, accessible компоненти:
  - Dialog, Dropdown Menu, Select, Tabs
  - Progress, Tooltip, Scroll Area
  - Label, Separator, Slot
- **Tailwind CSS 3.4** — Utility-first CSS framework
- **Tailwind Animate** — Готові CSS анімації
- **Framer Motion** — Декларативні анімації та жести

### 3D Visualization

- **CesiumJS 1.140** — Глобальна 3D візуалізація траєкторії на WGS-84 сфері
- **Three.js 0.183** — WebGL для локальної 3D візуалізації в ENU координатах
- **React Three Fiber 9.5** — Декларативний React renderer для Three.js
- **React Three Drei 10.7** — Helpers та готові компоненти для R3F (OrbitControls, Environment, тощо)
- **OGL 1.0** — Легка WebGL бібліотека для custom рендерингу

### Data Visualization

- **Chart.js 4.5** — Графіки висоти, швидкості, прискорення
- **react-chartjs-2 5.3** — React обгортка над Chart.js з хуками

### State Management & Data Fetching

- **Zustand 5.0** — Мінімалістичний стейт менеджмент
- **TanStack Query 5.90** — Async state management, кешування, синхронізація
- **React Hook Form 7.71** — Performant форми з валідацією
- **Zod 4.3** — TypeScript-first схема валідації

### Real-time Communication

- **react-use-websocket 4.13** — WebSocket хук для AI streaming chat

### Developer Experience

- **ESLint 9** — Лінтинг з React-специфічними правилами
- **Playwright** — E2E тестування
- **TypeScript ESLint 8** — TypeScript правила для ESLint
- **Vite Plugin Cesium** — Інтеграція CesiumJS з Vite

### Utilities

- **clsx + tailwind-merge** — Умовне та оптимізоване зʼєднання класів
- **class-variance-authority** — Type-safe варіанти компонентів
- **lucide-react** — Іконки (SVG icon library)
- **react-hot-toast** — Toast нотифікації

---

## Запуск через Docker Compose

### 1. Налаштування environment

```bash
cp .env.example .env
```

Відредагуйте `.env` та заповніть необхідні значення:

```env
GEMINI_API_KEY=your-gemini-api-key
VITE_CESIUM_TOKEN=your-cesium-ion-token
```

Всі інші значення мають розумні defaults і можуть залишатись без змін для локальної розробки.

### 2. Старт

```bash
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend API docs: `http://localhost:8000/docs`

### 3. Зупинка

```bash
docker compose down
```

---

## Локальний запуск (без Docker)

### Вимоги

```bash
sudo apt-get update
sudo apt-get install python3-dev cmake build-essential
```

Рекомендується Python 3.12+.

### Збірка нативного модуля

```bash
cd backend/src/native
cmake -S . -B build
cmake --build build
mv build/flight_parser*.so .
cd ../../..
```

### Встановлення Python залежностей

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Налаштування Backend

```bash
cp backend/.env.example backend/.env
# встановіть GEMINI_API_KEY в backend/.env
```

### Запуск Backend

```bash
cd backend/src
python main.py
```

### Встановлення Frontend залежностей

```bash
cd frontend
npm install
```

### Налаштування Frontend

Створіть `.env` файл в `frontend/`:

```env
VITE_CESIUM_TOKEN=your-cesium-ion-token
VITE_API_URL=http://localhost:8000
```

### Запуск Frontend

```bash
npm run dev
```

Відкрийте:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

---

## Backend Architecture

### Overview

```
backend/src/
├── main.py                  — FastAPI app, routing, CORS, uvicorn entrypoint
├── core/
│   └── config.py            — Settings (pydantic-settings, reads .env)
├── api/
│   ├── router.py            — HTTP endpoints: upload, analyze, ai-summary, log browser
│   └── ws.py                — WebSocket endpoint: /api/ws/chat (streaming AI chat)
├── services/
│   ├── flight_parser.py     — Thin Python wrapper over the native C++ module
│   └── flight_analysis.py   — Calls native analysis and sanitizes the result
└── native/
    └── main.cpp             — C++ parser and analysis engine (pybind11)
```

### Native C++ Module

Важка робота — бінарний парсинг, математика координат, фільтрація Калмана — виконується в C++ і експортується в Python через [pybind11](https://github.com/pybind/pybind11).

`flight_parser.py` додає `backend/src/native/` до `sys.path` та імпортує скомпільований `.so` безпосередньо:

```python
import flight_parser  # flight_parser.cpython-*.so

flight_parser.parse_ardupilot_bin(data)   # raw message-type dict
flight_parser.analyze_flight_log(data)    # full analysis payload ENU, Global and speed series
```

`analyze_flight_log` повертає словник з наступними ключами верхнього рівня:

| Ключ              | Опис                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `summary`         | GPS/IMU назви повідомлень, кількість точок, попередження, аномалії        |
| `sampling`        | Приблизна частота семплування GPS та IMU (Hz)                             |
| `metrics`         | Тривалість, відстань, макс набір висоти, макс швидкість, макс прискорення |
| `trajectory`      | `enu` (ENU точки + початок), `global` (lat/lon/alt точки), `speed_series` |
| `series`          | KF-фьюжена висота, IMU швидкість, IMU прискорення часові серії            |
| `parameters`      | Всі PARM записи з логу (`name`, `value`)                                  |
| `flight_modes`    | MODE перемикання з timestamp та назвою режиму                             |
| `errors`          | ERR записи з timestamp, підсистемою та кодом помилки                      |
| `battery`         | BAT/CURR напруга, струм та спожиті mAh в часі                             |
| `gps_quality`     | Per-sample тип фіксації, HDOP, кількість супутників                       |
| `attitude`        | Roll/pitch/yaw часові серії з ATT/AHR2                                    |
| `ai_context_toon` | Компактне текстове представлення вищезазначеного, надсилається AI         |
| `raw_preview`     | Список всіх типів повідомлень присутніх в логу                            |

Результат санітизується за допомогою `core.utils.sanitize()` перед поверненням, що замінює `NaN` та `Inf` float значення на `None` для запобігання помилкам JSON серіалізації.

### AI Integration

Backend використовує **Google Gemini API** (`google-genai` SDK) з streaming responses. Модель та API ключ налаштовуються через змінні оточення:

```env
GEMINI_MODEL=gemini-2.0-flash
GEMINI_API_KEY=...
```

Є дві точки входу AI:

**`POST /api/ai-summary`** — одноразове резюме, стрімить plain text назад через `StreamingResponse`.

**`WebSocket /api/ws/chat`** — багато-оборотна чат сесія. Клієнт надсилає JSON повідомлення:

```json
// Перше повідомлення — встановлює контекст
{ "type": "init", "filename": "...", "ai_context_toon": "...", "question": "..." }

// Подальші питання — повторно використовують існуючий контекст
{ "type": "question", "question": "..." }
```

Сервер стрімить назад:

```json
{ "type": "start" }
{ "type": "chunk", "text": "..." }   // повторюється
{ "type": "done" }
```

Історія розмови зберігається в памʼяті протягом WebSocket зʼєднання. При кожному `init` повідомленні історія скидається.

AI отримує `ai_context_toon` — компактний, відступний текстовий формат згенерований `build_ai_context_toon()` в C++. Він включає агреговану статистику та семплові точки даних (не повні сирі серії), підтримуючи розмір промпта керованим, водночас даючи моделі достатньо деталей для точного аналізу.

Обидві точки входу повторюють до 3 разів при Gemini `503 / UNAVAILABLE` помилках з 1.5× backoff.

---

## Main API

### `POST /api/analyze`

Приймає завантаження `.BIN` файлу та повертає:

- `sampling` — приблизна частота семплування GPS / IMU
- `metrics` — значення зведення місії
- `trajectory` — початок, ENU точки та серія швидкості
- `series` — висота, IMU швидкість, IMU прискорення
- `summary` — попередження та виявлені аномалії

### `POST /api/upload`

Низькорівнева точка входу парсера, яка повертає доступні типи повідомлень та зберігає parsed дані для перегляду.

### `GET /api/logs/{filename}/messages`

Перегляд пагінованих даних повідомлень після завантаження.

### `WebSocket /api/ws/chat`

Streaming AI чат для аналізу польоту.

---

## Математичні нотатки

### Відстань

Загальна відстань місії розраховується з пар GPS широти/довготи за формулою haversine, яка більш підходяща для геодезичних координат, ніж плоска відстань.

### Швидкість з IMU

Швидкість реконструюється з прискорення IMU за допомогою трапецієподібної інтеграції:

```text
v_i = v_(i-1) + 0.5 * (a_(i-1) + a_i) * dt
```

Це чисельно більш стабільно, ніж наївна прямокутна інтеграція, але швидкість отримана з IMU все ще дрейфує з часом, оскільки зміщення акселерометра та помилки орієнтації накопичуються.

### WGS-84 → ENU

Конвеєр:

1. Геодезичні координати `(lat, lon, alt)` на WGS-84
2. Конвертація в ECEF
3. Обертання в локальну ENU раму відносно точки зльоту

Це дає координати траєкторії в метрах від початкової точки, що зручно для кінематичного аналізу та локальної 3D інтерпретації.

---

## Scripts

### Frontend

```bash
npm run dev      # Розробка з HMR
npm run build    # Production build (TypeScript перевірка + Vite build)
npm run preview  # Локальний preview production build
npm run lint     # ESLint перевірка
```

### Backend

```bash
python main.py   # Запуск FastAPI сервера (uvicorn)
```

---

## Deployment

Проєкт налаштований для deployment на Netlify (frontend) та будь-якому сервісі що підтримує Docker (backend)

[![Netlify Status](https://api.netlify.com/api/v1/badges/7f414f34-9052-47c0-8428-2f05eb8ce4f7/deploy-status)](https://app.netlify.com/projects/best-type-shit/deploys)

---

## License

MIT
