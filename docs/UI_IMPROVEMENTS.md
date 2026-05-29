# Идеи по улучшению UI плагина AgentStack (VS Code)

Краткий список направлений. Каждое можно делать отдельно (Decomposition). Без лишней сложности (Elegant Minimalism).

---

## Реализовано (0.4.40–0.4.41)

- **Иконки в дереве** — ThemeIcon у всех нод (Status, Projects, Project detail, Summary, Data, Users, User, Settings, Documentation, Capabilities, Refresh, Create project, Unselect, ссылки).
- **Create project в дереве** — под Projects всегда Refresh + Create project; при пустом списке — «No projects — Create project» с командой создания.
- **Контекстное меню** — правый клик: Projects (Refresh, Create project); проект (Copy project ID, Show project data in editor); Status (Set API key, Show API key & project info, Create project); Project detail (Unselect, Refresh); Settings (Open/Save project settings).
- **Пустое состояние и ошибки** — при ошибке загрузки нода с командой Retry (`refreshEcosystem`); при 0 проектов — одна нода «No projects — Create project».
- **Название проекта в статус-баре** — показывается «AgentStack (ProjectName)» или «AgentStack (project id)»; `selectedProjectName` в globalState.
- **Documentation развёрнута по умолчанию** — ссылки видны без раскрытия.
- **Documentation без дублирования** — 3 ссылки (MCP Server Capabilities, 8DNA & Key-Value API, Plugins index); доменные ярлыки только в Project detail → Capabilities (Buffs, Payments, Rules, 8DNA). Узел «Same MCP» объединён с Documentation.

---

## Возможные следующие шаги

### Высокий эффект / малая работа

- **Контекстное меню для User** — правый клик по пользователю: «Show user in editor», «Copy user ID» (в буфер). Команда `agentstack-mcp.copyUserId` с аргументами из ноды.
- **Подсказка статус-бара** — когда выбран проект: «AgentStack (ProjectName). Click: API key & info. Copy project ID: right-click project in tree.»

### Средний эффект

- **Горячая клавиша для Refresh** — в `package.json` привязать `agentstack-mcp.refreshEcosystem` к сочетанию (например `workbench.view.extension.agentstack-mcp` уже фокус на панели; отдельный keybinding для Refresh в контексте вида).
- **Ссылка MCP Quick start в Documentation** — четвёртый пункт «MCP Quick start» → `docs/MCP_QUICKSTART.md` в репо AgentStack (если документ там есть), для быстрого старта из плагина.

### По желанию

- **Capabilities — якоря в доку** — если в MCP_CAPABILITY_MATRIX.md есть заголовки с id (например `#buffs`), открывать ссылку с якорем для Buffs/Payments и т.д., чтобы пользователь сразу попадал в нужный раздел.
- **Краткий onboarding** — при первом запуске (нет API key) показать один раз информационное сообщение: «AgentStack: Set API key or run Create project and get API key» с кнопкой «Create project».

---

## Приоритет для внедрения (из «следующих шагов»)

1. **Copy user ID** в контекстном меню User — привычное действие, малый объём кода.
2. **Улучшенный tooltip статус-бара** при выбранном проекте — напомнить про Copy project ID через дерево.
3. **MCP Quick start** в Documentation — один пункт, если ссылка на репо актуальна.
