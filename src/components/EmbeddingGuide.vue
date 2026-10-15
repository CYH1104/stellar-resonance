<template><details id="embedding-guide" class="embedding-guide subsection" open>
  <summary>向量检索新手攻略 · 硅基流动免费方案</summary>
  <p>它把记忆转换为方便比较的数字，帮助找到意思相近的旧事；剧情、摘要仍由上方选择的文字接口生成。不启用也能使用关键词检索。</p>
  <h4>1. 注册账号，拿到 Key</h4>
  <ol>
    <li>打开 <a href="https://cloud.siliconflow.cn/" target="_blank" rel="noopener noreferrer">硅基流动控制台</a>，按页面提示使用手机短信或邮箱注册／登录。</li>
    <li>若平台要求认证，在官方“用户中心 → 实名认证”按提示完成。</li>
    <li>打开 <a href="https://cloud.siliconflow.cn/account/ak" target="_blank" rel="noopener noreferrer">API 密钥</a>，点击“新建 API 密钥”，描述可填“群星共振记忆”，创建后复制完整 Key。</li>
  </ol>
  <p class="muted">流程参考：<a href="https://docs.siliconflow.cn/docs/userguide/quickstart" target="_blank" rel="noopener noreferrer">官方快速上手</a>、<a href="https://docs.siliconflow.cn/docs/userguide/faqs/authentication" target="_blank" rel="noopener noreferrer">认证说明</a>。</p>
  <h4>2. 先选免费版 BGE-M3</h4>
  <div class="guide-table"><table><thead><tr><th>模型名称（完整填写）</th><th>核对时的价格</th><th>用途</th></tr></thead><tbody>
    <tr><td><code>BAAI/bge-m3</code></td><td>免费</td><td>建议先用它测试记忆检索</td></tr>
    <tr><td><code>BAAI/bge-large-zh-v1.5</code></td><td>免费</td><td>中文短文本备选</td></tr>
    <tr><td><code>BAAI/bge-large-en-v1.5</code></td><td>免费</td><td>英文短文本备选</td></tr>
  </tbody></table></div>
  <p>价格核对日期：2026-10-15，依据<a href="https://www.siliconflow.cn/pricing" target="_blank" rel="noopener noreferrer">官方价目表</a>。<code>Pro/BAAI/bge-m3</code> 是收费版本，不等同于上面的免费模型。免费模型也有限流；实际价格、权限和可用性以你账号里的模型详情为准。</p>
  <h4>3. 在本网页填这三项</h4>
  <div class="guide-table"><table><thead><tr><th>向量 API 栏位</th><th>填写内容</th></tr></thead><tbody>
    <tr><td>API 基础地址</td><td><code>https://api.siliconflow.cn/v1</code></td></tr>
    <tr><td>模型名称</td><td><code>BAAI/bge-m3</code>（不带 Pro/）</td></tr>
    <tr><td>API Key</td><td>刚才在硅基流动创建的 Key</td></tr>
  </tbody></table></div>
  <p>这些内容填在“向量 API”卡片里，不需要添加副 API。可以点击“获取模型”后选择，也可以直接手填模型名；不要选带 reranker 的重排模型。基础地址不用再加 <code>/embeddings</code>，网页会自动处理。</p>
  <h4>4. 开启并给已有记忆建立索引</h4>
  <ol><li>打开“开启向量检索”，点击向量卡片的“确认此 API”，或上方“确认配置”。确认只登记本机接口，不会调用外部模型。</li>
    <li>进入游戏后打开顶部“记忆”，点击“生成缺失向量”。这一步才会调用硅基流动的向量服务。</li>
    <li>随后检索记忆或发送剧情时，输入会被编码，并在浏览器本地与已建立的记忆向量比较。新增／修改记忆后，可再次点击“生成缺失向量”。</li></ol>
  <p>记忆原文和向量结果保存在当前浏览器；用于编码的记忆／查询文本会发给硅基流动。此向量请求不携带完整服务器人设或世界书。换向量模型后需要重新建索引；接口失败时退回关键词检索。</p>
  <details><summary>遇到问题时怎么看</summary><ul><li>认证失败：核对是不是硅基流动的 Key，以及账号权限。</li><li>模型不存在：核对完整模型名和大小写，先在控制台确认该模型可用。</li><li>限流：稍后重试；免费不等于不限次数。</li><li>模型列表里找不到：直接手填 <code>BAAI/bge-m3</code>；获取列表成功不代表模型一定可调用。</li></ul><p><a href="https://docs.siliconflow.cn/docs/api/embeddings-post" target="_blank" rel="noopener noreferrer">官方向量接口说明</a></p></details>
</details></template>
