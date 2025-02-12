import Docker from "dockerode";
import { promisify } from "util";
import { pipeline } from "stream";
import fs from "fs";
import fs_extra from "fs-extra";
import path from "path";
import zlib from "zlib";
import type { Result } from "./types.ts";
const pipelineAsync = promisify(pipeline);

// if (import.meta.main) {
await main();
// }
// 定义 API URL

async function main() {
    const tag = await fetchCommitTag();

    // 创建 Docker 实例
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });

    await pullAndExportImage(tag, docker);
}

// 异步函数，用于获取提交标签
/**
 * 异步获取 GitHub 仓库的特定提交标签信息
 *
 * 此函数通过 GitHub API 获取指定仓库的提交信息，并解析出提交日期和提交哈希值，
 * 然后将这些信息格式化为一个字符串返回这个过程涉及到网络请求和数据处理
 *
 * @returns {Promise<string>} 返回一个 Promise，解析为格式化的提交标签字符串
 */
async function fetchCommitTag(): Promise<string> {
    // 定义请求的 URL
    const url =
        "https://api.github.com/repos/Red5d/docker-autocompose/commits/master";

    // 发起 GET 请求
    return await fetch(url, { headers: {} })
        .then(async (response) => {
            // 如果响应状态码不是 200，则抛出错误
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // 返回响应的 JSON 数据
            return (await response.json()) as Result;
        })
        .then((data: Result) => {
            const commitDate = data.commit.author.date; // 提交日期
            const commitHash = data.sha; // 提交哈希值

            // 打印结果
            console.log("Commit Date:", commitDate);
            console.log("Commit Hash:", commitHash);

            // 如果需要进一步处理，可以将变量传递给其他函数
            console.log(
                "tag:",
                `${commitDate}-${commitHash}`.replaceAll(":", "-"),
            );
            return `${commitDate}-${commitHash}`.replaceAll(":", "-");
        })
        .catch((error) => {
            console.error("Error fetching data:", error.message);
            throw error;
        });
}
/**
 * 拉取镜像、打标签并导出为 .tgz 文件
 * @param {string} tag - 镜像的标签
 * @returns {Promise<void>}
 */
async function pullAndExportImage(tag: string, docker: Docker): Promise<void> {
    try {
        // 1. Pull 镜像
        console.log("正在拉取镜像 ghcr.io/red5d/docker-autocompose:latest...");
        const pullStream = await docker.pull(
            "ghcr.io/red5d/docker-autocompose:latest",
        );

        const result = await new Promise<unknown[]>((resolve, reject) => {
            docker.modem.followProgress(
                pullStream,
                (err: unknown, res: unknown[]) => {
                    if (err) return reject(err);
                    resolve(res);
                },
                function onProgress(event: unknown) {
                    //...
                    console.log(event);
                },
            );
        });
        console.log("镜像拉取成功", result);

        // 2. 获取镜像实例
        const image = docker.getImage(
            "ghcr.io/red5d/docker-autocompose:latest",
        );

        // 3. 给镜像打标签
        console.log(`正在给镜像打标签为 red5d/docker-autocompose:${tag}`);
        await image.tag({ repo: "red5d/docker-autocompose", tag });
        console.log(`镜像已打标签为 red5d/docker-autocompose:${tag}`);
        fs_extra.mkdir("dist", { recursive: true });
        // await Deno.mkdir("dist", { recursive: true });
        // 4. 导出镜像并压缩为 .tgz 文件
        const outputFilePath = path.resolve(
            "dist",
            `red5d-docker-autocompose-${tag}-image.tgz`,
        );
        console.log(`正在导出镜像并保存为 ${outputFilePath}`);

        // 创建输出文件流
        const outputStream = fs.createWriteStream(outputFilePath);
        const saveStream = await docker
            .getImage(`red5d/docker-autocompose:${tag}`)
            .get();

        // 使用 gzip 压缩
        await pipelineAsync(saveStream, zlib.createGzip(), outputStream);

        console.log(`镜像已成功导出并压缩为 ${outputFilePath}`);
    } catch (error) {
        console.error("操作失败:", error);
        throw error;
    }
}
