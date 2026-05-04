# 渠道 API 测试台

渠道 API 测试台是一个手动测试入口，用来验证 OpenAI-compatible、Anthropic-compatible 与 AWS Bedrock Converse Stream 渠道的可用性、首字/首响应时间、总耗时和响应体结构。

## 首期能力

- 左侧独立模块入口：`渠道 API 测试台`。
- 本次测试参数：协议、模型、Base URL、API Key、流式开关、内置题型。
- Bedrock 参数：region、model id、Bearer Token、max tokens、timeout；Bedrock 固定按流式测试。
- 内置题型：小请求、中等请求、大请求、连续追问型。
- 结果表格：时间、模型、用时/首字、输入、输出。
- 展开详情：请求摘要、响应摘要、检查项、错误信息、响应体、连续追问每轮明细。
- Bedrock 展开详情：首个 event、首个文本 delta、Bedrock latency、usage、stop reason、event timeline。
- 历史记录：SQLite 本地持久化，按时间倒序分页。

## 安全边界

- API Key/Bearer Token 只用于本次测试请求，不写入历史记录。
- 历史记录只保存脱敏后的 Base URL、协议、模型、题型、耗时、规模、响应摘要和错误摘要。
- 测试记录不会写入 `model_call_facts`，不会进入模型使用与成本看板。
- 不支持 AWS profile、Access Key/Secret Key、STS、IAM role assume、模型发现、region 发现或非 Converse Stream 的 Bedrock API。

## 数据口径

- 流式请求的首字时间表示首个可见文本 delta 的时间。
- 非流式请求显示为首响应时间。
- 渠道返回 usage 时展示真实 usage；缺失 usage 时只展示字符数，不估算 token 或成本。
- Bedrock latency 使用 AWS metadata 返回口径，本地总耗时使用客户端观察口径，二者不直接相减当作网络耗时。
