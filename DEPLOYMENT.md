# cv-composer 部署文档

cv-composer 是**纯前端静态应用**（Vite + React + TS），没有后端服务、没有数据库，也不读取服务端环境变量。当前部署方式是 **GitHub Actions 自动构建 → GitHub Pages 静态托管**，推送 `main` 分支即触发发布。

线上地址：`https://ffhw-code.github.io/cv-composer/`

---

## 一、架构与运行前提

- 构建产物：`npm run build` 生成的 `dist/`（纯静态文件，无服务端渲染）。
- 无环境变量、无 CI secrets、无后端密钥需要配置。
- AI 功能的模型 API Key 由**每个用户在自己浏览器里填写**，只存 `sessionStorage`（关闭标签页即清空），不会进入代码库或 CI。
- 用户简历通过浏览器 `localStorage` 自动保存；升级或回滚部署**不会影响**任何用户数据（数据都在访客本机）。
- 依赖 Node.js。CI 固定使用 Node 22；本地开发建议保持一致。

## 二、首次部署（一次性设置）

1. **确保能构建**：在本地先验证（推送前必须通过）：

   ```bash
   npm ci
   npm test
   npm run lint
   npm run build
   ```

2. **确认 `base` 路径与仓库名一致**：工作流里的构建命令固定了站点子路径：

   - `.github/workflows/deploy.yml` 中执行 `npm run build -- --base=/cv-composer/`
   - `/cv-composer/` 必须与仓库名 `cv-composer` 一致。若仓库改名或 fork，请同步修改该路径。

3. **开启 GitHub Pages**：仓库 `Settings → Pages → Build and deployment → Source` 选择 **`GitHub Actions`**（不要选分支部署，否则会与工作流冲突）。

4. 完成以上设置后，向 `main` 推送即可触发 `.github/workflows/deploy.yml`：`npm ci` → `npm run build` → 上传 `dist/` → 发布。

5. 在 `Actions` 页确认 `Deploy to GitHub Pages` 运行成功，然后访问线上地址。

## 三、日常更新

```bash
git add .
git commit -m "feat: 说明这次改了什么"
git push origin main
```

推送后自动完成"构建 + 发布"。同一时间只有一个发布流程在跑（工作流配置了并发互斥），新推送会自动取消进行中的旧流程。

发布后验证：

- `Actions` 页面该次运行全绿；
- 打开线上地址确认功能正常（建议强制刷新一次，避免浏览器缓存旧资源）。

## 四、回滚

部署跟随 `main` 分支，回滚的本质是"让线上回到某个旧版本"。两种方式任选：

**方式 A（推荐，保留提交历史）**

```bash
git revert <有问题的提交SHA> --no-edit
git push origin main        # 自动触发反向版本部署
```

**方式 B（快速回到某个旧版本，不产生新提交）**

1. 进入仓库 `Actions` 页，找到该旧版本对应的 `Deploy to GitHub Pages` 运行记录；
2. 点击该次运行 → `Re-run all jobs`；
3. 等它跑完，线上即恢复为该提交的内容。

> 不建议对 `main` 做 `git reset` 后强推：会改写历史，且需要临时关闭分支保护，容易出事故。

回滚只影响线上代码，不影响任何用户浏览器里的简历数据。

## 五、环境变量与敏感信息

| 项目 | 说明 |
|---|---|
| 服务端环境变量 | 无（纯前端，构建期不需要任何变量） |
| CI secrets | 无（工作流只读仓库并发布 Pages，不需要密钥） |
| 模型 API Key | 运行时由用户填入，存浏览器 `sessionStorage`，不入库、不进 CI |
| 自动化保存 | 存访客浏览器 `localStorage`，key 为 `cv-composer:resume:autosave:v1` |

如果未来引入后端代理或用户体系，再在本文档补充对应的环境变量清单。

## 六、健康检查与监控

- GitHub Pages 不提供应用级健康检查端点（静态站点没有服务器可响应 `/health`）。
- 可以配置第三方 uptime 监控（如 UptimeRobot 免费版），监控 `https://ffhw-code.github.io/cv-composer/` 是否返回 HTTP 200。
- 注意：这类监控只能证明"页面可访问"，不能证明编辑/导出等业务功能正常；业务级回归仍依赖 `npm test` 与手动验收。

## 七、常见问题

- **推送后 Pages 没更新**：检查 `Actions` 运行是否失败；确认 `Settings → Pages → Source` 是 `GitHub Actions`。
- **页面 404 或资源路径错误**：多为仓库改名/迁移后 `--base` 路径没同步，见"首次部署"第 2 步。
- **AI 功能不可用**：需用户在界面右上角设置里填写模型 API Key；另外浏览器会直连模型服务商，要求该服务商允许浏览器跨域请求。
- **换电脑/清浏览器数据后简历没了**：这是本地自动保存的正常行为；长期备份请用工具栏「保存」导出 JSON 文件。
- **构建本地通过、CI 失败**：优先确认 `npm ci`（严格按锁文件安装）而非 `npm install`，并核对 Node 版本是否与 CI 一致（22）。

## 八、维护清单（发布前过一遍）

- [ ] `npm ci && npm test && npm run lint && npm run build` 全部通过
- [ ] 若涉及部署配置改动，检查 `.github/workflows/deploy.yml` 与本文档同步
- [ ] 仓库若改名，检查 `--base=/cv-composer/` 路径
- [ ] 重要功能变更后，手动在线上点一遍：编辑、导出 PDF/JSON、刷新恢复自动保存
