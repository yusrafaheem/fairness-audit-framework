import sys
from pathlib import Path

# Allow `pytest` to find the `fairaudit` package without an editable
# install (useful for quick local runs / CI before `pip install -e .`).
sys.path.insert(0, str(Path(__file__).resolve().parent))
