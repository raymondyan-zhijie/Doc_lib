from pydantic import BaseModel
from typing import Optional


class CatalogItem(BaseModel):
    week: str
    category: str
    cat_num: str
    filename: str
    work_path: str
    size: int
    date: str
    pages: Optional[int] = None
    lang: str
    ext: str
    source: str


class BatchExtractItem(BaseModel):
    work_path: str


class BatchExtractRequest(BaseModel):
    items: list[BatchExtractItem]
    target_dir: str


class BatchDeleteRequest(BaseModel):
    items: list[BatchExtractItem]


class FavoriteItem(BaseModel):
    filename: str
    work_path: str


class OpenRequest(BaseModel):
    work_path: str


class ExtractRequest(BaseModel):
    work_path: str
    target_dir: str = ""


class OpenDirRequest(BaseModel):
    path: str

