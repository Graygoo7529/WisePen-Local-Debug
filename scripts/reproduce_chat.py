#!/usr/bin/env python3
"""在现有工作台中复现 Chat 行为：固定 9200 端口，只切换 Python 源码。"""
import argparse
import asyncio
import functools
import json
import os
from pathlib import Path
import socket
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("serve", "inspect", "evict"))
    parser.add_argument("--source", type=Path, required=True, help="WisePenCloud-AI 检出目录")
    parser.add_argument("--env-file", type=Path, required=True, help="Python 服务的本地 .env")
    parser.add_argument("--config", type=Path, required=True, help="工作台 wisepen-local.config.json")
    parser.add_argument("--session", help="inspect/evict 操作的会话 ID")
    parser.add_argument("--archive-fail", action="store_true", help="模拟测试用户的 assistant 消息写入失败")
    parser.add_argument("--archive-delay", type=float, default=0, help="测试用户的 assistant 写入延迟秒数")
    parser.add_argument("--dev-host", help="可选：在本进程内解析 wisepen-dev-server 到指定 IP")
    args = parser.parse_args()
    if args.action != "serve" and not args.session:
        parser.error("inspect/evict 必须指定 --session")
    if args.archive_delay < 0:
        parser.error("--archive-delay 不能为负数")
    source = args.source.resolve()
    env_file = args.env_file.resolve()
    config_path = args.config.resolve()
    if not env_file.is_file():
        parser.error("--env-file 不存在")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    user_id = config["identity"]["userId"]
    if not user_id or user_id.startswith("<"):
        parser.error("请先在工作台配置文件中填写测试用户 ID")
    if config["services"]["chat"].rstrip("/") != "http://127.0.0.1:9200":
        parser.error("工作台 Chat 地址须固定为 http://127.0.0.1:9200")
    paths = [source / f"services/{name}/src" for name in ("wisepen-chat-service", "wisepen-common")]
    if not all(path.is_dir() for path in paths):
        parser.error("--source 中找不到 Python Chat/Common 源码")

    from dotenv import load_dotenv

    load_dotenv(env_file, override=True)
    os.environ["SERVICE_PORT"] = "9200"
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
    # 固定工作目录和文件缓存，版本切换时继续使用相同环境。
    runtime = config_path.parent / ".reproduction"
    runtime.mkdir(mode=0o700, exist_ok=True)
    os.chdir(runtime)
    from chat.core.config.app_settings import settings

    settings.OSS_CACHE_DIR = str(runtime / "oss-cache")
    if args.action != "serve":
        from bson import ObjectId
        from pymongo import MongoClient
        from redis import Redis

        with MongoClient(settings.MONGODB_URL) as mongo:
            session = mongo[settings.MONGODB_DB_NAME].wisepen_chat_session.find_one(
                {"_id": ObjectId(args.session), "user_id": user_id}
            )
        if session is None:
            parser.error("会话不存在或不属于配置中的测试用户")
        key = f"wisepen:chat:hot_context:{args.session}"
        with Redis.from_url(settings.REDIS_URL, decode_responses=True) as redis:
            count = redis.llen(key)
            if args.action == "evict":
                if not session.get("current_summary"):
                    parser.error("摘要尚未保存；先用 inspect 确认摘要内容，再清除该会话缓存")
                redis.delete(key)
            print(json.dumps({
                "session_id": args.session,
                "summary": session.get("current_summary"),
                "summary_updated_at": str(session.get("summary_updated_at")),
                "cached_messages_before": count,
                "cached_messages_after": redis.llen(key),
            }, ensure_ascii=False, indent=2))
        return

    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 9200))
        except OSError:
            parser.error("9200 已占用。先停止上一个 Chat 服务，再启动另一个版本")
    if args.archive_fail or args.archive_delay:
        from chat.domain.entities import ChatSession
        from chat.core.persistence.mongo.message_repository import MongoMessageRepository
        from pymongo.errors import OperationFailure

        save_messages = MongoMessageRepository.save_messages

        @functools.wraps(save_messages)
        async def injected_save(repository, messages):
            if messages and any(message.role.value == "assistant" for message in messages):
                session = await ChatSession.get(messages[0].session_id)
                if session is not None and session.user_id == user_id:
                    if args.archive_delay:
                        await asyncio.sleep(args.archive_delay)
                    if args.archive_fail:
                        raise OperationFailure("Local reproduction: injected assistant archive failure")
            return await save_messages(repository, messages)

        MongoMessageRepository.save_messages = injected_save
    import uvicorn

    print(f"Chat: http://127.0.0.1:9200\nSource: {source}\n使用 Ctrl+C 停止服务后切换版本。", flush=True)
    uvicorn.run("chat.main:app", host="127.0.0.1", port=9200, loop="asyncio")


if __name__ == "__main__":
    main()
