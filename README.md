# 珈琲の記録帖 · 咖啡小记录 · A Little Coffee Note

基于 Node.js 22（内置原生 SQLite）+ Docker 构建的极简主义咖啡品鉴与 SCA 杯测记录服务。支持日常单杯三温区记录、多杯平行 Cupping、1–10 分国际标准感官与回购推荐度评分、多用户邀请制与社区品尝交流（Home）、日/中/英三语切换以及 Cloudflare Tunnel 内网穿透。

---

## 核心功能

1. **三大主栏架构**
   - **ホーム / Home（品尝交流）**：汇集自己与朋友选择公开分享的「每日咖啡」与「Cupping」记录。支持未登录访客只读浏览（未登录状态下发表人用户名自动使用 `*` 脱敏隐藏，登录后显示完整昵称并可留言互动）。
   - **毎日の記録 / 每日咖啡 / Daily**：日常喝咖啡 30 秒单页记录。支持最近喝过的豆子一键回填、10 种常见冲泡器具、研磨粗细与粉水比预设、高温（70°C）/ 中温（50°C）/ 室温（35°C）三阶段 1–10 分感官打分、萃取微调建议，以及 **1–10 分推荐度（是否值得回购）**。
   - **カッピング / Cupping**：遵循 SCA 标准的 3–5 杯平行盲测/明测工作流（含 4 分钟注水倒计时提示音、干香/湿香/三温区评分、多杯同屏雷达对比）。
2. **极简纸质手账美学 & 日/中/英三语**
   - 摒弃多余图标与视觉噪音，默认日语（`日本語`），右上角可随时切换 `日本語 | 中文 | EN`。
   - 每日咖啡与 Cupping 内均按需内嵌可折叠的 **1–10 分制感官评判参考与 SCA 标准流程指南**。
3. **独立管理后台路由（`/admin`）**
   - 顶部导航栏不显示管理入口；管理员直接访问 `/admin` 或 `/#admin` 即可生成朋友注册邀请码、管理用户与下载 SQLite 一致性备份。
4. **附带单文件离线版**
   - 仓库根目录附带 `cupping_standalone.html`，无需服务器，发给朋友双击即可在本地浏览器离线使用。

---

## 默认管理员账号

容器首次启动会自动初始化管理员账号：
- **默认登录名**：`admin`
- **默认密码**：`ineedacupofcoffee`
- **管理后台地址**：`http://服务器IP:3000/admin`（或绑定域名后的 `https://你的域名/admin`）

> 建议部署后登录并在右上角「设置（設定）」中修改管理员密码。

---

## Docker Compose 部署方案（含 Cloudflare Tunnel 接入）

### 方案一：仅在局域网内运行（无需域名 / Tunnel）

在 Debian NAS 或本地机器上执行：

```bash
git clone https://github.com/yooshinn2024/coffee_cupping.git
cd coffee_cupping
docker compose up -d --build
```

浏览器直接访问：`http://你的NAS内网IP:3000`

---

### 方案二：通过 Cloudflare Tunnel 接入公网（推荐 NAS 部署）

`docker-compose.yml` 已内置 `cloudflared` 容器编排，与 `app` 处于同一 Docker 内部网络，**无需在路由器上做端口映射，也无需额外配置 Nginx 反代**。

#### 第一步：在 Cloudflare Zero Trust 获取 Tunnel Token
1. 登录 [Cloudflare Zero Trust 控制台](https://one.dash.cloudflare.com/)。
2. 进入 **Networks** $\rightarrow$ **Tunnels** $\rightarrow$ 点击 **Create a tunnel**，选择 **Cloudflared**，命名为 `coffee-note`。
3. 在安装命令页面，复制 `--token` 后面那一长串以 `eyJ...` 开头的字符串（这就是你的 `TUNNEL_TOKEN`）。
4. 进入下一步 **Public Hostname（公共主机名）** 配置：
   - **Subdomain（子域名）**：例如 `coffee`
   - **Domain（域名）**：选择你在 Cloudflare 托管的域名（如 `example.com`）
   - **Service Type（服务类型）**：选择 **`HTTP`**
   - **URL**：填写 **`app:3000`**（注意：因为 `cloudflared` 和 `app` 在同一个 `docker-compose.yml` 网络里，这里直接填容器服务名 `app:3000` 最稳定！）

#### 第二步：在 Debian NAS 上配置 `.env` 并启动
```bash
git clone https://github.com/yooshinn2024/coffee_cupping.git
cd coffee_cupping
cp .env.example .env
nano .env
```

在 `.env` 中填入你的 Token：
```ini
TUNNEL_TOKEN=eyJhIjoi...粘贴你的Cloudflare_Tunnel_Token...
COMPOSE_PROFILES=tunnel

# 可选：修改默认管理员初始密码
ADMIN_USER=admin
ADMIN_PASS=ineedacupofcoffee

# 可选：NAS 文件属主 UID/GID（在 Debian 终端输入 id 查看，通常为 1000）
PUID=1000
PGID=1000
TZ=Asia/Tokyo
```

保存后一行命令启动主服务与 Tunnel 隧道：
```bash
docker compose up -d --build
```

查看运行状态：
```bash
docker compose ps
```
此时：
- 你在家里内网可通过 `http://NAS内网IP:3000` 访问；
- 你和朋友在外网可通过 `https://coffee.你的域名.com` 直接 HTTPS 安全访问！
- 登录管理员后访问 `https://coffee.你的域名.com/admin` 即可点击「生成邀请码」，把注册链接发给朋友。
