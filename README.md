# 咖啡杯测记录网站 - 服务器版 (Coffee Cupping Note)

基于 Node.js 22 (内置原生 SQLite) + Docker 构建的轻量级咖啡杯测记录服务。支持多用户、邀请码注册、数据隔离、品尝交流（社区分享与评论）、中/英/日多语言切换及 Cloudflare Tunnel 内网穿透。

---

## 🌟 核心特性

1. **中 / 英 / 日 三语言实时切换**
   - 顶部导航栏右侧常驻语言切换按钮：`日本語` | `中文` | `EN`。
   - 默认首选语言为**日语（日本語）**，点击即时切换，登录前与登录后均可切换。
2. **多用户与权限隔离**
   - 首次访问自动进入**管理员初始化**，设置管理员账号密码。
   - 管理员登录后可在「管理（Admin）」界面一键生成专属邀请码链接发给朋友。
   - 朋友凭邀请码注册独立账号，每个人杯测数据默认严格隔离。
3. **品尝交流（社区分享）**
   - 在每条杯测结果页，用户可自主选择是否「分享到品尝交流」。
   - 分享后所有人可在「品尝交流」板块查看雷达图与风味卡片，并可在下方留言互动交流。
4. **纯鼠标点击操作 & 完整杯测维度**
   - 支持 3–5 杯对比、干香/湿香/热70°C/温50°C/室温五阶段打分、4分钟注水倒计时与提示音、SVG六边形风味雷达图、温度风味演变柱状图。
5. **安全与云原生部署**
   - 支持通过 Cloudflare Tunnel 安全接入家庭 NAS / 内网服务器，只需填入 Token。
   - 自动定时备份 SQLite 数据库至 `data/backups/`（每日备份，保留14天）。
   - 自动根据 `PUID` / `PGID` 降权运行，避免 NAS 上 Docker root 导致文件权限锁死。

---

## 🚀 快速开始

### 1. 本地运行与体验 (Mac / PC)

进入项目目录后启动：

```bash
docker compose up -d
```

然后在浏览器打开：
👉 **http://localhost:3000**

#### 第一次访问流程：
1. 页面默认以**日语**呈现（右上角可随时一键切换为中文或英文）。
2. 因为是首次运行，页面会显示 **「初期設定：管理者アカウント作成」**（管理员初始化界面）。
3. 设定你喜欢的用户名（如 `admin`）和密码（6位以上）并点击提交。
4. 创建成功后即刻自动登录，顶栏会展现全部功能导航（`ホーム`、`比較`、`みんなの記録`、`ガイド`、`設定`、`管理`）。
5. 进入 **「管理」** 即可点击 **「＋ 招待コードを発行」** 生成邀请链接发给朋友注册。

---

### 2. 部署到家里 NAS / 内网 Debian

1. 将 `coffee-cupping-server` 整个文件夹复制到你的 NAS 或 Debian 服务器。
2. 进入目录并配置环境变量（如果需要外网访问）：
   ```bash
   cp .env.example .env
   ```
3. 编辑 `.env` 文件：
   ```ini
   # 1. 填入你在 Cloudflare Zero Trust 控制台创建的 Tunnel Token
   TUNNEL_TOKEN=eyJhIjoi...你获取的Token长字符串...

   # 2. 启用 tunnel 配置（保持该行生效即可随 app 一同启动 cloudflared）
   COMPOSE_PROFILES=tunnel

   # 3. 宿主文件权限（根据在服务器上执行 `id` 命令查得的 uid/gid 填写，默认通常为 1000）
   PUID=1000
   PGID=1000
   TZ=Asia/Tokyo
   ```
4. 启动服务：
   ```bash
   docker compose up -d
   ```
   - 内网可直接访问：`http://服务器局域网IP:3000`
   - 外网朋友可通过你 Cloudflare 绑定的域名直接访问。

---

## 📁 目录结构说明

```text
coffee-cupping-server/
├── data/                    # 数据持久化目录（自动生成）
│   ├── cupping.db           # SQLite 数据库主文件（包含用户、杯测记录、草稿、评论、邀请码）
│   └── backups/             # 自动每日数据库快照归档（保留14天）
├── public/                  # 前端静态静态资源
│   ├── index.html           # 页面 HTML 入口
│   ├── app.js               # 前端核心业务逻辑与界面渲染
│   ├── i18n.js              # 中、日、英完整国际化词条字典
│   └── style.css            # 响应式自适应样式
├── server/                  # 后端 API 服务
│   ├── common.js            # SQLite 表结构初始化、密码 scrypt 加密、权限降权逻辑
│   └── index.js             # 原生 Node.js 22 HTTP RESTful API 与静态文件服务
├── Dockerfile               # 轻量 Alpine Node.js 22 镜像定义
├── docker-compose.yml       # Docker Compose 编排定义（含健康检查与可选 Tunnel）
├── .env.example             # 环境变量配置模板
└── README.md                # 使用与部署手册
```

---

## 🛠️ 运维与常见操作

### 如何重置数据库从头开始？
如果想清空所有测试数据重新体验初始向导：
```bash
rm -f data/cupping.db* data/backups/*
docker compose restart
```
刷新浏览器即可重新进入初始管理员创建向导。

### 如何下载数据库备份？
- 管理员登录后，点击顶栏 **「管理」** -> **「⬇ DBファイルをダウンロード」**（下载数据库文件）即可下载当前一致性快照（基于 SQLite `VACUUM INTO` 生成，确保完整无损坏）。
