import fs from 'fs'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {chatWithLLM} from "@/LLM";
import {parseMixContents} from "@/parse";

interface MixContent {
    type: "text" | "tool";
    text?: string;
    tool?: {
        server_name: string;
        tool_name: string;
        tool_params?: Record<string, unknown>;
    };
}

async function listTools({
                             command,
                             args,
                             env = {},
                         }: {
    command: string;
    args: string[];
    env?: Record<string, string>;
}) {
    const transport = new StdioClientTransport({
        command,
        args,
        env: {
            ...(process.env as Record<string, string>),
            ...env,
        },
    });
    const client = new Client({
        name: "chatmcp",
        version: "1.0.0",
    });
    await client.connect(transport);
    const tools = await client.listTools();
    return tools;
}


async function callTool({
                            command,
                            args,
                            env = {},
                            name,
                            params,
                        }: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    name: string;
    params?: Record<string, unknown>;
}) {
    const transport = new StdioClientTransport({
        command,
        args,
        env: {
            ...(process.env as Record<string, string>),
            ...env,
        },
    });
    const client = new Client({
        name: "meta2d-mcp",
        version: "1.0.0",
    });
    await client.connect(transport);
    const result = await client.callTool({
        name,
        arguments: params,
    });
    return result;
}

interface McpServer {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

async function getMcpServers(
    config: string
): Promise<Record<string, McpServer>> {
    const mcpConfig = JSON.parse(config);
    const mcpServers = Object.entries(mcpConfig.mcpServers).reduce(
        (acc, [key, value]) => {
            acc[key] = {
                name: key,
                command: (value as any).command,
                args: (value as any).args,
                env: (value as any).env,
            };
            return acc;
        },
        {} as Record<string, McpServer>
    );
    return mcpServers;
}

interface McpTool {
    server_name: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
async function getMcpTools(
    mcpServers: Record<string, McpServer>
): Promise<McpTool[]> {
    const allTools = await Promise.all(
        Object.entries(mcpServers).map(async ([name, server]) => {
            const tools = await listTools({
                command: server.command,
                args: server.args || [],
                env: server.env || {},
            });
            return tools.tools.map((tool) => ({
                server_name: name,
                name: tool.name,
                description: tool.description || "",
                inputSchema: tool.inputSchema,
            }));
        })
    );
    return allTools.flat();
}

export async function main(query: string) {
    // 加载 MCP 配置文件，获取 MCP 服务器列表和可用工具
const configFile = `/Users/july/.cursor/mcp.json`;
    const config =  fs.readFileSync(configFile, "utf-8");
    const mcpServers = await getMcpServers(config);
    const mcpTools = await getMcpTools(mcpServers);
    let contextMessages: MixContent[] = [];
    let toolResults = "";
    let reply = "";
    //最多循环 10 次，用于连续调用工具的多轮推理
    for (let i = 0; i < 10; i++) {
        // 向大模型发送请求，由其判断是否需要调用工具
        const pickToolResult = await chatWithLLM({
            query,
            contextMessages: JSON.stringify(contextMessages),
            tools: JSON.stringify(mcpTools),
            toolResults: toolResults,
        });
        // 解析大模型返回的内容（文本 + 工具信息）
        let content = "";
        for await (const chunk of pickToolResult.textStream) {
            content += chunk;
        }
        const mixContents = parseMixContents(content);
        contextMessages.push(...mixContents);
        reply += content;
        // 从返回内容中提取工具调用请求参数
        let callToolParams = null;
        for (const mixContent of mixContents) {
            if (mixContent.type === "tool") {
                const tool = mixContent.tool;
                if (
                    tool &&
                    tool.tool_name &&
                    tool.server_name &&
                    mcpServers[tool.server_name] &&
                    mcpServers[tool.server_name].command
                ) {
                    callToolParams = {
                        command: mcpServers[tool.server_name].command,
                        args: mcpServers[tool.server_name].args || [],
                        env: mcpServers[tool.server_name].env || {},
                        name: tool.tool_name,
                        params: tool.tool_params,
                    };
                    break;
                }
            }
        }
        // 如果需要调用工具，则执行调用，并将结果更新为下一轮上下文
        if (callToolParams) {
            const callToolResult = await callTool(callToolParams);
            try {
                toolResults = JSON.stringify(callToolResult);
                reply += `\n\n${toolResults}\n\n`;
            }catch(e) {

            }

            continue;
        }
        // 如果不需要调用工具，则跳出循环
        break;
    }
    return new Response(reply);
}

const rep = POST("用meta2d生成echarts图元，要求数据为前端开发的薪资水平，用饼图表示")

rep.then(res =>{
    return res.text()
}).then(d=>{
    console.log(d,)
})