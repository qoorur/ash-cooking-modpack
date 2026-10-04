# Ash Cooking Modpack

> Minecraft **1.21.1** · **NeoForge 21.1.253** 整合包配置仓库

本仓库保存整合包的「源文件」——配置文件、KubeJS 脚本、资源包与模组清单，
**不包含** mod 的 `.jar`、存档、日志、缓存等运行时数据。

---

## 📦 仓库内容
| 目录 / 文件 | 说明 |
|---|---|
| `config/` | 各模组的配置文件 |
| `defaultconfigs/` | 新世界默认配置模板 |
| `kubejs/` | KubeJS 脚本（startup / server / client） |
| `patchouli_books/` | 帕秋莉手册自定义内容 |
| `resourcepacks/` | 资源包 |
| `options.txt` | 游戏选项设置 |
| `mods.txt` | 模组清单（按分类列出文件名） |
| `.gitignore` | 已排除缓存 / 日志 / 存档 / jar 等 |

---
## 🚀 使用说明

1. 安装 **NeoForge 21.1.253** for Minecraft **1.21.1**（用 PCL 等启动器创建对应版本）
2. 参照 `mods.txt` 下载对应模组，放入 `mods/` 目录
3. 将本仓库的 `config/`、`kubejs/`、`defaultconfigs/`、`patchouli_books/`、`resourcepacks/`、`options.txt` 复制到游戏 instance 目录（覆盖同名文件）

---

## 🔄 更新与上传流程

每次改动配置、KubeJS 或模组清单后，按以下步骤同步到 GitHub：

### 第 1 步：把改动同步到本仓库

如果是在游戏目录里改的配置，先把变更复制到本仓库对应位置，例如：

