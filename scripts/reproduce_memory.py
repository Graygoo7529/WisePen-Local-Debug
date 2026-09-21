#!/usr/bin/env python3
"""用现有工作台复现长期记忆问题；Chat 固定为 http://127.0.0.1:9200。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("serve", "seed"))
    parser.add_argument("--source", type=Path, required=True, help="WisePenCloud-AI 检出目录")
    parser.add_argument("--env-file", type=Path, required=True, help="Python Chat 的本地 .env")
    parser.add_argument("--config", type=Path, required=True, help="工作台 wisepen-local.config.json")
    parser.add_argument("--dev-host", help="在当前进程内解析 wisepen-dev-server 到指定 IP")
    faults = parser.add_mutually_exclusive_group()
    faults.add_argument("--memory-init-fail", action="store_true", help="仅在本机 Chat 中令 Mem0 初始化失败")
    faults.add_argument("--memory-init-delay", type=float, default=0, help="Mem0 初始化延迟秒数")
    args = parser.parse_args()
    if args.memory_init_delay < 0:
        parser.error("--memory-init-delay 不能为负数")
    if args.action == "seed" and (args.memory_init_fail or args.memory_init_delay):
        parser.error("seed 不接受初始化故障参数")
    source, env_file, config_path = (path.resolve() for path in (args.source, args.env_file, args.config))
    if not env_file.is_file():
        parser.error("--env-file 不存在")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    user_id = config["identity"]["userId"]
    if not user_id or user_id.startswith("<"):
        parser.error("请填写工作台配置文件中的测试用户 ID")
    if config["services"]["chat"].rstrip("/") != "http://127.0.0.1:9200":
        parser.error("工作台 Chat 地址须为 http://127.0.0.1:9200")
    paths = [source / f"services/{name}/src" for name in ("wisepen-chat-service", "wisepen-common")]
    if not all(path.is_dir() for path in paths):
        parser.error("--source 中找不到 Chat/Common 源码")
    if args.action == "serve":
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", 9200))
            except OSError:
                parser.error("先停止占用 9200 的 Chat 服务，再切换版本")

    from dotenv import load_dotenv

    load_dotenv(env_file, override=True)
    os.environ["SERVICE_PORT"] = "9200"
    os.environ["MEM0_TELEMETRY"] = "false"
    if "NO_PROXY" in os.environ:
        os.environ["no_proxy"] = os.environ["NO_PROXY"]
    if args.dev_host:
        resolve = socket.getaddrinfo

        def local_resolve(host, *arguments, **options):
            if host in ("wisepen-dev-server", b"wisepen-dev-server"):
                host = args.dev_host
            return resolve(host, *arguments, **options)

        socket.getaddrinfo = local_resolve
    sys.path[:0] = [str(path) for path in paths]
    runtime = config_path.parent / ".reproduction"
    runtime.mkdir(mode=0o700, exist_ok=True)
    os.chdir(runtime)
    from chat.core.config.app_settings import settings
    from mem0 import Memory

    settings.OSS_CACHE_DIR = str(runtime / "oss-cache")
    # 每个测试用户使用独立集合；不清空现有长期记忆，也不改变其他服务配置。
    collection = "wisepen_memory_review_" + hashlib.sha256(user_id.encode()).hexdigest()[:12]
    create_memory = Memory.from_config

    def review_memory(memory_config):
        if args.memory_init_fail:
            raise ConnectionError("Local reproduction: memory initialization unavailable")
        if args.memory_init_delay:
            time.sleep(args.memory_init_delay)
        memory_config = {
            **memory_config,
            "history_db_path": str(runtime / f"{collection}.sqlite"),
            "vector_store": {
                **memory_config["vector_store"],
                "config": {**memory_config["vector_store"]["config"], "collection_name": collection},
            },
        }
        return create_memory(memory_config)

    Memory.from_config = staticmethod(review_memory)
    if args.action == "seed":
        client = Memory.from_config({
            "embedder": {"provider": "openai", "config": {
                "model": settings.MEMORY_EMBEDDING_MODEL,
                "api_key": settings.LLM_API_KEY,
                "openai_base_url": settings.LLM_BASE_URL,
            }},
            "llm": {"provider": "openai", "config": {
                "model": settings.MEMORY_LLM_MODEL,
                "api_key": settings.LLM_API_KEY,
                "openai_base_url": settings.LLM_BASE_URL,
            }},
            "vector_store": {"provider": "qdrant", "config": {
                "url": f"http://{settings.QDRANT_HOST}:{settings.QDRANT_PORT}",
                "api_key": settings.QDRANT_PASSWORD,
            }},
        })
        facts = ["我的午餐偏好是不放香菜。"] + [f"记忆列表验证条目 {index:02d}：测试书架编号为 {index:02d}。" for index in range(1, 25)]
        existing = client.get_all(filters={"user_id": user_id}, top_k=1000)["results"]
        saved = {item["memory"] for item in existing}
        for fact in facts:
            if fact not in saved:
                client.add(fact, user_id=user_id, infer=False, metadata={"source": "local-memory-review"})
        result = client.get_all(filters={"user_id": user_id}, top_k=1000)["results"]
        if not set(facts).issubset({item["memory"] for item in result}):
            raise RuntimeError("测试记忆未完整写入")
        print(f"已确认 {len(facts)} 条测试记忆；集合 {collection}。两个版本使用同一集合，不必重复 seed。")
        return

    import uvicorn

    print(f"Chat: http://127.0.0.1:9200\nSource: {source}\nMemory collection: {collection}\n按 Ctrl+C 停止后再切换 Python 版本。", flush=True)
    uvicorn.run("chat.main:app", host="127.0.0.1", port=9200, loop="asyncio")


if __name__ == "__main__":
    main()
