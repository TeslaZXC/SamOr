
import os
import shutil

# Assuming running from server/ directory
src = "samor.db"
dst = "data/samor.db"

if os.path.exists(src):
    if not os.path.exists("data"):
         os.makedirs("data")
    if not os.path.exists(dst):
         shutil.copy2(src, dst)
         print(f"Copied {src} to {dst}")
    else:
         print(f"{dst} already exists. Skipping copy.")
else:
    print(f"{src} not found.")
