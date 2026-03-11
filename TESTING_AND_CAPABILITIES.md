# Проверка расширения AgentStack MCP и его возможности

## Как проверить, что расширение работает

### 1. Установка расширения

**Вариант A: из Marketplace (после публикации)**  
- VS Code → Extensions (Ctrl+Shift+X) → найти "AgentStack MCP" → Install.

**Вариант B: локально (до публикации)**  
- Открыть папку `provided_plugins/vscode-plugin` в VS Code.  
- Запустить **Run → Start Debugging** (F5) — откроется новое окно (Extension Development Host) с загруженным расширением.  
- Либо собрать VSIX: `npm run compile` и `npx @vscode/vsce package` (если установлен vsce), затем установить полученный .vsix через **Extensions → ... → Install from VSIX**.

### 2. Подключение MCP (API key)

Расширение **само регистрирует** MCP-сервер AgentStack. Нужен только API key.

1. **Получить API key**  
   - Через curl (анонимный проект):
     ```bash
     curl -X POST https://agentstack.tech/mcp/tools/projects.create_project_anonymous \
       -H "Content-Type: application/json" \
       -d '{"tool": "projects.create_project_anonymous", "params": {"name": "Test"}}'
     ```
   - Из ответа взять `project_api_key` или `user_api_key`.

2. **Ввести ключ в VS Code**  
   - При первом использовании MCP (например, при открытии чата с агентом) VS Code запросит API key — введите его; он сохранится в SecretStorage.  
   - Либо выполните команду **AgentStack: Set API Key** (Ctrl+Shift+P → "AgentStack: Set API Key").

3. **Проверить список MCP-серверов**  
   - Command Palette → **MCP: List Servers** (или через Extensions view) — должен быть сервер **AgentStack**.

Подробно: [MCP_QUICKSTART.md](MCP_QUICKSTART.md).

### 3. Проверка в чате / агенте

В чате VS Code (например, с Copilot в режиме агента) попросите:

- "Создай проект в AgentStack с названием Test Project"  
  → Ожидается вызов `projects.create_project_anonymous` (или `projects.create_project` при наличии авторизации).
- "Покажи список моих проектов в AgentStack"  
  → Ожидается `projects.get_projects`.
- "Дай статистику по проекту &lt;project_id&gt;"  
  → Ожидается `projects.get_stats`.

Если агент вызывает MCP tools и возвращает осмысленный ответ — расширение и MCP работают.

### 4. Типичные проблемы

| Симптом | Что проверить |
|--------|----------------|
| MCP-сервер не появляется | Расширение установлено и включено; перезапустить VS Code. |
| Запрос API key не появляется | Вызвать **AgentStack: Set API Key** вручную или открыть чат с агентом, который использует tools. |
| 401 / 403 при вызове | Ключ валидный; для части операций нужна подписка. |
| "Tool not found" | Имя tool совпадает с документацией (например, `projects.create_project_anonymous`). Список: [MCP Server Capabilities](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md). |

---

## Возможности расширения

### Что входит в расширение

| Компонент | Назначение |
|-----------|------------|
| **Манифест** (`package.json`) | Имя, описание, MCP Server Definition Provider, команды Set API Key / Create project / Show API key, настройки apiKey, enableChatParticipant, requestTimeoutSeconds. |
| **MCP provider** | Регистрирует HTTP MCP-сервер AgentStack; при старте запрашивает API key (если нет в SecretStorage) и подставляет его в заголовок `X-API-Key`. |
| **Команда Set API Key** | Смена сохранённого API key и обновление списка MCP-серверов. |
| **Документация** | README, MCP_QUICKSTART, этот файл. |

### Возможности через MCP (после ввода API key)

Расширение только регистрирует MCP-сервер; запросы к бэкенду выполняет **AgentStack MCP**. После ввода API key агент получает доступ к инструментам, например:

- **Проекты:** создание (в т.ч. анонимное), список, детали, обновление, удаление, статистика, пользователи, настройки, активность, API-ключи.
- **Логика и правила:** создание/обновление/удаление правил, список, выполнение, процессоры, команды.
- **Баффы:** создание, применение, продление, откат, отмена, список активных, эффективные лимиты.
- **Платежи:** создание, статус, возврат, список транзакций, баланс.
- **Auth:** быстрый вход, создание пользователя, назначение роли, профиль.
- **Планировщик:** создание/отмена/получение/список задач и др.
- **Аналитика:** использование, метрики.
- **API-ключи, Webhooks, уведомления, кошельки** — по мере реализации на бэкенде и в MCP.

Точный список инструментов и параметры: [MCP_SERVER_CAPABILITIES](https://github.com/agentstacktech/AgentStack/blob/master/docs/MCP_SERVER_CAPABILITIES.md) в репозитории AgentStack.

### Итог

- **Проверка:** установить расширение → при первом использовании ввести API key (или **AgentStack: Set API Key**) → в чате попросить создать/показать проекты и проверить вызовы MCP.
- **Возможности:** доступ к 60+ MCP-инструментам AgentStack (проекты, логика, баффы, платежи, auth, планировщик, аналитика и др.) без ручной настройки mcp.json.
