# Modpack - 1.21.1 NeoForge 21.1.253

Minecraft 整合包配置文件仓库。

## 版本信息

- **Minecraft**: 1.21.1
- **Mod Loader**: NeoForge 21.1.253
- **模组数量**: 见 `mods.txt`

## 仓库内容

本仓库只包含整合包的「源文件」，**不包含** mods 的 `.jar` 文件、存档、日志、缓存等运行时数据。

| 目录 / 文件 | 说明 |
|---|---|
| `config/` | 各模块的配置文件 |
| `defaultconfigs/` | 新世界默认配置模板 |
| `kubejs/` | KubeJS 脚本 |
| `patchouli_books/` | 帕秋莉手册自定义内容 |
| `resourcepacks/` | 资源包 |
| `options.txt` | 游戏选项设置 |
| `mods.txt` | 模组清单（文件名列表） |

## 使用说明

1. 安装 NeoForge 21.1.253 for Minecraft 1.21.1
2. 依据 `mods.txt` 下载对应模组放入 `mods/` 目录
3. 将本仓库的 `config`、`kubejs`、`defaultconfigs` 等复制到游戏 instance 目录

