from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import shutil
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Soulbound API")
api_router = APIRouter(prefix="/api")


# ---------- Static Level Definitions ----------
# Each level is a "body" the soul takes over.
LEVELS = [
    {
        "id": "ajkish",
        "index": 1,
        "name": "Ajkish",
        "role": "The Pooper",
        "life_theme": "I just like pooping",
        "story_intro": "Ajkish poops on average 6 times a day which results in him having to eat a lot more than the average human to keep up with his bowel movements. Help Ajkish aquire the calories needed for his body to work!",
        "story_outro": "Ajkish needs were satisfied. He celebrated by going to the toilet.",
        "collect_label": "Hamburgers",
        "collect_icon": "🍔",
        "default_song_seconds": 135,
        "palette": {"sky": "#2a1e3c", "ground": "#3d2b4a", "accent": "#EF476F"},
        "seed": 12,
        "scene": "bathroom",
        "preset_song": {"filename": "ajkish.mp3", "duration_seconds": 135}
    },
    {
        "id": "kaldvin",
        "index": 2,
        "name": "Kaldvin",
        "role": "Airpod Enjoyer",
        "life_theme": "Block out the haters",
        "story_intro": "Kaldvin was born with airpods-disease which caused him to be born with airpods that are a part of his body. Kaldvin needs help to catch tunes so he doesn't have to tackle the silence.",
        "story_outro": "He managed to avoid the pressure of silence",
        "collect_label": "Notes",
        "collect_icon": "🎵",
        "default_song_seconds": 182,
        # Bright clinical palette: near-white walls, sickly green floor, amber signage.
        "palette": {"sky": "#eef2f5", "ground": "#c8d4d0", "accent": "#FFD166"},
        "seed": 27,
        "scene": "hospital",
        "preset_song": {"filename": "kaldvin.mp3", "duration_seconds": 182}
    },
    {
        "id": "Bogey",
        "index": 3,
        "name": "Sebastion 'Bogey' Andersson",
        "role": "The Nationalist",
        "life_theme": "Preserve our culture",
        "story_intro": "Bogey always dispised other cultures. You need to help him collect deportation papers",
        "story_outro": "He managed to preserve the culture in his country",
        "collect_label": "Letters",
        "collect_icon": "✉️",
        "default_song_seconds": 105,
        "palette": {"sky": "#1c1930", "ground": "#2a2545", "accent": "#B0A0FF"},
        "seed": 44
    },
    {
        "id": "randersson",
        "index": 4,
        "name": "Randersson",
        "role": "The Gymbro",
        "life_theme": "No pain no gain",
        "story_intro": "Randersson struggled to fit in anywhere but when he found the gym he realised that muscles bring him attention. Help him collect steroids",
        "story_outro": "He managed to remain his god-like physique",
        "collect_label": "Pills",
        "collect_icon": "🎵",
        "default_song_seconds": 120,
        "palette": {"sky": "#2c1a1f", "ground": "#4a2b34", "accent": "#FFD166"},
        "seed": 61
    },
    {
        "id": "Emil",
        "index": 5,
        "name": "Emil",
        "role": "The Nicotine addict",
        "life_theme": "Chase the high",
        "story_intro": "Emil found out at an early stage that snus was something that enabled his brain function normally. Help him collect snus!",
        "story_outro": "He collected enough snus to finally relax",
        "collect_label": "Snus",
        "collect_icon": "⭐",
        "default_song_seconds": 100,
        "palette": {"sky": "#0d1533", "ground": "#1a2247", "accent": "#8FDCFF"},
        "seed": 78
    },
]


# ---------- Models ----------
class ScoreCreate(BaseModel):
    level_id: str
    player_name: str = "Wanderer"
    completion_time_seconds: float
    song_duration_seconds: float
    items_collected: int
    completed: bool


class Score(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level_id: str
    player_name: str
    completion_time_seconds: float
    song_duration_seconds: float
    items_collected: int
    completed: bool
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SongMeta(BaseModel):
    level_id: str
    original_name: str
    duration_seconds: float
    filename: str
    uploaded_at: str


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Soulbound API online"}


@api_router.get("/levels")
async def get_levels():
    # Merge each level with its song info if any
    result = []
    for lvl in LEVELS:
        doc = await db.songs.find_one({"level_id": lvl["id"]}, {"_id": 0})  # noqa

        merged = {**lvl}
        if doc:
            merged["song"] = {
                "duration_seconds": doc["duration_seconds"],
                "url": f"/api/songs/{lvl['id']}/audio",
                "original_name": doc["original_name"],
            }
        elif lvl.get("preset_song"):
            preset = lvl["preset_song"]
            merged["song"] = {
                "duration_seconds": preset["duration_seconds"],
                "url": f"/api/songs/{lvl['id']}/audio",
                "original_name": preset["filename"],
            }
        else:
            merged["song"] = None
        # best score
        best = await db.scores.find_one(
            {"level_id": lvl["id"], "completed": True},
            sort=[("completion_time_seconds", 1)],
            projection={"_id": 0}
        )
        merged["best_score"] = best
        result.append(merged)
    return result


@api_router.get("/levels/{level_id}")
async def get_level(level_id: str):
    lvl = next((item for item in LEVELS if item["id"] == level_id), None)
    if not lvl:
        raise HTTPException(404, "Level not found")
    doc = await db.songs.find_one({"level_id": level_id}, {"_id": 0})
    result = {**lvl}
    if doc:
        result["song"] = {
            "duration_seconds": doc["duration_seconds"],
            "url": f"/api/songs/{level_id}/audio",
            "original_name": doc["original_name"],
        }
    elif lvl.get("preset_song"):
        preset = lvl["preset_song"]
        result["song"] = {
            "duration_seconds": preset["duration_seconds"],
            "url": f"/api/songs/{level_id}/audio",
            "original_name": preset["filename"],
        }
    else:
        result["song"] = None
    return result


@api_router.post("/scores", response_model=Score)
async def create_score(payload: ScoreCreate):
    if not any(item["id"] == payload.level_id for item in LEVELS):
        raise HTTPException(404, "Level not found")
    score = Score(**payload.model_dump())
    await db.scores.insert_one(score.model_dump())
    return score


@api_router.get("/scores/{level_id}")
async def get_scores(level_id: str):
    cursor = db.scores.find(
        {"level_id": level_id, "completed": True},
        {"_id": 0}
    ).sort("completion_time_seconds", 1).limit(10)
    return await cursor.to_list(10)

@api_router.delete("/scores")
async def reset_all_scores():
    """Wipes ALL completion records across every level. Used by the Reset Progress
    button on the level-select screen. There is no way to undo this from the app."""
    result = await db.scores.delete_many({})
    return {"deleted": result.deleted_count}

@api_router.post("/songs/upload")
async def upload_song(
    level_id: str = Form(...),
    duration_seconds: float = Form(...),
    file: UploadFile = File(...),
):
    if not any(item["id"] == level_id for item in LEVELS):
        raise HTTPException(404, "Level not found")

    ext = Path(file.filename).suffix.lower() or ".mp3"
    if ext not in {".mp3", ".wav", ".ogg", ".m4a"}:
        raise HTTPException(400, "Unsupported audio format")

    filename = f"{level_id}{ext}"
    dest = UPLOAD_DIR / filename

    # Remove any old file variants for this level
    for old in UPLOAD_DIR.glob(f"{level_id}.*"):
        try:
            old.unlink()
        except OSError:
            pass

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    meta = {
        "level_id": level_id,
        "original_name": file.filename,
        "duration_seconds": duration_seconds,
        "filename": filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.songs.update_one({"level_id": level_id}, {"$set": meta}, upsert=True)
    return {"ok": True, "meta": meta, "url": f"/api/songs/{level_id}/audio"}


@api_router.get("/songs/{level_id}/audio")
async def get_song_audio(level_id: str):
    lvl = next((item for item in LEVELS if item["id"] == level_id), None)
    doc = await db.songs.find_one({"level_id": level_id}, {"_id": 0})
    filename = None
    if doc:
        filename = doc["filename"]
    elif lvl and lvl.get("preset_song"):
        filename = lvl["preset_song"]["filename"]
    if not filename:
        raise HTTPException(404, "No song for this level")
    path = UPLOAD_DIR / filename
    if not path.exists():
        raise HTTPException(404, f"Audio file missing: {filename}")
    media_map = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4"}
    ext = path.suffix.lower()
    return FileResponse(path, media_type=media_map.get(ext, "audio/mpeg"))


@api_router.delete("/songs/{level_id}")
async def delete_song(level_id: str):
    doc = await db.songs.find_one({"level_id": level_id})
    if not doc:
        raise HTTPException(404, "No song uploaded")
    path = UPLOAD_DIR / doc["filename"]
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass
    await db.songs.delete_one({"level_id": level_id})
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
