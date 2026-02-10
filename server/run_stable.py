import uvicorn
import os
import sys

# Add current directory to path so imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("🚀 LAUNCHING STABLE SERVER (NO RELOAD MODE)")
    print("This server will NOT restart when database files change.")
    print("If you change python code, you must restart this script manually.")
    
    # Force run without reload to prevent database write loops
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
