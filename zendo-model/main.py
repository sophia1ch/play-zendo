# main.py
from __future__ import annotations

import base64
import json
from pathlib import Path
import random
from io import BytesIO
from typing import List, Literal, Optional, Dict, Any
import shutil
import torch
import threading
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageDraw
from play_zendo_state import setup_game
from zendo.player import HumanPlayer
from zendo.game import play_game_state

# ==== Frontend-kompatible Typen ==================================================

Label = Literal["YES", "NO"]
Shape = Literal["block", "pyramid", "wedge"]
ColorName = Literal["red", "blue", "yellow"]
Orientation = Literal["upright", "upside_down", "flat", "cheesecake", "doorstop"]

gm = None
players: list[Any] = []
humanPlayer: HumanPlayer | None = None
program = None
name = None

# Event-Loop Referenz für send_event
event_loop: asyncio.AbstractEventLoop | None = None

# Synchronisation für HumanPlayer.wait_for_action(...)
_pending_actions: Dict[str, Dict[str, Any]] = {}
_pending_cond = threading.Condition()
# ==== FastAPI-Setup ===============================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # für dev, später einschränken
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def send_event(payload: Dict[str, Any]) -> None:
    """
    Wird vom HumanPlayer (im Game-Thread) aufgerufen.
    Schiebt ws_manager.broadcast(...) sicher in den FastAPI-Eventloop.
    """
    global event_loop
    if event_loop is None:
        # Noch kein Loop – z.B. im Testmodus
        return

    # coroutine in den laufenden Event-Loop einplanen
    asyncio.run_coroutine_threadsafe(ws_manager.broadcast(payload), event_loop)


def wait_for_action(kind: str) -> Dict[str, Any]:
    """
    Blockiert synchron, bis eine Antwort vom Frontend für diesen 'kind'
    eingetroffen ist. 'kind' ist z.B. "scene_built", "scene_decision",
    "guess_label", "guess_rule".
    """
    global _pending_actions, _pending_cond

    with _pending_cond:
        while kind not in _pending_actions:
            _pending_cond.wait()
        msg = _pending_actions.pop(kind)
        return msg


def init_game_with_random_task(task_index: int = 0):
    """
    - wählt random Task
    - initialisiert GameMaster, AI-Player, HumanPlayer
    - startet das Spiel in einem eigenen Thread
    """
    global gm, players, program, name, humanPlayer
    print("Initializing game with random task...")
    gm, ai_player, program, name, cfg = setup_game(task_index)

    humanPlayer = HumanPlayer(
        player_id=0,
        task_idx=task_index,
        send_event=send_event,
        wait_for_action=wait_for_action,
        cfg=cfg,
    )

    players = [humanPlayer]

    # Alles, was das Spiel macht (inkl. play_game_state und evtl. Speichern):
    def run_game():
        print("Game started.")
        state = play_game_state(gm, players)

        # Optional: deine ganze Gamestate-Speicher-Logik hier rein verschieben
        path_name = f"gamestates/gamestates_me"
        output_dir = Path(path_name)
        output_dir.mkdir(parents=True, exist_ok=True)
        iteration_dir = output_dir
        iteration_dir.mkdir(parents=True, exist_ok=True)

        state_path = iteration_dir / f"task_{task_index}_state.json"
        example_path = iteration_dir / f"examples_{task_index}.pt"

        state_dict, examples_tensor, bramley_examples_tensor = state.to_dict()
        images_out_dir = iteration_dir / f"task_{task_index}_images"
        images_out_dir.mkdir(parents=True, exist_ok=True)

        def classify_label(src_path: Path) -> str:
            s = src_path.as_posix().lower()
            return "gm" if ("master_thesis" in s or "counter" in s) else "player"

        def copy_and_rename(paths_list, prefix=""):
            new_paths = []
            for idx, src in enumerate(paths_list):
                src_path = Path(src)
                label = classify_label(src_path)
                ext = (src_path.suffix or ".png").lower()
                dest_path = images_out_dir / f"{label}{prefix}_{idx}{ext}"
                try:
                    shutil.copy2(src_path, dest_path)
                except Exception as e:
                    print(f"Warning: failed to copy {src_path} → {dest_path}: {e}")
                new_paths.append(str(dest_path))
            return new_paths

        state_dict["paths"] = copy_and_rename(state_dict.get("paths", []))
        with open(state_path, "w") as f:
            json.dump(state_dict, f, indent=2)
        torch.save(examples_tensor, example_path)

        # Spielende ans Frontend schicken
        send_event({
            "type": "system",
            "text": f"game_over: {state.game_over_reason}",
        })

    # Spiel in separatem Thread starten
    threading.Thread(target=run_game, daemon=True).start()


# ==== WebSocket-Manager ==========================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        # message muss WSMessage entsprechen
        dead: list[WebSocket] = []
        data = json.dumps(message)
        for ws in self.active_connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)


ws_manager = ConnectionManager()

@app.on_event("startup")
async def on_startup():
    global event_loop
    event_loop = asyncio.get_running_loop()
 
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("WS: new connection incoming")
    await ws_manager.connect(websocket)
    print("WS: connection accepted")
    try:
        await websocket.send_text(json.dumps({
            "type": "system",
            "text": "connected",
        }))
        print("WS: sent 'connected' system message")

        while True:
            print("WS: waiting for message...")
            raw = await websocket.receive_text()
            print("WS: received raw:", repr(raw))
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                print("WS: JSON decode error")
                continue

            mtype = msg.get("type")
            print("WS: message type:", mtype)

            # Start-Message vom Frontend
            if mtype == "start":
                print("WS: START received")
                task_index = msg.get("task_index")
                init_game_with_random_task(task_index)
                continue

            # Antworten für HumanPlayer.wait_for_action(...)
            if mtype in ("scene_built", "scene_decision", "guess_label", "guess_rule"):
                print("WS: pending action:", mtype)
                global _pending_actions, _pending_cond
                with _pending_cond:
                    _pending_actions[mtype] = msg
                    _pending_cond.notify_all()
                continue

    except WebSocketDisconnect:
        print("WS: disconnect")
        ws_manager.disconnect(websocket)
    except Exception as e:
        print("WS: unexpected error:", e)
        ws_manager.disconnect(websocket)