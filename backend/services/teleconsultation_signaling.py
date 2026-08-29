import logging
import json
from typing import Dict, List, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger("ayushlink.webrtc")


class ConnectionManager:
    """Manages active WebSocket connections for WebRTC signaling sessions."""

    def __init__(self):
        # Maps session_id -> list of dicts: {"websocket": WebSocket, "user_id": str, "role": str, "name": str}
        self.active_rooms: Dict[str, List[Dict[str, Any]]] = {}

    async def connect(self, session_id: str, websocket: WebSocket, user_info: Dict[str, Any]):
        """Accept WebSocket and register peer in the room."""
        await websocket.accept()
        if session_id not in self.active_rooms:
            self.active_rooms[session_id] = []

        peer_data = {
            "websocket": websocket,
            "user_id": user_info.get("user_id", ""),
            "role": user_info.get("role", "patient"),
            "name": user_info.get("name", "User"),
        }
        self.active_rooms[session_id].append(peer_data)
        logger.info(
            f"[WebRTC] Peer joined session '{session_id}': {peer_data['name']} ({peer_data['role']}). Room size: {len(self.active_rooms[session_id])}"
        )

        # Notify the other peer (if already in the room) that someone joined
        await self.broadcast_to_peer(
            session_id=session_id,
            sender_socket=websocket,
            message={
                "type": "peer-joined",
                "role": peer_data["role"],
                "name": peer_data["name"],
                "room_size": len(self.active_rooms[session_id]),
            },
        )

        # Send welcome message to newly connected peer with current room occupancy
        await websocket.send_text(
            json.dumps(
                {
                    "type": "room-status",
                    "session_id": session_id,
                    "room_size": len(self.active_rooms[session_id]),
                    "is_initiator": len(self.active_rooms[session_id]) == 1,
                }
            )
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> Optional[Dict[str, Any]]:
        """Remove peer on disconnection."""
        removed_peer = None
        if session_id in self.active_rooms:
            peers = self.active_rooms[session_id]
            for p in peers:
                if p["websocket"] == websocket:
                    removed_peer = p
                    break
            if removed_peer:
                peers.remove(removed_peer)
                logger.info(
                    f"[WebRTC] Peer disconnected from session '{session_id}': {removed_peer['name']}. Remaining: {len(peers)}"
                )

            if not self.active_rooms[session_id]:
                del self.active_rooms[session_id]

        return removed_peer

    async def broadcast_to_peer(
        self,
        session_id: str,
        sender_socket: WebSocket,
        message: Dict[str, Any],
    ):
        """Relay message to the other peer in the room."""
        if session_id not in self.active_rooms:
            return

        payload = json.dumps(message)
        for peer in self.active_rooms[session_id]:
            if peer["websocket"] != sender_socket:
                try:
                    await peer["websocket"].send_text(payload)
                except Exception as e:
                    logger.warning(f"[WebRTC] Error sending to peer in room '{session_id}': {e}")

    async def send_personal_message(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send a direct message to a specific peer."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.warning(f"[WebRTC] Error sending personal message: {e}")

    def get_room_peers(self, session_id: str) -> List[Dict[str, Any]]:
        """Get list of connected peers in a session."""
        return self.active_rooms.get(session_id, [])


# Global signaling manager instance
signaling_manager = ConnectionManager()
