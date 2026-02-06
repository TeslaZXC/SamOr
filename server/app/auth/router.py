from fastapi import APIRouter

router = APIRouter()

@router.post("/request-code")
async def request_code(email: str):
    # TODO: Implement email sending logic
    return {"message": f"Code sent to {email}"}

@router.post("/verify-code")
async def verify_code(email: str, code: str):
    # TODO: Implement code verification logic
    return {"message": "Code verified", "token": "temp-token"}
