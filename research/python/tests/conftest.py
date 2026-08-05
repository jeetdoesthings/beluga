"""Pytest configuration: add the beluga package to sys.path."""

import sys
from pathlib import Path

# Add research/python to sys.path so `import beluga` works.
_repo_root = Path(__file__).resolve().parent.parent
_python_root = _repo_root / "research" / "python"
if str(_python_root) not in sys.path:
    sys.path.insert(0, str(_python_root))