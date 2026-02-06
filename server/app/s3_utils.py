import boto3
from botocore.exceptions import NoCredentialsError
import os
import uuid

# Configuration (Ideally from config.py, but loading from env for simplicity/Robustness)
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL") # Optional, for DigitalOcean Spaces, MinIO, etc.

def get_s3_client():
    return boto3.client(
        's3',
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        endpoint_url=S3_ENDPOINT_URL
    )

def upload_file_to_s3(file_obj, object_name=None, content_type=None):
    """Upload a file-like object to an S3 bucket"""
    if S3_ACCESS_KEY is None or S3_SECRET_KEY is None or S3_BUCKET_NAME is None:
        raise Exception("S3 Credentials not configured")

    s3_client = get_s3_client()
    
    # If S3 object_name was not specified, use a UUID
    if object_name is None:
        object_name = str(uuid.uuid4())
    
    try:
        extra_args = {'ACL': 'public-read'}
        if content_type:
             extra_args['ContentType'] = content_type

        s3_client.upload_fileobj(
            file_obj,
            S3_BUCKET_NAME,
            object_name,
            ExtraArgs=extra_args
        )
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        return None

    # Construct the URL
    # If endpoint_url is set (e.g. MinIO/DigitalOcean), format usually ends with /bucket/key or bucket.endpoint/key
    # For standard AWS: https://bucket.s3.region.amazonaws.com/key
    if S3_ENDPOINT_URL:
         # Simplified URL construction, might need adjustment for specific providers
         # Assuming path style access or custom domain
         url = f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET_NAME}/{object_name}"
         # Some providers like DO might need: f"https://{S3_BUCKET_NAME}.{S3_REGION}.digitaloceanspaces.com/{object_name}"
         # For robustness let's just use standard AWS format or generic return if endpoint provided
         # Better Strategy: Generate Pre-signed URL or construct public URL? 
         # Let's assume Public Read ACL works.
         url = f"{S3_ENDPOINT_URL}/{S3_BUCKET_NAME}/{object_name}" # Very basic fallback
         
         # Better heuristic for non-AWS
         if "digitaloceanspaces" in S3_ENDPOINT_URL:
              url = f"https://{S3_BUCKET_NAME}.{S3_REGION}.digitaloceanspaces.com/{object_name}"
    else:
        url = f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{object_name}"
        
    return url
