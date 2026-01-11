interface MixContent {
    type: "text" | "tool";
    text?: string;
    tool?: {
        server_name: string;
        tool_name: string;
        tool_params?: Record<string, unknown>;
    };
}

export function parseMixContents(input: string): MixContent[] {
    const result: MixContent[] = [];
    // 提取工具信息的正则表达式
    const regex = /<<tool-start>>\s*([\s\S]*?)\s*<<tool-end>>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
        // 处理当前 tool 块之前的普通文本
        if (match.index > lastIndex) {
            const text = input.slice(lastIndex, match.index).trim();
            if (text) {
                result.push({ type: "text", text });
            }
        }
        // 解析并处理 tool 块中的 JSON 内容
        const toolJson = match[1].trim();
        try {
            const tool = JSON.parse(toolJson);
            result.push({ type: "tool", tool });
        } catch (e) {
            // 如果遇到解析失败的情况，跳过这个错误继续执行
        }
        lastIndex = regex.lastIndex;
    }
    // 处理最后一个 tool 块之后剩余的普通文本
    if (lastIndex < input.length) {
        const text = input.slice(lastIndex).trim();
        if (text) {
            result.push({ type: "text", text });
        }
    }
    // 返回解析后的混合内容
    return result;
}