# 火山引擎迁移

迁移分支：`deploy/volcengine`。原部署继续使用 `main`，不修改原站数据库。

## 当前状态

- 已部署上线（2026-09-08），地址： https://shohrjm9he9hn89g414ej.apigateway-cn-beijing.volceapi.com/
- 应用 `haiming-life-atlas` / `c04779521132`，函数 `p309g2qq`，北京，`native-node20/v1`，500m CPU / 1024 MB，弹性实例 0–3。
- 网关 `aerocourt-gwnuom`，人生地图专用路由 `rdaftumnsbphss8c6e6o0`；路径 `/`，已补齐 PATCH，支持记录编辑。未改动其他应用路由。
- 私有桶 `life-atlas-prod-2131120886`：北京、标准存储、单 AZ，创建时配置 SSE-TOS AES256。
- 用户已批准创建 `life-atlas-app`；短信验证完成，账户仅编程访问、无控制台密码。自定义策略 `LifeAtlasStorageOnly` 仅授予 `tos:GetObject`、`tos:PutObject`、`tos:DeleteObject`，资源为 `trn:tos:::life-atlas-prod-2131120886/life-atlas/*`。
- 新建密钥及私人登录配置已写入服务端环境变量，本地只保存在 Git 忽略的 `private-deploy/`。私人访问口令位于同目录的 `人生地图登录信息.txt`。
- 真实 TOS 检查通过：上传、读取、流式读取、禁止重复初始写入、拒绝旧 ETag 覆盖、删除清理。
- 线上完整验收通过：私人登录、匿名 API/照片访问拒绝、旅行记录新增/编辑/重读、PNG 上传/下载字节一致、删除记录并清理照片。所有验收测试记录已移除。
- 已通过生产构建、TypeScript、ESLint、31 项原有界面测试、7 项运行时测试、HTTP 登录保护测试；独立部署目录在 Node.js 20 下连接真实 TOS 读取通过。
- 已修复生产打包对 CommonJS/WASM 的兼容问题，SQLite 与 TOS SDK 作为服务端外部依赖随产物完整复制。WASM 由部署模块自身定位，避免本机绝对路径；SDK 流式错误转为安全错误，不保留带签名的请求对象。
- 通过 Sites 数据库接口核对原站 8 张用户表全部为空，包括旅行记录、照片索引、人生档案、目标和主线；无需迁移已有记录。原站数据库未修改。
- 新地址已在浏览器打开并确认登录页。iPhone 所在网络仍需用户在 Safari 实机验收；本机测试不能替代用户手机的网络情况。

## 构建与验证

2026-09-08 地点修复：经历编辑器增加具体地点输入和显式搜索；选择结果同步更新名称与坐标，手填名称保留当前选点，两者均支持草稿恢复。反向查询精度从区县改为建筑级，保留原始选点坐标；移除公里级缓存复用，在线结果缓存一天、离线回退仅 15 秒，并合并同点并发查询。离线城市索引不再将“北京＋店名”等详细查询误匹配成城市中心。

验证：原有 31 项测试及新增 9 项地点测试通过，TypeScript、ESLint 和生产构建通过；真实线上记录新增、修改详细地点和坐标、重新读取、照片上传下载通过，临时验收记录与照片已清理。更新前已将数据库快照保存在 Git 忽略的 `private-deploy/`。原有用户记录不自动猜测分店或修改坐标。

自动详细地址：线上实例实测原 Nominatim 连接失败（ECONNRESET），已准备 Photon 公共服务适配，须经用户明确同意将选点坐标发送到 Photon 后，设置服务端 `ATLAS_PHOTON_ENABLED=true` 才会启用。未授权时默认仅使用原 Nominatim；启用后 Photon 优先、原接口备用，两者都失败才退回城市索引。Photon 使用公开示例坐标从部署实例实测可达且能返回中文区县、街道、门牌及建筑信息。用户记录的具体响应仍待授权后验证，不能据此承诺所有位置都有详细信息。反向结果标明“附近”，保留用户选点的 WGS84 坐标；搜索结果使用地点自身坐标。旧经历的名称与离线城市名一致时，打开卡片自动补充附近地址，点击编辑可带入并确认保存。手填店名不被自动覆盖，查看卡片不会改写数据库。

当前限制：公共地图数据覆盖和服务可用性没有保证；附近建筑不是用户实际到店的证明，具体分店仍须自行确认。按个人项目低频使用、缓存和合并同点并发查询，保留 OpenStreetMap 署名。服务用法与使用边界见 [Photon 官方说明](https://github.com/komoot/photon) 与 [API 文档](https://github.com/komoot/photon/blob/master/docs/api-v1.md)。新增自动补全、手填地点保护、双接口回退验证，合计 45 项界面与地址测试通过，包含未授权时绝不请求 Photon 的检查。

发布切换时额外验证了登录表单：页面脚本尚未就绪也通过 POST 提交，服务端接受普通表单并返回 303，避免口令进入 URL。独立 HTTP 登录与鉴权测试通过。

```sh
npm run build:volcengine
npm run test:volcengine
node --test tests/volcengine-http.test.mjs
npx tsc --noEmit
npm run lint
```

veFaaS 必须按动态应用部署：产物 `dist/standalone`，启动命令 `node server.js`，监听端口 8000（通过 `PORT=8000` 指定）。不能接受框架检测器给出的静态 Caddy 配置。

## 必需的服务器环境变量

- `ATLAS_TOS_ACCESS_KEY_ID` / `ATLAS_TOS_SECRET_ACCESS_KEY`：仅允许本应用读写专用桶内 `life-atlas/` 前缀的 IAM 访问密钥。不要使用部署 SSO 临时凭据，也不要放入前端或提交到 Git。
- `ATLAS_TOS_BUCKET`：专用私有桶名。
- `ATLAS_TOS_REGION`：`cn-beijing`。
- `ATLAS_TOS_ENDPOINT`：`tos-cn-beijing.volces.com`。
- `LIFE_ATLAS_PASSWORD_HASH`：高熵随机访问口令的 SHA-256 十六进制摘要。
- `LIFE_ATLAS_SESSION_SECRET`：至少 32 字符的独立随机密钥。
- `LIFE_ATLAS_PUBLIC_ORIGIN`：最终 HTTPS 访问地址的 origin。
- `LIFE_ATLAS_OWNER_KEY`：默认 `user_personal`；如果迁移旧记录，必须明确处理所有实体的所有者前缀。
- `PORT=8000`、`HOST=0.0.0.0`、`NODE_ENV=production`。

不需要为本次部署填写 AI 服务密钥。口令和部署密钥只存入被 Git 忽略的 `private-deploy/` 或平台环境变量。

## 数据持久化边界

此适配面向小规模个人日记。每次数据库操作读取 TOS 中的 SQLite 快照；写入使用 ETag 条件覆盖，首次写入禁止覆盖。只有 TOS 确认提交后才向客户端返回成功。条件冲突重新读取并重做 SQL，网络或权限错误直接报错，不能用本地临时文件冒充保存成功。

SQLite 快照上限为 16 MiB，媒体单独存储；这不是多人高并发数据库方案。增长超过该范围时应迁移到专用数据库。已验证真实 TOS 拒绝旧 ETag 写入，以及不同 Node 进程和云端部署的读取。两台真实移动设备同时编辑仍需实机验收。

生产使用的快照不落入函数临时目录。应在迁移与每次重要更新前备份数据库及媒体；当前实现不自动清理或备份历史对象。

本地验证不能证明 iPhone 所在网络可访问。请在手机 Safari 打开新地址验收。
