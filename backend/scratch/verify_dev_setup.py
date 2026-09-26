import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        # 1. Backend direct root
        res_root = await client.get("http://127.0.0.1:8000/")
        print("Backend root (127.0.0.1:8000):", res_root.status_code, res_root.json())
        assert res_root.status_code == 200

        # 2. Backend health
        res_health = await client.get("http://127.0.0.1:8000/health")
        print("Backend /health (127.0.0.1:8000):", res_health.status_code, res_health.json())
        assert res_health.status_code == 200

        # 3. Backend /api/health
        res_api_health = await client.get("http://127.0.0.1:8000/api/health")
        print("Backend /api/health (127.0.0.1:8000):", res_api_health.status_code, res_api_health.json())
        assert res_api_health.status_code == 200

        # 4. Frontend Vite dev server
        res_fe = await client.get("http://localhost:5173/")
        print("Frontend dev server (localhost:5173):", res_fe.status_code, f"Length: {len(res_fe.text)}")
        assert res_fe.status_code == 200
        assert "<div id=\"root\">" in res_fe.text

        # 5. Frontend Vite Proxy to Backend
        res_proxy = await client.get("http://localhost:5173/api/health")
        print("Frontend Vite Proxy /api/health:", res_proxy.status_code, res_proxy.json())
        assert res_proxy.status_code == 200
        assert res_proxy.json().get("status") == "ok"

    print("\nALL SERVER STARTUP AND PROXY TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(test())
