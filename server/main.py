from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.auth.router import router as auth_router
from app.ws import router as ws_router
from app.db.models import init_db

app = FastAPI(
    title="SamOr Backend",
    description="Backend for SamOr Secure Messenger",
    version="0.1.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await init_db()

# Include Routers
# Include Routers
from fastapi.staticfiles import StaticFiles
import os

os.makedirs("static/uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(ws_router, prefix="/api", tags=["ws"])
app.include_router(ws_router, tags=["ws"]) # Fallback for different proxy configs
from app.upload import router as upload_router
app.include_router(upload_router, prefix="/api", tags=["upload"])
from app.routers.files import router as files_router
app.include_router(files_router, prefix="/api/files", tags=["files"])

@app.get("/")
async def root():
    return {"message": "Welcome to SamOr API", "status": "running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
