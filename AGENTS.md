# AGENTS.md

1. 可以使用本机代理7897 访问无法直连的网站
2. 本项目的docs 目录是扩展的一些教程文件，可以选择性阅读
3. 每次改动结束后都提交并推送到远端仓库 main 分支
4. 版本号规则：扩展内容有变动时（kirito扩展/ 目录下的代码、素材、配置），必须同步升级两处版本号且保持一致：kirito扩展/extension.js 的 package.version 与 kirito扩展/info.json 的 version；纯文档改动（docs/、README.md、AGENTS.md 等）不需要升级版本号
5. 修改完成后如需测试,不要直接拉起游戏,让用户测试
6. 每次提交扩展更新（kirito扩展/ 有变动）前，先运行 `node sync-config.mjs` 把PC端游戏启动时自动导出的配置快照（resources/app/config-sync.json）拾取进 kirito扩展/config-sync.json 一并提交——手机端「同步配置（以PC端为准）」依赖这份快照
