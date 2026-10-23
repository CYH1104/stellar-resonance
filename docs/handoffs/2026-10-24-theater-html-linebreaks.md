更新：按用户要求已撤销下述 HTML 换行显示选项，小剧场恢复使用 HTML 默认空白规则。

# 小剧场 HTML 换行保留

基于 3e7d472。用户反馈 JSON content 中的换行在 HTML 小剧场里显示为一整段。实际换行已存在，但 HTML 默认 white-space:normal 折叠。增加仅小剧场启用的 preserveLineBreaks 显示选项，经 StoryContent 传到 HTML 沙箱，默认 body 使用 pre-line；纯文本小剧场使用 pre-wrap。一般正文 HTML 渲染保持原行为，用户显式 white-space 样式仍优先，不全局替换字面反斜杠 n、不改原始存档／脚本／代码。

类型检查、HTML／小剧场／分块回归通过；生产构建在服务器部署时校验。未调用真实模型，未做实体手机视觉实测。已有小剧场刷新后按新样式显示，无需重新生成；若原内容明确写了 white-space:normal，或是双重转义的字面反斜杠 n，则需单独判断其模板含义。
