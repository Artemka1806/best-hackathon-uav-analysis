import sys
from pathlib import Path


# Add native module directory to path so the .so can be imported
_native_dir = str(Path(__file__).resolve().parent.parent / "native")
if _native_dir not in sys.path:
    sys.path.insert(0, _native_dir)